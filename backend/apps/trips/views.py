"""HTTP layer. Views orchestrate; serializers validate."""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.eld.builder import build_daily_logs
from apps.hos.engine import schedule_trip
from apps.routing.client import ORSClientError
from apps.routing.service import RoutingError, RoutingService

from .models import Trip
from .response import build_trip_response
from .serializers import TripCreateSerializer


logger = logging.getLogger(__name__)


HOME_TERMINAL_TZ = ZoneInfo("America/Chicago")
"""Fixed home-terminal timezone for log sheets. FMCSA keeps logs in one zone."""

DEFAULT_TRIP_START_HOUR = 6
"""All trips start at 06:00 home-terminal time on the request date."""


@api_view(["GET"])
def health(_request):
    return Response({"status": "ok"})


class TripCreateView(APIView):
    """POST /api/trips/ — computes the route + HOS schedule + daily logs."""

    def post(self, request):
        serializer = TripCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        inputs = serializer.validated_data

        try:
            route = RoutingService().plan(
                current_location=inputs["current_location"],
                pickup_location=inputs["pickup_location"],
                dropoff_location=inputs["dropoff_location"],
            )
        except RoutingError as exc:
            logger.warning("Routing failed: %s", exc)
            return _error(status.HTTP_400_BAD_REQUEST, "routing_failed", str(exc))
        except ORSClientError as exc:
            logger.error("ORS upstream failure: %s", exc)
            return _error(
                status.HTTP_502_BAD_GATEWAY,
                "routing_upstream_failed",
                "Routing provider is unavailable. Please try again.",
            )

        start = _default_start_datetime()
        timeline = schedule_trip(
            route=route,
            current_cycle_hours=float(inputs["current_cycle_hours"]),
            start_datetime=start,
        )
        daily_logs = build_daily_logs(timeline)

        trip = Trip.objects.create(
            current_location=inputs["current_location"],
            pickup_location=inputs["pickup_location"],
            dropoff_location=inputs["dropoff_location"],
            current_cycle_hours=inputs["current_cycle_hours"],
            result={},
        )
        payload = build_trip_response(
            trip_id=trip.id,
            inputs=inputs,
            route=route,
            timeline=timeline,
            daily_logs=daily_logs,
            start_datetime=start,
        )
        trip.result = payload
        trip.save(update_fields=["result"])

        logger.info(
            "trip.computed trip_id=%s miles=%.1f days=%d",
            trip.id,
            payload["summary"]["total_miles"],
            payload["summary"]["days"],
        )
        return Response(payload, status=status.HTTP_201_CREATED)


class TripDetailView(APIView):
    """GET /api/trips/{id}/ — returns the cached computed payload."""

    def get(self, _request, pk: str):
        try:
            trip = Trip.objects.get(pk=pk)
        except Trip.DoesNotExist:
            return _error(status.HTTP_404_NOT_FOUND, "not_found", "Trip not found")
        if not trip.result:
            return _error(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "result_missing",
                "Trip result is unavailable.",
            )
        return Response(trip.result)


def _default_start_datetime() -> datetime:
    """The next 06:00 home-terminal time after the request — keeps schedules
    in the future regardless of when the user submits."""
    now = datetime.now(tz=HOME_TERMINAL_TZ)
    candidate = datetime.combine(
        now.date(), time(hour=DEFAULT_TRIP_START_HOUR), tzinfo=HOME_TERMINAL_TZ
    )
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate


def _error(http_status: int, code: str, message: str) -> Response:
    return Response(
        {"error": {"code": code, "message": message}}, status=http_status
    )
