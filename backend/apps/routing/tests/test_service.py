"""Routing service cache behavior."""

from __future__ import annotations

import unittest
from collections import Counter
from unittest.mock import patch

from apps.routing.service import Coordinate, RoutingService


class FakeClient:
    def __init__(self, route: dict | None = None) -> None:
        self.geocode_calls: Counter[str] = Counter()
        self.route = route or {
            "summary": {"distance": 1609.344, "duration": 60},
            "geometry": "",
        }

    def geocode(self, text: str):
        self.geocode_calls[text] += 1
        return {
            "features": [
                {
                    "geometry": {"coordinates": [float(len(text)), 1.0]},
                    "properties": {"label": text},
                }
            ]
        }

    def directions(self, _coordinates):
        return {
            "routes": [self.route]
        }


class RequestLocalGeocodeCache(unittest.TestCase):
    def test_reuses_geocode_result_within_one_service_instance(self):
        client = FakeClient()
        service = RoutingService(client=client)

        service.plan("Chicago, IL", "Chicago, IL", "Denver, CO")

        self.assertEqual(client.geocode_calls["Chicago, IL"], 1)
        self.assertEqual(client.geocode_calls["Denver, CO"], 1)

    def test_cache_is_not_shared_between_service_instances(self):
        client = FakeClient()

        RoutingService(client=client).plan("Chicago, IL", "Chicago, IL", "Denver, CO")
        RoutingService(client=client).plan("Chicago, IL", "Chicago, IL", "Denver, CO")

        self.assertEqual(client.geocode_calls["Chicago, IL"], 2)
        self.assertEqual(client.geocode_calls["Denver, CO"], 2)


class RouteGeometryScaling(unittest.TestCase):
    def test_cumulative_miles_end_at_ors_summary_distance(self):
        client = FakeClient()
        service = RoutingService(client=client)

        with patch(
            "apps.routing.service._decode_polyline",
            return_value=[Coordinate(lat=0.0, lng=0.0), Coordinate(lat=0.0, lng=1.0)],
        ):
            route = service.plan("A", "B", "C")

        self.assertAlmostEqual(route.legs[0].cumulative_miles[-1], 1.0, places=6)


class RouteInstructions(unittest.TestCase):
    def test_flattens_ors_steps_onto_each_leg(self):
        client = FakeClient(
            route={
                "summary": {"distance": 1609.344, "duration": 60},
                "geometry": "",
                "segments": [
                    {
                        "steps": [
                            {
                                "instruction": "Head east on Main St",
                                "name": "Main St",
                                "distance": 804.7,
                                "duration": 30.2,
                                "type": 11,
                                "way_points": [0, 3],
                            },
                            {
                                "instruction": "Arrive at destination",
                                "distance": 804.6,
                                "duration": 29.8,
                                "type": 10,
                                "way_points": [3, 6],
                            },
                        ]
                    }
                ],
            }
        )
        service = RoutingService(client=client)

        route = service.plan("A", "B", "C")

        self.assertEqual(len(route.legs[0].steps), 2)
        self.assertEqual(route.legs[0].steps[0].instruction, "Head east on Main St")
        self.assertEqual(route.legs[0].steps[0].name, "Main St")
        self.assertEqual(route.legs[0].steps[0].type, 11)
        self.assertEqual(route.legs[0].steps[0].way_points, (0, 3))
        self.assertEqual(route.legs[0].steps[1].instruction, "Arrive at destination")


if __name__ == "__main__":
    unittest.main()
