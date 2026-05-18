"""Table-driven HOS engine tests — covers the scenarios in CLAUDE.md §10."""

from __future__ import annotations

import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from apps.hos.constants import (
    CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES,
    CYCLE_LIMIT_MINUTES,
    MAX_DRIVING_MINUTES,
    MAX_ON_DUTY_WINDOW_MINUTES,
)
from apps.hos.engine import schedule_trip
from apps.hos.models import DutyStatus, StopKind
from apps.routing.service import Coordinate, GeocodedPlace, RouteLeg, TripRoute


TZ = ZoneInfo("America/Chicago")
START = datetime(2026, 6, 1, 6, 0, tzinfo=TZ)


def _place(label: str, lat: float = 0.0, lng: float = 0.0) -> GeocodedPlace:
    return GeocodedPlace(query=label, resolved_label=label, coordinate=Coordinate(lat=lat, lng=lng))


def _leg(start_label: str, end_label: str, miles: float, hours: float) -> RouteLeg:
    start = _place(start_label)
    end = _place(end_label)
    polyline = [start.coordinate, end.coordinate]
    return RouteLeg(
        start=start,
        end=end,
        distance_meters=miles * 1609.344,
        duration_seconds=hours * 3600,
        polyline=polyline,
        cumulative_miles=[0.0, miles],
    )


def _route(legs: list[RouteLeg]) -> TripRoute:
    return TripRoute(legs=legs)


class ShortSameDayTrip(unittest.TestCase):
    def test_no_break_no_reset_no_fuel(self):
        route = _route(
            [
                _leg("A", "B", miles=100, hours=2.0),
                _leg("B", "C", miles=100, hours=2.0),
            ]
        )
        timeline = schedule_trip(route, current_cycle_hours=0.0, start_datetime=START)
        notes = {seg.note for seg in timeline.segments}

        self.assertIn("Pickup", notes)
        self.assertIn("Drop-off", notes)
        self.assertNotIn("30-min break", notes)
        self.assertNotIn("10-hr reset", notes)
        self.assertNotIn("Fuel stop", notes)
        self.assertAlmostEqual(timeline.total_miles, 200.0, places=1)


class ThirtyMinBreakRequired(unittest.TestCase):
    def test_break_inserted_after_eight_hours_of_driving(self):
        route = _route(
            [
                _leg("A", "B", miles=10, hours=0.25),
                _leg("B", "C", miles=550, hours=10.0),
            ]
        )
        timeline = schedule_trip(route, current_cycle_hours=0.0, start_datetime=START)
        break_segs = [s for s in timeline.segments if s.stop_kind is StopKind.BREAK]
        self.assertEqual(len(break_segs), 1)
        self.assertEqual(break_segs[0].duration_minutes, 30)


class ElevenHourLimitTriggersTenHourReset(unittest.TestCase):
    def test_long_trip_inserts_reset(self):
        route = _route(
            [
                _leg("A", "B", miles=10, hours=0.25),
                _leg("B", "C", miles=900, hours=16.0),
            ]
        )
        timeline = schedule_trip(route, current_cycle_hours=0.0, start_datetime=START)
        rests = [s for s in timeline.segments if s.stop_kind is StopKind.REST]
        self.assertGreaterEqual(len(rests), 1)
        self.assertEqual(rests[0].duration_minutes, 600)


class CycleExhaustionTriggersRestart(unittest.TestCase):
    def test_driver_starting_with_high_cycle_hours_gets_restart(self):
        route = _route(
            [
                _leg("A", "B", miles=10, hours=0.25),
                _leg("B", "C", miles=200, hours=4.0),
            ]
        )
        timeline = schedule_trip(route, current_cycle_hours=68.0, start_datetime=START)
        restarts = [s for s in timeline.segments if s.stop_kind is StopKind.RESTART]
        self.assertGreaterEqual(len(restarts), 1)
        self.assertEqual(restarts[0].duration_minutes, 34 * 60)


class FuelStopPlacement(unittest.TestCase):
    def test_fuel_stop_at_first_1000_miles(self):
        route = _route(
            [
                _leg("A", "B", miles=10, hours=0.25),
                _leg("B", "C", miles=1200, hours=22.0),
            ]
        )
        timeline = schedule_trip(route, current_cycle_hours=0.0, start_datetime=START)
        fuels = [s for s in timeline.segments if s.stop_kind is StopKind.FUEL]
        self.assertGreaterEqual(len(fuels), 1)


class TieBreakingPrecedence(unittest.TestCase):
    """Verify the deterministic priority documented in engine.py."""

    def test_cycle_exhausted_at_dropoff_inserts_restart_first(self):
        # current_cycle_hours = 69.5 leaves 30 min on the cycle. Short legs
        # (15 min driving each) consume some but the dropoff (60 min) would
        # push the cycle past 70 hr — engine must insert a 34-hr restart
        # before that on-duty segment.
        route = _route(
            [
                _leg("A", "B", miles=10, hours=0.25),
                _leg("B", "C", miles=10, hours=0.25),
            ]
        )
        timeline = schedule_trip(route, current_cycle_hours=69.5, start_datetime=START)
        notes = [seg.note for seg in timeline.segments]
        # A restart must appear before the Drop-off.
        self.assertIn("34-hr restart", notes)
        self.assertLess(notes.index("34-hr restart"), notes.index("Drop-off"))

    def test_eleven_hour_limit_takes_precedence_over_break(self):
        # Drive a long leg. After the 8-hr break and then 3 more hours driving,
        # the engine reaches the 11-hr cap. The next inserted event must be a
        # 10-hr reset, not a second 30-min break — even though the driver has
        # also accumulated 3 hr since the last break.
        route = _route(
            [
                _leg("A", "B", miles=5, hours=0.05),
                _leg("B", "C", miles=700, hours=12.0),
            ]
        )
        timeline = schedule_trip(route, current_cycle_hours=0.0, start_datetime=START)
        notes = [seg.note for seg in timeline.segments]
        # The first 30-min break appears, then later the 10-hr reset — no
        # second break should land between them.
        first_break_idx = notes.index("30-min break")
        first_reset_idx = notes.index("10-hr reset")
        between = notes[first_break_idx + 1 : first_reset_idx]
        self.assertNotIn("30-min break", between)

    def test_break_takes_precedence_over_fuel_at_exact_tie(self):
        route = _route([_leg("A", "B", miles=1000, hours=8.0)])
        timeline = schedule_trip(route, current_cycle_hours=0.0, start_datetime=START)
        notes = [seg.note for seg in timeline.segments]

        self.assertLess(notes.index("30-min break"), notes.index("Fuel stop"))
        self.assertLess(notes.index("Fuel stop"), notes.index("Pickup"))

    def test_ten_hour_reset_takes_precedence_over_fuel_at_exact_tie(self):
        route = _route([_leg("A", "B", miles=1000, hours=11.0)])
        timeline = schedule_trip(route, current_cycle_hours=0.0, start_datetime=START)
        notes = [seg.note for seg in timeline.segments]

        first_break_idx = notes.index("30-min break")
        first_reset_idx = notes.index("10-hr reset")
        first_fuel_idx = notes.index("Fuel stop")
        self.assertLess(first_break_idx, first_reset_idx)
        self.assertLess(first_reset_idx, first_fuel_idx)


class ConstraintsRespected(unittest.TestCase):
    """Walk the timeline manually and verify no limit is exceeded between resets."""

    def test_no_constraint_exceeded(self):
        route = _route(
            [
                _leg("A", "B", miles=10, hours=0.25),
                _leg("B", "C", miles=2200, hours=40.0),
            ]
        )
        timeline = schedule_trip(route, current_cycle_hours=0.0, start_datetime=START)

        cycle_used = 0
        window = 0
        driving_in_shift = 0
        cumulative_drive_since_break = 0

        for seg in timeline.segments:
            minutes = seg.duration_minutes
            if seg.note == "10-hr reset":
                window = driving_in_shift = cumulative_drive_since_break = 0
                continue
            if seg.note == "34-hr restart":
                cycle_used = window = driving_in_shift = cumulative_drive_since_break = 0
                continue
            if seg.status is DutyStatus.DRIVING:
                window += minutes
                driving_in_shift += minutes
                cumulative_drive_since_break += minutes
                cycle_used += minutes
            elif seg.status is DutyStatus.ON_DUTY_NOT_DRIVING:
                window += minutes
                cycle_used += minutes
                if minutes >= 30:
                    cumulative_drive_since_break = 0
            elif seg.status is DutyStatus.OFF_DUTY:
                window += minutes
                if minutes >= 30:
                    cumulative_drive_since_break = 0

            self.assertLessEqual(driving_in_shift, MAX_DRIVING_MINUTES)
            self.assertLessEqual(window, MAX_ON_DUTY_WINDOW_MINUTES)
            self.assertLessEqual(cumulative_drive_since_break, CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES)
            self.assertLessEqual(cycle_used, CYCLE_LIMIT_MINUTES)


if __name__ == "__main__":
    unittest.main()
