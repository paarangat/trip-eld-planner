"""Unit tests for the per-day HOS remaining-time clocks.

Pure-function table-driven tests, in the style of ``test_engine.py``.
Covers the scenarios called out in CLAUDE.md §10 — short trip, break reset,
cycle accumulation across days, and the high-starting-cycle edge case.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apps.eld.models import LogSegment
from apps.hos.clocks import compute_clocks
from apps.hos.constants import (
    CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES,
    CYCLE_LIMIT_MINUTES,
    MAX_DRIVING_MINUTES,
    MAX_ON_DUTY_WINDOW_MINUTES,
)
from apps.hos.models import DutyStatus, Location


TZ = ZoneInfo("America/Chicago")
DAY = datetime(2026, 6, 1, 0, 0, tzinfo=TZ)
DEPOT = Location(label="Depot", lat=0.0, lng=0.0)


def _seg(status: DutyStatus, start_minute: int, duration_minutes: int) -> LogSegment:
    start = DAY + timedelta(minutes=start_minute)
    end = start + timedelta(minutes=duration_minutes)
    return LogSegment(
        status=status,
        start=start,
        end=end,
        location=DEPOT,
        note="",
        miles=0.0,
        stop_kind=None,
    )


class FourHourDriveBreakFourHourDrive(unittest.TestCase):
    """4h driving, 30-min off-duty, 4h driving on a single day."""

    def setUp(self):
        # Day starts at 06:00 → driving 06:00–10:00, off-duty 10:00–10:30,
        # driving 10:30–14:30. No on-duty-not-driving.
        self.segments = [
            _seg(DutyStatus.DRIVING, start_minute=360, duration_minutes=240),
            _seg(DutyStatus.OFF_DUTY, start_minute=600, duration_minutes=30),
            _seg(DutyStatus.DRIVING, start_minute=630, duration_minutes=240),
        ]

    def test_drive_left_is_eleven_minus_eight_hours(self):
        clocks = compute_clocks(
            segments=self.segments,
            prior_on_duty_plus_drive_minutes=0,
            current_cycle_hours=0.0,
        )
        self.assertEqual(clocks.drive_left_minutes, MAX_DRIVING_MINUTES - 8 * 60)
        self.assertEqual(clocks.drive_left_minutes, 3 * 60)

    def test_break_left_resets_to_full_eight_hours_after_qualifying_break(self):
        clocks = compute_clocks(
            segments=self.segments,
            prior_on_duty_plus_drive_minutes=0,
            current_cycle_hours=0.0,
        )
        # 4 h drove since the qualifying 30-min break → 8h - 4h = 4h remaining.
        self.assertEqual(clocks.break_left_minutes, 4 * 60)

    def test_window_left_is_fourteen_minus_elapsed_wall_clock(self):
        clocks = compute_clocks(
            segments=self.segments,
            prior_on_duty_plus_drive_minutes=0,
            current_cycle_hours=0.0,
        )
        # First on-duty/driving segment starts 06:00, last ends 14:30 →
        # elapsed 8h30m on the 14-hour window.
        elapsed = 8 * 60 + 30
        self.assertEqual(
            clocks.window_left_minutes, MAX_ON_DUTY_WINDOW_MINUTES - elapsed
        )

    def test_cycle_left_subtracts_drive_and_on_duty_minutes(self):
        clocks = compute_clocks(
            segments=self.segments,
            prior_on_duty_plus_drive_minutes=0,
            current_cycle_hours=0.0,
        )
        # 8h driving, 0h on-duty-not-driving, 0h prior, 0h starting cycle.
        used = 8 * 60
        self.assertEqual(clocks.cycle_left_minutes, CYCLE_LIMIT_MINUTES - used)

    def test_cycle_left_accounts_for_starting_cycle_hours(self):
        clocks = compute_clocks(
            segments=self.segments,
            prior_on_duty_plus_drive_minutes=0,
            current_cycle_hours=10.0,
        )
        used = 10 * 60 + 8 * 60
        self.assertEqual(clocks.cycle_left_minutes, CYCLE_LIMIT_MINUTES - used)


class CycleAccumulatesAcrossDays(unittest.TestCase):
    def test_day_two_cycle_includes_day_one_on_duty_minutes(self):
        # Day 2 segments: 5h driving.
        day_two = [_seg(DutyStatus.DRIVING, start_minute=360, duration_minutes=300)]
        # Day 1 used 10 h of (drive + on-duty-not-driving).
        prior = 10 * 60

        clocks = compute_clocks(
            segments=day_two,
            prior_on_duty_plus_drive_minutes=prior,
            current_cycle_hours=2.0,
        )

        # Starting cycle (2h) + day-1 prior (10h) + day-2 today (5h) = 17h used.
        used = 2 * 60 + 10 * 60 + 5 * 60
        self.assertEqual(clocks.cycle_left_minutes, CYCLE_LIMIT_MINUTES - used)


class NoOnDutyYet(unittest.TestCase):
    def test_window_left_is_full_when_no_on_duty_segments(self):
        # Off-duty all day — the 14-hour window has not started.
        segments = [_seg(DutyStatus.OFF_DUTY, start_minute=0, duration_minutes=1440)]
        clocks = compute_clocks(
            segments=segments,
            prior_on_duty_plus_drive_minutes=0,
            current_cycle_hours=0.0,
        )
        self.assertEqual(clocks.window_left_minutes, MAX_ON_DUTY_WINDOW_MINUTES)
        self.assertEqual(clocks.drive_left_minutes, MAX_DRIVING_MINUTES)
        self.assertEqual(
            clocks.break_left_minutes, CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES
        )

    def test_empty_segments_returns_full_limits(self):
        clocks = compute_clocks(
            segments=[],
            prior_on_duty_plus_drive_minutes=0,
            current_cycle_hours=0.0,
        )
        self.assertEqual(clocks.drive_left_minutes, MAX_DRIVING_MINUTES)
        self.assertEqual(clocks.window_left_minutes, MAX_ON_DUTY_WINDOW_MINUTES)
        self.assertEqual(
            clocks.break_left_minutes, CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES
        )
        self.assertEqual(clocks.cycle_left_minutes, CYCLE_LIMIT_MINUTES)


class HighStartingCycleHoursClamps(unittest.TestCase):
    def test_cycle_left_clamps_to_zero_when_driver_starts_over_limit(self):
        # Driver already at 70 h cycle and drives an additional 2 hours →
        # cycle_left must clamp to 0, not go negative.
        segments = [_seg(DutyStatus.DRIVING, start_minute=360, duration_minutes=120)]
        clocks = compute_clocks(
            segments=segments,
            prior_on_duty_plus_drive_minutes=0,
            current_cycle_hours=70.0,
        )
        self.assertEqual(clocks.cycle_left_minutes, 0)

    def test_cycle_left_clamps_to_zero_when_prior_already_exceeds_limit(self):
        clocks = compute_clocks(
            segments=[],
            prior_on_duty_plus_drive_minutes=80 * 60,
            current_cycle_hours=0.0,
        )
        self.assertEqual(clocks.cycle_left_minutes, 0)


class BreakDoesNotCountWhenShorterThanThirtyMinutes(unittest.TestCase):
    def test_short_off_duty_segment_does_not_reset_break_counter(self):
        # 3h drive, 20-min off-duty (not qualifying), 2h drive →
        # cumulative drive since last qualifying break = 5h.
        segments = [
            _seg(DutyStatus.DRIVING, start_minute=360, duration_minutes=180),
            _seg(DutyStatus.OFF_DUTY, start_minute=540, duration_minutes=20),
            _seg(DutyStatus.DRIVING, start_minute=560, duration_minutes=120),
        ]
        clocks = compute_clocks(
            segments=segments,
            prior_on_duty_plus_drive_minutes=0,
            current_cycle_hours=0.0,
        )
        self.assertEqual(
            clocks.break_left_minutes,
            CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES - 5 * 60,
        )


if __name__ == "__main__":
    unittest.main()
