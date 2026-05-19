"""Shape the computed trip into the JSON response.

The API contract lives in ARCHITECTURE.md §8. This module is the single place
that knows how to translate routing + HOS + ELD output into the wire format -
keeping ``views.py`` thin and ``models.py`` decoupled from the wire shape.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from apps.eld.models import DailyLog, LogSegment
from apps.hos.clocks import (
    ClockSnapshot,
    HOSClocks,
    compute_clocks_for_logs,
    compute_timeline_clocks,
)
from apps.hos.constants import CYCLE_LIMIT_MINUTES
from apps.hos.models import DutyStatus, StopKind, Timeline
from apps.routing.service import RouteLeg, RouteStep, TripRoute


SECONDS_PER_HOUR = 3600
MINUTES_PER_HOUR = 60


def build_trip_list_response(
    trips,
    *,
    include_logs: bool = False,
) -> list[dict[str, Any]]:
    """Return lightweight trip records for list screens.

    ``Trip.result`` remains the source of truth for computed fields. The list
    shape intentionally avoids route geometry and clock snapshots because those
    payloads are large and are only needed on the detail screen.
    """
    items: list[dict[str, Any]] = []
    for trip in trips:
        result = trip.result or {}
        summary = result.get("summary") or {}
        daily_logs = result.get("daily_logs") or []
        item = {
            "id": trip.id,
            "inputs": result.get("inputs")
            or {
                "current_location": trip.current_location,
                "pickup_location": trip.pickup_location,
                "dropoff_location": trip.dropoff_location,
                "current_cycle_hours": float(trip.current_cycle_hours),
            },
            "summary": summary,
            "home_terminal_timezone": result.get("home_terminal_timezone"),
            "created_at": trip.created_at.isoformat(),
            "daily_log_dates": [
                log["date"]
                for log in daily_logs
                if isinstance(log, dict) and log.get("date")
            ],
        }
        if include_logs:
            item["daily_logs"] = daily_logs
        items.append(item)
    return items


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
    current_cycle_hours = float(inputs["current_cycle_hours"])
    snapshots = compute_timeline_clocks(
        timeline=timeline, current_cycle_hours=current_cycle_hours
    )
    return {
        "id": trip_id,
        "home_terminal_timezone": home_terminal_timezone,
        "inputs": {
            "current_location": inputs["current_location"],
            "pickup_location": inputs["pickup_location"],
            "dropoff_location": inputs["dropoff_location"],
            "current_cycle_hours": current_cycle_hours,
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
            "trip_start": timeline.segments[0].start.isoformat()
            if timeline.segments
            else start_datetime.isoformat(),
            "trip_end": timeline.segments[-1].end.isoformat()
            if timeline.segments
            else start_datetime.isoformat(),
            "projected_end_cycle_hours": _projected_end_cycle_hours(snapshots),
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
        "daily_logs": _serialize_daily_logs(
            daily_logs,
            home_terminal_timezone=home_terminal_timezone,
            current_cycle_hours=current_cycle_hours,
        ),
        "clock_snapshots": [_serialize_snapshot(snap) for snap in snapshots],
    }


def _projected_end_cycle_hours(snapshots: list[ClockSnapshot]) -> float:
    """Hours of the 70-hr cycle used at the very end of the trip.

    Used by the frontend to pre-fill ``current_cycle_hours`` on the next trip
    so the cycle counter is continuous instead of being re-entered manually.
    """
    if not snapshots:
        return 0.0
    final_cycle_left = snapshots[-1].clocks.cycle_left_minutes
    used_minutes = max(0, CYCLE_LIMIT_MINUTES - final_cycle_left)
    return round(used_minutes / MINUTES_PER_HOUR, 2)


def _serialize_snapshot(snapshot: ClockSnapshot) -> dict[str, Any]:
    return {
        "at": snapshot.at.isoformat(),
        "drive_left_minutes": snapshot.clocks.drive_left_minutes,
        "window_left_minutes": snapshot.clocks.window_left_minutes,
        "break_left_minutes": snapshot.clocks.break_left_minutes,
        "cycle_left_minutes": snapshot.clocks.cycle_left_minutes,
    }


def _serialize_daily_logs(
    daily_logs: list[DailyLog],
    *,
    home_terminal_timezone: str,
    current_cycle_hours: float,
) -> list[dict[str, Any]]:
    """Serialize the per-day logs, attaching the four HOS clocks to each.

    The clock helper walks logs in order and carries state across midnight, so
    split 10-hour rests and 34-hour restarts are reflected in the serialized
    clocks.
    """
    clocks_by_date = compute_clocks_for_logs(
        daily_logs, current_cycle_hours=current_cycle_hours
    )
    return [
        _serialize_daily_log(log, home_terminal_timezone, clocks_by_date[log.log_date])
        for log in daily_logs
    ]


# ---------------------------------------------------------------------------
# Serializers (dict, not DRF - the model is dataclass-based)
# ---------------------------------------------------------------------------


def _serialize_leg(leg: RouteLeg) -> dict[str, Any]:
    return {
        "from": leg.start.resolved_label,
        "to": leg.end.resolved_label,
        "distance_miles": round(leg.distance_miles, 1),
        "duration_hours": round(leg.duration_seconds / SECONDS_PER_HOUR, 2),
        "polyline": [[pt.lat, pt.lng] for pt in leg.polyline],
        "steps": [_serialize_route_step(step) for step in leg.steps],
    }


def _serialize_route_step(step: RouteStep) -> dict[str, Any]:
    return {
        "instruction": step.instruction,
        "name": step.name,
        "distance_meters": round(step.distance_meters, 1),
        "duration_seconds": round(step.duration_seconds),
        "type": step.type,
        "way_points": list(step.way_points),
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


def _serialize_daily_log(
    log: DailyLog, home_terminal_timezone: str, clocks: HOSClocks
) -> dict[str, Any]:
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
        "hos_clocks": {
            "drive_left_minutes": clocks.drive_left_minutes,
            "window_left_minutes": clocks.window_left_minutes,
            "break_left_minutes": clocks.break_left_minutes,
            "cycle_left_minutes": clocks.cycle_left_minutes,
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

    This keeps SVG rendering simple - the frontend uses minute-of-day to position
    segments on a 0..1440 axis.
    """
    if end.date() != start.date():
        return 24 * 60
    return end.hour * 60 + end.minute


def _total_minutes_by_status(timeline: Timeline, status: DutyStatus) -> int:
    return sum(
        seg.duration_minutes for seg in timeline.segments if seg.status is status
    )
