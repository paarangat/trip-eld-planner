"""Per-day HOS remaining-time clocks.

This module is pure: data in, data out. No Django, no I/O. The function below
mirrors the four clocks the dashboard surfaces (drive, on-duty window, time
until 30-min break, 70-hr cycle) and is the *single* source of truth for
those numbers — the frontend must not recompute them. See CLAUDE.md §6.

All durations are integer minutes; see CLAUDE.md §8.2 (no float drift).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from apps.eld.models import LogSegment
from apps.hos.constants import (
    CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES,
    CYCLE_LIMIT_MINUTES,
    MAX_DRIVING_MINUTES,
    MAX_ON_DUTY_WINDOW_MINUTES,
    REQUIRED_BREAK_MINUTES,
)
from apps.hos.models import DutyStatus


MINUTES_PER_HOUR = 60


@dataclass(frozen=True)
class HOSClocks:
    """Minutes remaining against each of the four big HOS limits."""

    drive_left_minutes: int
    window_left_minutes: int
    break_left_minutes: int
    cycle_left_minutes: int


def compute_clocks(
    *,
    segments: Iterable[LogSegment],
    prior_on_duty_plus_drive_minutes: int,
    current_cycle_hours: float,
) -> HOSClocks:
    """Compute the four remaining-time clocks for a single daily log.

    Args:
        segments: today's duty segments, in chronological order.
        prior_on_duty_plus_drive_minutes: sum of (driving + on-duty-not-driving)
            minutes from every daily log *before* this one — used so the cycle
            clock accumulates across days.
        current_cycle_hours: the driver's pre-trip cycle hours (the starting
            value of the 70-hr cycle counter).

    Returns:
        ``HOSClocks`` — integer minutes remaining for each clock, clamped to 0.
    """
    segs = list(segments)

    drive_today = _sum_minutes(segs, DutyStatus.DRIVING)
    on_duty_today = _sum_minutes(segs, DutyStatus.ON_DUTY_NOT_DRIVING)
    window_used = _window_used_minutes(segs)
    drive_since_break = _drive_since_break_minutes(segs)

    cycle_start_minutes = int(round(current_cycle_hours * MINUTES_PER_HOUR))
    cycle_used = (
        cycle_start_minutes
        + prior_on_duty_plus_drive_minutes
        + drive_today
        + on_duty_today
    )

    return HOSClocks(
        drive_left_minutes=_remaining(MAX_DRIVING_MINUTES, drive_today),
        window_left_minutes=_remaining(MAX_ON_DUTY_WINDOW_MINUTES, window_used),
        break_left_minutes=_remaining(
            CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES, drive_since_break
        ),
        cycle_left_minutes=_remaining(CYCLE_LIMIT_MINUTES, cycle_used),
    )


# ---------------------------------------------------------------------------
# Internals — small, pure helpers
# ---------------------------------------------------------------------------


def _remaining(limit_minutes: int, used_minutes: int) -> int:
    """Subtract ``used`` from ``limit``, clamped to zero (never negative)."""
    return max(0, limit_minutes - used_minutes)


def _segment_minutes(seg: LogSegment) -> int:
    """Duration of a single clipped log segment, in integer minutes."""
    return int((seg.end - seg.start).total_seconds() // 60)


def _sum_minutes(segments: list[LogSegment], status: DutyStatus) -> int:
    return sum(_segment_minutes(s) for s in segments if s.status is status)


def _window_used_minutes(segments: list[LogSegment]) -> int:
    """Wall-clock elapsed from today's first on-duty/driving segment to the
    last one's end. The 14-hr window does NOT pause for breaks — every minute
    between those two points counts (CLAUDE.md §7).
    """
    on_duty = [
        s
        for s in segments
        if s.status in (DutyStatus.DRIVING, DutyStatus.ON_DUTY_NOT_DRIVING)
    ]
    if not on_duty:
        return 0
    start = on_duty[0].start
    last_end = on_duty[-1].end
    elapsed = int((last_end - start).total_seconds() // 60)
    return max(0, elapsed)


def _drive_since_break_minutes(segments: list[LogSegment]) -> int:
    """Cumulative driving minutes since the most recent qualifying break.

    A qualifying break is at least ``REQUIRED_BREAK_MINUTES`` minutes of
    off-duty or sleeper-berth time (CLAUDE.md §7: "cumulative, not
    consecutive — measured from last qualifying break").
    """
    drive_since = 0
    for seg in segments:
        minutes = _segment_minutes(seg)
        is_qualifying_break = (
            seg.status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH)
            and minutes >= REQUIRED_BREAK_MINUTES
        )
        if is_qualifying_break:
            drive_since = 0
            continue
        if seg.status is DutyStatus.DRIVING:
            drive_since += minutes
    return drive_since
