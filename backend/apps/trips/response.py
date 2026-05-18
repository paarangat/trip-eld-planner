"""Shape the computed trip into the JSON response.

The API contract lives in ARCHITECTURE.md §8. This module is the single place
that knows how to translate routing + HOS + ELD output into the wire format —
keeping ``views.py`` thin and ``models.py`` decoupled from the wire shape.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from apps.eld.models import DailyLog, LogSegment
from apps.hos.models import DutyStatus, StopKind, Timeline
from apps.routing.service import Coordinate, RouteLeg, TripRoute


SECONDS_PER_HOUR = 3600


def build_trip_response(
    *,
    trip_id: str,
    inputs: dict[str, Any],
    route: TripRoute,
    timeline: Timeline,
    daily_logs: list[DailyLog],
    start_datetime: datetime,
) -> dict[str, Any]:
    home_terminal_timezone = _timezone_name(start_datetime)
    return {
        "id": trip_id,
        "home_terminal_timezone": home_terminal_timezone,
        "inputs": {
            "current_location": inputs["current_location"],
            "pickup_location": inputs["pickup_location"],
            "dropoff_location": inputs["dropoff_location"],
            "current_cycle_hours": float(inputs["current_cycle_hours"]),
            "start_datetime": start_datetime.isoformat(),
            "home_terminal_timezone": home_terminal_timezone,
        },
        "summary": {
            "total_miles": round(timeline.total_miles, 1),
            "total_drive_hours": round(
                _total_minutes_by_status(timeline, DutyStatus.DRIVING) / 60, 2
            ),
            "total_on_duty_hours": round(
                (
                    _total_minutes_by_status(timeline, DutyStatus.DRIVING)
                    + _total_minutes_by_status(timeline, DutyStatus.ON_DUTY_NOT_DRIVING)
                )
                / 60,
                2,
            ),
            "days": len(daily_logs),
        },
        "route": {
            "legs": [_serialize_leg(leg) for leg in route.legs],
            "places": [
                _serialize_place(route.legs[0].start),
                _serialize_place(route.legs[0].end),
                _serialize_place(route.legs[-1].end),
            ],
        },
        "stops": _serialize_stops(timeline),
        "daily_logs": [
            _serialize_daily_log(log, home_terminal_timezone) for log in daily_logs
        ],
    }


# ---------------------------------------------------------------------------
# Serializers (dict, not DRF — the model is dataclass-based)
# ---------------------------------------------------------------------------


def _serialize_leg(leg: RouteLeg) -> dict[str, Any]:
    return {
        "from": leg.start.resolved_label,
        "to": leg.end.resolved_label,
        "distance_miles": round(leg.distance_miles, 1),
        "duration_hours": round(leg.duration_seconds / SECONDS_PER_HOUR, 2),
        "polyline": [[pt.lat, pt.lng] for pt in leg.polyline],
    }


def _serialize_place(place) -> dict[str, Any]:
    return {
        "query": place.query,
        "label": place.resolved_label,
        "lat": place.coordinate.lat,
        "lng": place.coordinate.lng,
    }


def _serialize_stops(timeline: Timeline) -> list[dict[str, Any]]:
    stops: list[dict[str, Any]] = []
    for segment in timeline.segments:
        if segment.stop_kind is None or segment.stop_kind == StopKind.START:
            continue
        stops.append(
            {
                "kind": segment.stop_kind.value,
                "label": segment.location.label,
                "lat": segment.location.lat,
                "lng": segment.location.lng,
                "start": segment.start.isoformat(),
                "end": segment.end.isoformat(),
                "note": segment.note,
            }
        )
    return stops


def _serialize_daily_log(log: DailyLog, home_terminal_timezone: str) -> dict[str, Any]:
    return {
        "date": log.log_date.isoformat(),
        "home_terminal_timezone": home_terminal_timezone,
        "segments": [_serialize_log_segment(seg) for seg in log.segments],
        "totals": {
            "off_duty_minutes": log.total_off_duty_minutes,
            "sleeper_minutes": log.total_sleeper_minutes,
            "driving_minutes": log.total_driving_minutes,
            "on_duty_minutes": log.total_on_duty_minutes,
        },
        "total_miles": round(log.total_miles, 1),
        "remarks": [
            {"time": remark.time.isoformat(), "location": remark.location}
            for remark in log.remarks
        ],
    }


def _serialize_log_segment(seg: LogSegment) -> dict[str, Any]:
    return {
        "status": seg.status.value,
        "start": seg.start.isoformat(),
        "end": seg.end.isoformat(),
        "start_minute_of_day": _minute_of_day(seg.start),
        "end_minute_of_day": _minute_of_day_inclusive_end(seg.start, seg.end),
        "location": seg.location.label,
        "note": seg.note,
        "miles": round(seg.miles, 1),
        "stop_kind": seg.stop_kind.value if seg.stop_kind else None,
    }


def _minute_of_day(moment: datetime) -> int:
    return moment.hour * 60 + moment.minute


def _timezone_name(moment: datetime) -> str:
    return (
        getattr(moment.tzinfo, "key", None)
        or moment.tzname()
        or "America/Chicago"
    )


def _minute_of_day_inclusive_end(start: datetime, end: datetime) -> int:
    """End-of-day clipping: if a segment ends exactly at 00:00 next day, treat it as 24*60.

    This keeps SVG rendering simple — the frontend uses minute-of-day to position
    segments on a 0..1440 axis.
    """
    if end.date() != start.date():
        return 24 * 60
    return end.hour * 60 + end.minute


def _total_minutes_by_status(timeline: Timeline, status: DutyStatus) -> int:
    return sum(
        seg.duration_minutes for seg in timeline.segments if seg.status is status
    )
