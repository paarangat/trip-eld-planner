"""HOS scheduling algorithm.

Pure Python. Takes a planned route and the driver's current cycle hours and
returns a Timeline of duty segments compliant with the property-carrying
70/8 Hours-of-Service rules. See CLAUDE.md §7 for the correctness spec.

All time arithmetic is in **integer minutes** to avoid floating-point drift.
Hours are exposed only at the API boundary.

Deterministic constraint priority (CLAUDE.md §7):

    1. Cycle exhausted          → insert 34-hr restart
    2. 11-hr or 14-hr exhausted → insert 10-hr off-duty reset
    3. 8-hr cumulative driving  → insert 30-min break
    4. Reached fuel mile        → insert fuel stop
    5. Reached pickup / dropoff → insert 1-hr on-duty
    6. Otherwise                → keep driving

If two limits land at the same moment, the order above wins.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from apps.routing.service import (
    Coordinate,
    RouteLeg,
    TripRoute,
    coordinate_at_mile,
)

from .constants import (
    CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES,
    CYCLE_LIMIT_MINUTES,
    CYCLE_RESTART_MINUTES,
    DROPOFF_ON_DUTY_MINUTES,
    FUEL_INTERVAL_MILES,
    MAX_DRIVING_MINUTES,
    MAX_ON_DUTY_WINDOW_MINUTES,
    PICKUP_ON_DUTY_MINUTES,
    REQUIRED_BREAK_MINUTES,
    REQUIRED_OFF_DUTY_RESET_MINUTES,
)
from .models import DutySegment, DutyStatus, Location, StopKind, Timeline


FUEL_STOP_MINUTES = 30
"""Industry-standard duration for a fueling stop. Counts as on-duty not-driving."""


@dataclass
class _State:
    now: datetime
    cycle_minutes_used: int
    window_minutes_used: int = 0
    driving_minutes_in_shift: int = 0
    driving_minutes_since_break: int = 0
    miles_driven_total: float = 0.0
    next_fuel_at_miles: float = float(FUEL_INTERVAL_MILES)


def schedule_trip(
    route: TripRoute,
    current_cycle_hours: float,
    start_datetime: datetime,
) -> Timeline:
    """Walk the trip forward and produce a Timeline of duty segments.

    ``start_datetime`` must be timezone-aware. The driver begins at the start
    of leg 0 (current location) with ``current_cycle_hours`` already counted
    against the 70-hour cycle.
    """
    if start_datetime.tzinfo is None:
        raise ValueError("start_datetime must be timezone-aware")

    state = _State(
        now=start_datetime,
        cycle_minutes_used=round(current_cycle_hours * 60),
    )
    segments: list[DutySegment] = []

    if not route.legs:
        return Timeline(segments=segments, total_miles=0.0)

    # If the driver arrives with no cycle remaining, force a restart first.
    if state.cycle_minutes_used >= CYCLE_LIMIT_MINUTES:
        _insert_restart(segments, state, _leg_start_location(route.legs[0]))

    for leg_idx, leg in enumerate(route.legs):
        _drive_leg(segments, state, leg)
        end_location = _leg_end_location(leg)
        if leg_idx == 0:
            _insert_pickup(segments, state, end_location)
        else:
            _insert_dropoff(segments, state, end_location)

    return Timeline(segments=segments, total_miles=state.miles_driven_total)


# ---------------------------------------------------------------------------
# Driving loop
# ---------------------------------------------------------------------------


def _drive_leg(segments: list[DutySegment], state: _State, leg: RouteLeg) -> None:
    """Drive the full distance/duration of ``leg``, inserting events as required."""
    leg_total_miles = leg.distance_miles
    leg_total_minutes = max(1, round(leg.duration_seconds / 60))
    if leg_total_miles <= 0 or leg_total_minutes <= 0:
        return

    speed_miles_per_minute = leg_total_miles / leg_total_minutes
    minutes_driven_on_leg = 0
    miles_driven_on_leg = 0.0

    while minutes_driven_on_leg < leg_total_minutes:
        if _insert_due_event(
            segments, state, _location_on_leg(leg, miles_driven_on_leg)
        ):
            continue

        # Compute how long we can drive before any constraint triggers.
        minutes_to_window = MAX_ON_DUTY_WINDOW_MINUTES - state.window_minutes_used
        minutes_to_driving_limit = MAX_DRIVING_MINUTES - state.driving_minutes_in_shift
        minutes_to_break = (
            CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES - state.driving_minutes_since_break
        )
        minutes_to_cycle = CYCLE_LIMIT_MINUTES - state.cycle_minutes_used
        minutes_to_fuel = _minutes_to_next_fuel(state, speed_miles_per_minute)
        minutes_left_in_leg = leg_total_minutes - minutes_driven_on_leg

        drive_minutes = max(
            1,
            min(
                minutes_to_window,
                minutes_to_driving_limit,
                minutes_to_break,
                minutes_to_cycle,
                minutes_to_fuel,
                minutes_left_in_leg,
            ),
        )
        miles_this_chunk = drive_minutes * speed_miles_per_minute

        start_loc = _location_on_leg(leg, miles_driven_on_leg)
        _append_driving_segment(segments, state, start_loc, drive_minutes, miles_this_chunk)

        minutes_driven_on_leg += drive_minutes
        miles_driven_on_leg += miles_this_chunk

    while _insert_due_event(
        segments, state, _location_on_leg(leg, miles_driven_on_leg)
    ):
        pass


# ---------------------------------------------------------------------------
# Event insertion (each updates state consistently)
# ---------------------------------------------------------------------------


def _insert_due_event(
    segments: list[DutySegment], state: _State, location: Location
) -> bool:
    """Insert the highest-priority event due at the current point, if any."""
    if state.cycle_minutes_used >= CYCLE_LIMIT_MINUTES:
        _insert_restart(segments, state, location)
        return True
    if (
        state.driving_minutes_in_shift >= MAX_DRIVING_MINUTES
        or state.window_minutes_used >= MAX_ON_DUTY_WINDOW_MINUTES
    ):
        _insert_ten_hour_reset(segments, state, location)
        return True
    if state.driving_minutes_since_break >= CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES:
        _insert_thirty_min_break(segments, state, location)
        return True
    if _fuel_due(state):
        _insert_fuel_stop(segments, state, location)
        return True
    return False


def _append_driving_segment(
    segments: list[DutySegment],
    state: _State,
    location: Location,
    minutes: int,
    miles: float,
) -> None:
    end = state.now + timedelta(minutes=minutes)
    segments.append(
        DutySegment(
            status=DutyStatus.DRIVING,
            start=state.now,
            end=end,
            location=location,
            note="Driving",
            miles=miles,
        )
    )
    state.now = end
    state.window_minutes_used += minutes
    state.driving_minutes_in_shift += minutes
    state.driving_minutes_since_break += minutes
    state.cycle_minutes_used += minutes
    state.miles_driven_total += miles


def _insert_pickup(segments: list[DutySegment], state: _State, location: Location) -> None:
    _gate_on_duty_capacity(segments, state, location, PICKUP_ON_DUTY_MINUTES)
    _append_on_duty_segment(
        segments,
        state,
        location,
        minutes=PICKUP_ON_DUTY_MINUTES,
        note="Pickup",
        stop_kind=StopKind.PICKUP,
    )


def _insert_dropoff(segments: list[DutySegment], state: _State, location: Location) -> None:
    _gate_on_duty_capacity(segments, state, location, DROPOFF_ON_DUTY_MINUTES)
    _append_on_duty_segment(
        segments,
        state,
        location,
        minutes=DROPOFF_ON_DUTY_MINUTES,
        note="Drop-off",
        stop_kind=StopKind.DROPOFF,
    )


def _insert_fuel_stop(segments: list[DutySegment], state: _State, location: Location) -> None:
    _gate_on_duty_capacity(segments, state, location, FUEL_STOP_MINUTES)
    _append_on_duty_segment(
        segments,
        state,
        location,
        minutes=FUEL_STOP_MINUTES,
        note="Fuel stop",
        stop_kind=StopKind.FUEL,
    )
    state.next_fuel_at_miles += FUEL_INTERVAL_MILES


def _gate_on_duty_capacity(
    segments: list[DutySegment],
    state: _State,
    location: Location,
    minutes: int,
) -> None:
    """Ensure a non-driving on-duty segment will not exceed any active limit.

    The 70-hr cycle is the operative cap (it counts on-duty hours, not just
    driving). The 14-hr window does not block non-driving on-duty work — once
    the window expires the driver may still be on-duty, they just may not
    drive. CLAUDE.md §7: "Do not silently exceed the cycle."
    """
    if state.cycle_minutes_used + minutes > CYCLE_LIMIT_MINUTES:
        _insert_restart(segments, state, location)


def _insert_thirty_min_break(
    segments: list[DutySegment], state: _State, location: Location
) -> None:
    end = state.now + timedelta(minutes=REQUIRED_BREAK_MINUTES)
    segments.append(
        DutySegment(
            status=DutyStatus.OFF_DUTY,
            start=state.now,
            end=end,
            location=location,
            note="30-min break",
            stop_kind=StopKind.BREAK,
        )
    )
    state.now = end
    # The 14-hr window does NOT pause during off-duty under 10 hours.
    state.window_minutes_used += REQUIRED_BREAK_MINUTES
    state.driving_minutes_since_break = 0
    # Off-duty time does not consume the 70-hr cycle.


def _insert_ten_hour_reset(
    segments: list[DutySegment], state: _State, location: Location
) -> None:
    end = state.now + timedelta(minutes=REQUIRED_OFF_DUTY_RESET_MINUTES)
    segments.append(
        DutySegment(
            status=DutyStatus.OFF_DUTY,
            start=state.now,
            end=end,
            location=location,
            note="10-hr reset",
            stop_kind=StopKind.REST,
        )
    )
    state.now = end
    state.window_minutes_used = 0
    state.driving_minutes_in_shift = 0
    state.driving_minutes_since_break = 0
    # The 10-hr reset does NOT reset the 70-hr cycle — only a 34-hr restart does.


def _insert_restart(
    segments: list[DutySegment], state: _State, location: Location
) -> None:
    end = state.now + timedelta(minutes=CYCLE_RESTART_MINUTES)
    segments.append(
        DutySegment(
            status=DutyStatus.OFF_DUTY,
            start=state.now,
            end=end,
            location=location,
            note="34-hr restart",
            stop_kind=StopKind.RESTART,
        )
    )
    state.now = end
    state.cycle_minutes_used = 0
    state.window_minutes_used = 0
    state.driving_minutes_in_shift = 0
    state.driving_minutes_since_break = 0


def _append_on_duty_segment(
    segments: list[DutySegment],
    state: _State,
    location: Location,
    *,
    minutes: int,
    note: str,
    stop_kind: StopKind,
) -> None:
    end = state.now + timedelta(minutes=minutes)
    segments.append(
        DutySegment(
            status=DutyStatus.ON_DUTY_NOT_DRIVING,
            start=state.now,
            end=end,
            location=location,
            note=note,
            stop_kind=stop_kind,
        )
    )
    state.now = end
    state.window_minutes_used += minutes
    state.cycle_minutes_used += minutes
    # Any non-driving period ≥ 30 minutes satisfies the cumulative-break rule.
    if minutes >= REQUIRED_BREAK_MINUTES:
        state.driving_minutes_since_break = 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _minutes_to_next_fuel(state: _State, speed_miles_per_minute: float) -> int:
    miles_to_fuel = state.next_fuel_at_miles - state.miles_driven_total
    if miles_to_fuel <= 0 or speed_miles_per_minute <= 0:
        return 1
    return max(1, math.ceil(miles_to_fuel / speed_miles_per_minute))


def _fuel_due(state: _State) -> bool:
    return state.miles_driven_total + 0.001 >= state.next_fuel_at_miles


def _location_on_leg(leg: RouteLeg, miles_into_leg: float) -> Location:
    coord = coordinate_at_mile(leg, miles_into_leg)
    label = _leg_position_label(leg, miles_into_leg, coord)
    return Location(label=label, lat=coord.lat, lng=coord.lng)


def _leg_position_label(leg: RouteLeg, miles_into_leg: float, coord: Coordinate) -> str:
    if miles_into_leg <= 0.5:
        return leg.start.resolved_label
    if miles_into_leg >= leg.distance_miles - 0.5:
        return leg.end.resolved_label
    return f"En route ({coord.lat:.3f}, {coord.lng:.3f})"


def _leg_start_location(leg: RouteLeg) -> Location:
    coord = leg.start.coordinate
    return Location(label=leg.start.resolved_label, lat=coord.lat, lng=coord.lng)


def _leg_end_location(leg: RouteLeg) -> Location:
    coord = leg.end.coordinate
    return Location(label=leg.end.resolved_label, lat=coord.lat, lng=coord.lng)
