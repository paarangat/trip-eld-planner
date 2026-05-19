"""Unit tests for the per-day HOS remaining-time clocks.

Pure-function table-driven tests, in the style of ``test_engine.py``.
Covers the scenarios called out in CLAUDE.md §10 — short trip, break reset,
cycle accumulation across days, and the high-starting-cycle edge case.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apps.eld.models import DailyLog, LogSegment
from apps.hos.clocks import (
    compute_clocks,
    compute_clocks_for_logs,
    compute_timeline_clocks,
)
from apps.hos.constants import (
    CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES,
    CYCLE_LIMIT_MINUTES,
    MAX_DRIVING_MINUTES,
    MAX_ON_DUTY_WINDOW_MINUTES,
)
from apps.hos.models import (
    DutySegment,
    DutyStatus,
    Location,
    StopKind,
    Timeline,
)


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

    def test_on_duty_not_driving_qualifies_as_non_driving_break(self):
        # 4h drive, 1h pickup, 4h drive. Pickup is non-driving for >= 30 min,
        # so the break clock is measured from the second drive only.
        segments = [
            _seg(DutyStatus.DRIVING, start_minute=360, duration_minutes=240),
            _seg(
                DutyStatus.ON_DUTY_NOT_DRIVING,
                start_minute=600,
                duration_minutes=60,
            ),
            _seg(DutyStatus.DRIVING, start_minute=660, duration_minutes=240),
        ]
        clocks = compute_clocks(
            segments=segments,
            prior_on_duty_plus_drive_minutes=0,
            current_cycle_hours=0.0,
        )
        self.assertEqual(
            clocks.break_left_minutes,
            CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES - 4 * 60,
        )


class DailyLogClockReplay(unittest.TestCase):
    def test_split_restart_resets_cycle_on_second_day(self):
        # Driver starts with 68h used, works 2h, then takes a 34h restart split
        # across midnight. Day 2 must show a fresh cycle after restart completion.
        day_two = DAY + timedelta(days=1)
        day_one_log = DailyLog(
            log_date=DAY.date(),
            segments=[
                _seg(DutyStatus.DRIVING, start_minute=360, duration_minutes=120),
                LogSegment(
                    status=DutyStatus.OFF_DUTY,
                    start=DAY + timedelta(minutes=480),
                    end=DAY + timedelta(days=1),
                    location=DEPOT,
                    note="34-hr restart",
                    miles=0.0,
                    stop_kind=StopKind.RESTART,
                ),
            ],
        )
        day_two_log = DailyLog(
            log_date=day_two.date(),
            segments=[
                LogSegment(
                    status=DutyStatus.OFF_DUTY,
                    start=day_two,
                    end=day_two + timedelta(hours=18),
                    location=DEPOT,
                    note="34-hr restart",
                    miles=0.0,
                    stop_kind=StopKind.RESTART,
                ),
                LogSegment(
                    status=DutyStatus.DRIVING,
                    start=day_two + timedelta(hours=18),
                    end=day_two + timedelta(hours=21, minutes=15),
                    location=DEPOT,
                    note="Driving",
                    miles=195.0,
                    stop_kind=None,
                ),
                LogSegment(
                    status=DutyStatus.ON_DUTY_NOT_DRIVING,
                    start=day_two + timedelta(hours=21, minutes=15),
                    end=day_two + timedelta(hours=22, minutes=15),
                    location=DEPOT,
                    note="Drop-off",
                    miles=0.0,
                    stop_kind=StopKind.DROPOFF,
                ),
            ],
        )

        clocks_by_date = compute_clocks_for_logs(
            [day_one_log, day_two_log], current_cycle_hours=68.0
        )

        self.assertEqual(clocks_by_date[DAY.date()].cycle_left_minutes, 0)
        self.assertEqual(
            clocks_by_date[day_two.date()].cycle_left_minutes,
            CYCLE_LIMIT_MINUTES - (3 * 60 + 15 + 60),
        )

    def test_pre_trip_padding_does_not_count_toward_restart(self):
        # Padding is inserted only to make a log sheet total 24h. It must not
        # make a scheduled 34h restart complete earlier than the engine planned.
        day_two = DAY + timedelta(days=1)
        day_three = DAY + timedelta(days=2)
        day_one_log = DailyLog(
            log_date=DAY.date(),
            segments=[
                _seg(DutyStatus.OFF_DUTY, start_minute=0, duration_minutes=18 * 60),
                LogSegment(
                    status=DutyStatus.OFF_DUTY,
                    start=DAY + timedelta(hours=18),
                    end=day_two,
                    location=DEPOT,
                    note="34-hr restart",
                    miles=0.0,
                    stop_kind=StopKind.RESTART,
                ),
            ],
        )
        day_two_log = DailyLog(
            log_date=day_two.date(),
            segments=[
                LogSegment(
                    status=DutyStatus.OFF_DUTY,
                    start=day_two,
                    end=day_three,
                    location=DEPOT,
                    note="34-hr restart",
                    miles=0.0,
                    stop_kind=StopKind.RESTART,
                )
            ],
        )
        day_three_log = DailyLog(
            log_date=day_three.date(),
            segments=[
                LogSegment(
                    status=DutyStatus.OFF_DUTY,
                    start=day_three,
                    end=day_three + timedelta(hours=4),
                    location=DEPOT,
                    note="34-hr restart",
                    miles=0.0,
                    stop_kind=StopKind.RESTART,
                ),
                LogSegment(
                    status=DutyStatus.DRIVING,
                    start=day_three + timedelta(hours=4),
                    end=day_three + timedelta(hours=5),
                    location=DEPOT,
                    note="Driving",
                    miles=50.0,
                    stop_kind=None,
                ),
            ],
        )

        clocks_by_date = compute_clocks_for_logs(
            [day_one_log, day_two_log, day_three_log], current_cycle_hours=70.0
        )

        self.assertEqual(clocks_by_date[day_two.date()].cycle_left_minutes, 0)
        self.assertEqual(
            clocks_by_date[day_three.date()].cycle_left_minutes,
            CYCLE_LIMIT_MINUTES - 60,
        )


def _duty_seg(
    status: DutyStatus,
    start_minute: int,
    duration_minutes: int,
    *,
    stop_kind: StopKind | None = None,
) -> DutySegment:
    start = DAY + timedelta(minutes=start_minute)
    end = start + timedelta(minutes=duration_minutes)
    return DutySegment(
        status=status,
        start=start,
        end=end,
        location=DEPOT,
        note="",
        miles=0.0,
        stop_kind=stop_kind,
    )


class TimelineSnapshotReplay(unittest.TestCase):
    """``compute_timeline_clocks`` walks the engine output emitting snapshots."""

    def test_empty_timeline_returns_no_snapshots(self):
        self.assertEqual(
            compute_timeline_clocks(
                timeline=Timeline(segments=[]), current_cycle_hours=0.0
            ),
            [],
        )

    def test_snapshot_at_every_segment_boundary(self):
        # 4h drive, 30-min break, 4h drive → 3 segments → 5 snapshots:
        # initial + 3 end-of-segment + 1 extra post-reset snap at the break's
        # end (the reset is encoded as two snapshots at the same timestamp so
        # the frontend lerp reads it as a clean step, not a smeared ramp).
        timeline = Timeline(
            segments=[
                _duty_seg(DutyStatus.DRIVING, 360, 240),
                _duty_seg(
                    DutyStatus.OFF_DUTY, 600, 30, stop_kind=StopKind.BREAK
                ),
                _duty_seg(DutyStatus.DRIVING, 630, 240),
            ],
            total_miles=480.0,
        )
        snapshots = compute_timeline_clocks(
            timeline=timeline, current_cycle_hours=0.0
        )
        self.assertEqual(len(snapshots), 5)
        # Times are in chronological order (the reset pair shares one timestamp).
        times = [snap.at for snap in snapshots]
        self.assertEqual(times, sorted(times))

    def test_initial_snapshot_is_fully_fresh(self):
        timeline = Timeline(
            segments=[_duty_seg(DutyStatus.DRIVING, 360, 60)], total_miles=60.0
        )
        snapshots = compute_timeline_clocks(
            timeline=timeline, current_cycle_hours=8.0
        )
        # First snapshot is at the very start — clocks should be full
        # except cycle, which reflects the starting 8 hours used.
        first = snapshots[0].clocks
        self.assertEqual(first.drive_left_minutes, MAX_DRIVING_MINUTES)
        self.assertEqual(first.window_left_minutes, MAX_ON_DUTY_WINDOW_MINUTES)
        self.assertEqual(
            first.break_left_minutes, CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES
        )
        self.assertEqual(
            first.cycle_left_minutes, CYCLE_LIMIT_MINUTES - 8 * 60
        )

    def test_break_segment_resets_break_left_at_segment_end(self):
        # 4 h drive, 30-min break → 4 snapshots: initial, end-of-drive,
        # end-of-break pre-reset, end-of-break post-reset.
        timeline = Timeline(
            segments=[
                _duty_seg(DutyStatus.DRIVING, 360, 240),
                _duty_seg(
                    DutyStatus.OFF_DUTY, 600, 30, stop_kind=StopKind.BREAK
                ),
            ],
            total_miles=240.0,
        )
        snapshots = compute_timeline_clocks(
            timeline=timeline, current_cycle_hours=0.0
        )
        self.assertEqual(snapshots[1].clocks.break_left_minutes, 4 * 60)
        # Pre-reset: break_left still depleted because the reset is a step
        # that lives between the next pair of same-timestamp snapshots.
        self.assertEqual(snapshots[2].clocks.break_left_minutes, 4 * 60)
        # Post-reset: break_left flips back to the full 8 h.
        self.assertEqual(snapshots[2].at, snapshots[3].at)
        self.assertEqual(
            snapshots[3].clocks.break_left_minutes,
            CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES,
        )
        # Window does NOT pause during the 30-min break.
        self.assertEqual(
            snapshots[2].clocks.window_left_minutes,
            MAX_ON_DUTY_WINDOW_MINUTES - (4 * 60 + 30),
        )
        self.assertEqual(
            snapshots[3].clocks.window_left_minutes,
            MAX_ON_DUTY_WINDOW_MINUTES - (4 * 60 + 30),
        )

    def test_ten_hour_rest_resets_shift_clocks_but_not_cycle(self):
        timeline = Timeline(
            segments=[
                _duty_seg(DutyStatus.DRIVING, 360, 11 * 60),
                _duty_seg(
                    DutyStatus.OFF_DUTY, 360 + 11 * 60, 10 * 60,
                    stop_kind=StopKind.REST,
                ),
            ],
            total_miles=660.0,
        )
        snapshots = compute_timeline_clocks(
            timeline=timeline, current_cycle_hours=0.0
        )
        post_rest = snapshots[-1].clocks
        self.assertEqual(post_rest.drive_left_minutes, MAX_DRIVING_MINUTES)
        self.assertEqual(
            post_rest.window_left_minutes, MAX_ON_DUTY_WINDOW_MINUTES
        )
        self.assertEqual(
            post_rest.break_left_minutes,
            CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES,
        )
        # Cycle still reflects the 11h drive — NOT reset by a 10-hr rest.
        self.assertEqual(
            post_rest.cycle_left_minutes, CYCLE_LIMIT_MINUTES - 11 * 60
        )

    def test_thirty_four_hour_restart_resets_everything_including_cycle(self):
        timeline = Timeline(
            segments=[
                _duty_seg(DutyStatus.DRIVING, 0, 5 * 60),
                _duty_seg(
                    DutyStatus.OFF_DUTY, 5 * 60, 34 * 60,
                    stop_kind=StopKind.RESTART,
                ),
            ],
            total_miles=250.0,
        )
        snapshots = compute_timeline_clocks(
            timeline=timeline, current_cycle_hours=60.0
        )
        post_restart = snapshots[-1].clocks
        self.assertEqual(post_restart.drive_left_minutes, MAX_DRIVING_MINUTES)
        self.assertEqual(
            post_restart.window_left_minutes, MAX_ON_DUTY_WINDOW_MINUTES
        )
        self.assertEqual(post_restart.cycle_left_minutes, CYCLE_LIMIT_MINUTES)

    def test_last_snapshot_matches_end_of_day_compute_clocks_for_single_day(self):
        """For a single-day trip with no resets, the trailing snapshot equals
        what ``compute_clocks`` returns for that day's segments."""
        segments_dt = [
            _duty_seg(DutyStatus.DRIVING, 360, 240),
            _duty_seg(
                DutyStatus.ON_DUTY_NOT_DRIVING, 600, 60, stop_kind=StopKind.PICKUP
            ),
            _duty_seg(DutyStatus.DRIVING, 660, 180),
        ]
        timeline = Timeline(segments=segments_dt, total_miles=420.0)
        snapshots = compute_timeline_clocks(
            timeline=timeline, current_cycle_hours=0.0
        )

        # Build LogSegment versions to feed compute_clocks
        log_segments = [
            LogSegment(
                status=s.status,
                start=s.start,
                end=s.end,
                location=s.location,
                note=s.note,
                miles=s.miles,
                stop_kind=s.stop_kind,
            )
            for s in segments_dt
        ]
        end_of_day = compute_clocks(
            segments=log_segments,
            prior_on_duty_plus_drive_minutes=0,
            current_cycle_hours=0.0,
        )
        self.assertEqual(
            snapshots[-1].clocks.drive_left_minutes,
            end_of_day.drive_left_minutes,
        )
        self.assertEqual(
            snapshots[-1].clocks.cycle_left_minutes,
            end_of_day.cycle_left_minutes,
        )


if __name__ == "__main__":
    unittest.main()
