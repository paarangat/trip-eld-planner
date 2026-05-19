"""Trip API contract tests.

These cover the Django/DRF layer around the pure routing, HOS, and ELD code so
the portfolio app proves both domain correctness and HTTP behavior.
"""

from __future__ import annotations

from unittest.mock import patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.routing.client import ORSClientError
from apps.routing.service import Coordinate, GeocodedPlace, RouteLeg, RoutingError, TripRoute
from apps.trips.models import Trip


def _place(label: str) -> GeocodedPlace:
    return GeocodedPlace(
        query=label,
        resolved_label=label,
        coordinate=Coordinate(lat=41.0, lng=-87.0),
    )


def _leg(start_label: str, end_label: str, miles: float, hours: float) -> RouteLeg:
    start = _place(start_label)
    end = _place(end_label)
    return RouteLeg(
        start=start,
        end=end,
        distance_meters=miles * 1609.344,
        duration_seconds=hours * 3600,
        polyline=[start.coordinate, end.coordinate],
        cumulative_miles=[0.0, miles],
    )


def _route() -> TripRoute:
    return TripRoute(
        legs=[
            _leg("Chicago, IL", "Dallas, TX", miles=100.0, hours=2.0),
            _leg("Dallas, TX", "Denver, CO", miles=100.0, hours=2.0),
        ]
    )


def _payload() -> dict[str, object]:
    return {
        "current_location": " Chicago, IL ",
        "pickup_location": " Dallas, TX ",
        "dropoff_location": " Denver, CO ",
        "current_cycle_hours": 4.25,
    }


class TripApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    @patch("apps.trips.views.RoutingService")
    def test_create_trip_returns_cached_result(self, service_cls) -> None:
        service_cls.return_value.plan.return_value = _route()

        response = self.client.post("/api/trips/", _payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        body = response.json()
        self.assertTrue(body["id"])
        self.assertEqual(body["inputs"]["current_location"], "Chicago, IL")
        self.assertEqual(body["summary"]["total_miles"], 200.0)
        self.assertGreaterEqual(len(body["daily_logs"]), 1)
        self.assertEqual(Trip.objects.count(), 1)
        self.assertEqual(Trip.objects.get().result["id"], body["id"])

    @patch("apps.trips.views.RoutingService")
    def test_create_trip_maps_geocoding_failure_to_400(self, service_cls) -> None:
        service_cls.return_value.plan.side_effect = RoutingError("Could not geocode")

        response = self.client.post("/api/trips/", _payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.json()["error"]["code"], "routing_failed")
        self.assertEqual(Trip.objects.count(), 0)

    @patch("apps.trips.views.RoutingService")
    def test_create_trip_maps_upstream_failure_to_502(self, service_cls) -> None:
        service_cls.return_value.plan.side_effect = ORSClientError("timeout")

        response = self.client.post("/api/trips/", _payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.json()["error"]["code"], "routing_upstream_failed")
        self.assertEqual(Trip.objects.count(), 0)

    def test_detail_returns_cached_result(self) -> None:
        trip = Trip.objects.create(
            current_location="A",
            pickup_location="B",
            dropoff_location="C",
            current_cycle_hours=1.0,
            result={"id": "trip-a", "summary": {"total_miles": 12.0}},
        )

        response = self.client.get(f"/api/trips/{trip.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["summary"]["total_miles"], 12.0)

    def test_list_returns_summaries_without_large_detail_payloads(self) -> None:
        Trip.objects.create(
            current_location="A",
            pickup_location="B",
            dropoff_location="C",
            current_cycle_hours=1.0,
            result={
                "id": "trip-a",
                "inputs": {"current_location": "A", "pickup_location": "B", "dropoff_location": "C"},
                "summary": {"total_miles": 12.0},
                "route": {"legs": [{"polyline": [[1, 2]]}]},
                "daily_logs": [{"date": "2026-06-01", "segments": []}],
            },
        )

        response = self.client.get("/api/trips/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.json()["results"][0]
        self.assertEqual(item["summary"]["total_miles"], 12.0)
        self.assertEqual(item["daily_log_dates"], ["2026-06-01"])
        self.assertNotIn("route", item)
        self.assertNotIn("daily_logs", item)

    def test_list_can_include_logs_for_calendar_screen(self) -> None:
        Trip.objects.create(
            current_location="A",
            pickup_location="B",
            dropoff_location="C",
            current_cycle_hours=1.0,
            result={
                "id": "trip-a",
                "summary": {"total_miles": 12.0},
                "daily_logs": [{"date": "2026-06-01", "segments": []}],
            },
        )

        response = self.client.get("/api/trips/?include=logs")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["results"][0]["daily_logs"][0]["date"], "2026-06-01")

    def test_list_filters_and_preserves_requested_id_order(self) -> None:
        first = Trip.objects.create(
            current_location="A",
            pickup_location="B",
            dropoff_location="C",
            current_cycle_hours=1.0,
            result={"id": "first", "summary": {}},
        )
        second = Trip.objects.create(
            current_location="D",
            pickup_location="E",
            dropoff_location="F",
            current_cycle_hours=1.0,
            result={"id": "second", "summary": {}},
        )

        response = self.client.get(f"/api/trips/?ids={second.id},{first.id},missing")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["id"] for item in response.json()["results"]],
            [second.id, first.id],
        )
