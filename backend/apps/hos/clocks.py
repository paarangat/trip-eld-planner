"""Per-day HOS remaining-time clocks and trip-wide snapshot replay.

This module is pure: data in, data out. No Django, no I/O. ``compute_clocks``
mirrors the four clocks the dashboard surfaces (drive, on-duty window, time
until 30-min break, 70-hr cycle) and is the *single* source of truth for
those numbers per finished daily log. ``compute_timeline_clocks`` replays an
engine Timeline to emit a snapshot at every segment boundary — used by the
simulator and any other "what are the clocks at this moment" consumer. The
frontend must not recompute either (CLAUDE.md §6).

All durations are integer minutes; see CLAUDE.md §8.2 (no float drift).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Iterable

from apps.eld.models import DailyLog, LogSegment
from apps.hos.constants import (
    CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES,
    CYCLE_LIMIT_MINUTES,
    CYCLE_RESTART_MINUTES,
    MAX_DRIVING_MINUTES,
    MAX_ON_DUTY_WINDOW_MINUTES,
    REQUIRED_BREAK_MINUTES,
    REQUIRED_OFF_DUTY_RESET_MINUTES,
)
from apps.hos.models import DutySegment, DutyStatus, StopKind, Timeline


MINUTES_PER_HOUR = 60


@dataclass(frozen=True)
class HOSClocks:
    """Minutes remaining against each of the four big HOS limits."""

    drive_left_minutes: int
    window_left_minutes: int
    break_left_minutes: int
    cycle_left_minutes: int


@dataclass
class _DailyClockState:
    cycle_used_minutes: int
    window_used_minutes: int = 0
    drive_in_shift_minutes: int = 0
    drive_since_break_minutes: int = 0
    consecutive_off_duty_minutes: int = 0
    restart_minutes: int = 0


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
    cycle_start_minutes = int(round(current_cycle_hours * MINUTES_PER_HOUR))
    state = _DailyClockState(
        cycle_used_minutes=cycle_start_minutes + prior_on_duty_plus_drive_minutes
    )
    _apply_log_segments(state, segments)
    return _clocks_from_daily_state(state)


def compute_clocks_for_logs(
    daily_logs: Iterable[DailyLog],
    *,
    current_cycle_hours: float,
) -> dict[date, HOSClocks]:
    """Return end-of-day clocks for logs in chronological order.

    This carries clock state across midnight. A 34-hour restart often spans two
    log sheets, so the cycle clock must reset only after the full off-duty
    restart segment completes.
    """
    state = _DailyClockState(
        cycle_used_minutes=int(round(current_cycle_hours * MINUTES_PER_HOUR))
    )
    clocks_by_date: dict[date, HOSClocks] = {}
    for log in sorted(daily_logs, key=lambda item: item.log_date):
        _apply_log_segments(state, sorted(log.segments, key=lambda item: item.start))
        clocks_by_date[log.log_date] = _clocks_from_daily_state(state)
    return clocks_by_date


# ---------------------------------------------------------------------------
# Internals — small, pure helpers
# ---------------------------------------------------------------------------


def _remaining(limit_minutes: int, used_minutes: int) -> int:
    """Subtract ``used`` from ``limit``, clamped to zero (never negative)."""
    return max(0, limit_minutes - used_minutes)


def _segment_minutes(seg: LogSegment) -> int:
    """Duration of a single clipped log segment, in integer minutes."""
    return int((seg.end - seg.start).total_seconds() // 60)


def _apply_log_segments(
    state: _DailyClockState, segments: Iterable[LogSegment]
) -> None:
    for seg in segments:
        _apply_log_segment(state, seg)


def _apply_log_segment(state: _DailyClockState, seg: LogSegment) -> None:
    minutes = _segment_minutes(seg)
    if minutes <= 0:
        return

    if seg.status in (DutyStatus.OFF_DUTY, DutyStatus.SLEEPER_BERTH):
        state.consecutive_off_duty_minutes += minutes
        if seg.stop_kind is StopKind.RESTART:
            state.restart_minutes += minutes
        else:
            state.restart_minutes = 0
        if state.consecutive_off_duty_minutes >= REQUIRED_BREAK_MINUTES:
            state.drive_since_break_minutes = 0
        if state.consecutive_off_duty_minutes >= REQUIRED_OFF_DUTY_RESET_MINUTES:
            # A 10-hr off-duty period resets the shift clocks. CLAUDE.md §7.
            state.window_used_minutes = 0
            state.drive_in_shift_minutes = 0
        elif state.window_used_minutes > 0:
            # The 14-hr window does NOT pause for short breaks — every minute
            # after the first on-duty segment counts. CLAUDE.md §7.
            state.window_used_minutes += minutes
        if (
            seg.stop_kind is StopKind.RESTART
            and state.restart_minutes >= CYCLE_RESTART_MINUTES
        ):
            state.cycle_used_minutes = 0
        return

    state.consecutive_off_duty_minutes = 0
    state.restart_minutes = 0

    if seg.status is DutyStatus.DRIVING:
        state.window_used_minutes += minutes
        state.drive_in_shift_minutes += minutes
        state.drive_since_break_minutes += minutes
        state.cycle_used_minutes += minutes
        return

    if seg.status is DutyStatus.ON_DUTY_NOT_DRIVING:
        state.window_used_minutes += minutes
        state.cycle_used_minutes += minutes
        if minutes >= REQUIRED_BREAK_MINUTES:
            state.drive_since_break_minutes = 0


def _clocks_from_daily_state(state: _DailyClockState) -> HOSClocks:
    return HOSClocks(
        drive_left_minutes=_remaining(
            MAX_DRIVING_MINUTES, state.drive_in_shift_minutes
        ),
        window_left_minutes=_remaining(
            MAX_ON_DUTY_WINDOW_MINUTES, state.window_used_minutes
        ),
        break_left_minutes=_remaining(
            CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES,
            state.drive_since_break_minutes,
        ),
        cycle_left_minutes=_remaining(CYCLE_LIMIT_MINUTES, state.cycle_used_minutes),
    )


# ---------------------------------------------------------------------------
# Trip-wide snapshot replay — used by the simulator
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ClockSnapshot:
    """The four HOS clocks at a single moment along the trip."""

    at: datetime
    clocks: HOSClocks


@dataclass
class _ReplayState:
    cycle_used_minutes: int = 0
    window_used_minutes: int = 0
    drive_in_shift_minutes: int = 0
    drive_since_break_minutes: int = 0


def compute_timeline_clocks(
    *,
    timeline: Timeline,
    current_cycle_hours: float,
) -> list[ClockSnapshot]:
    """Replay ``timeline`` and emit a clock snapshot at every segment boundary.

    For each segment we apply the effect in two phases:

    * ``during`` — the continuous accumulation that happens minute-by-minute
      (driving subtracts from all four clocks; on-duty subtracts from window
      and cycle; a 30-min break still ticks the window).
    * ``boundary`` — the one-shot reset that fires when the segment ends
      (a 10-hr rest resets the shift clocks; a 34-hr restart resets all four;
      any 30+ min off-duty or on-duty stretch resets the cumulative-drive-
      since-break counter).

    Splitting the two phases lets us emit two snapshots at the same timestamp
    at the end of any reset segment — a pre-reset snapshot (so the lerp stays
    flat through the rest) and a post-reset snapshot (so the gauges step
    cleanly after). The frontend can therefore lerp linearly between adjacent
    snapshots without doing HOS math (CLAUDE.md §6).
    """
    if not timeline.segments:
        return []

    state = _ReplayState(
        cycle_used_minutes=int(round(current_cycle_hours * MINUTES_PER_HOUR))
    )

    snapshots: list[ClockSnapshot] = [
        ClockSnapshot(
            at=timeline.segments[0].start, clocks=_clocks_from_state(state)
        )
    ]
    for seg in timeline.segments:
        _apply_during(state, seg)
        snapshots.append(
            ClockSnapshot(at=seg.end, clocks=_clocks_from_state(state))
        )
        if _apply_boundary(state, seg):
            snapshots.append(
                ClockSnapshot(at=seg.end, clocks=_clocks_from_state(state))
            )
    return snapshots


def _clocks_from_state(state: _ReplayState) -> HOSClocks:
    return HOSClocks(
        drive_left_minutes=_remaining(
            MAX_DRIVING_MINUTES, state.drive_in_shift_minutes
        ),
        window_left_minutes=_remaining(
            MAX_ON_DUTY_WINDOW_MINUTES, state.window_used_minutes
        ),
        break_left_minutes=_remaining(
            CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES,
            state.drive_since_break_minutes,
        ),
        cycle_left_minutes=_remaining(
            CYCLE_LIMIT_MINUTES, state.cycle_used_minutes
        ),
    )


def _apply_during(state: _ReplayState, seg: DutySegment) -> None:
    """Incremental effects that accumulate linearly during ``seg``."""
    minutes = seg.duration_minutes

    if seg.status is DutyStatus.DRIVING:
        state.drive_in_shift_minutes += minutes
        state.window_used_minutes += minutes
        state.drive_since_break_minutes += minutes
        state.cycle_used_minutes += minutes
        return

    if seg.status is DutyStatus.ON_DUTY_NOT_DRIVING:
        state.window_used_minutes += minutes
        state.cycle_used_minutes += minutes
        return

    if seg.stop_kind is StopKind.BREAK:
        # The 14-hr window does NOT pause for short breaks. CLAUDE.md §7.
        state.window_used_minutes += minutes
        return

    # 10-hr REST and 34-hr RESTART have no during-effect; their resets are
    # applied as a single step at the end of the segment.


def _apply_boundary(state: _ReplayState, seg: DutySegment) -> bool:
    """Apply the one-shot reset, if any, at the end of ``seg``.

    Returns ``True`` if ``state`` actually changed — the caller emits a second
    snapshot at the same timestamp so the change reads as a clean step instead
    of a smeared lerp.
    """
    if seg.stop_kind is StopKind.RESTART:
        return _reset_to_zero(
            state,
            "cycle_used_minutes",
            "window_used_minutes",
            "drive_in_shift_minutes",
            "drive_since_break_minutes",
        )

    if seg.stop_kind is StopKind.REST:
        return _reset_to_zero(
            state,
            "window_used_minutes",
            "drive_in_shift_minutes",
            "drive_since_break_minutes",
        )

    if seg.stop_kind is StopKind.BREAK:
        return _reset_to_zero(state, "drive_since_break_minutes")

    if (
        seg.status is DutyStatus.ON_DUTY_NOT_DRIVING
        and seg.duration_minutes >= REQUIRED_BREAK_MINUTES
    ):
        # Pickup, drop-off, and fuel each run ≥ 30 min and also satisfy the
        # cumulative-break rule.
        return _reset_to_zero(state, "drive_since_break_minutes")

    return False


def _reset_to_zero(state: _ReplayState, *fields: str) -> bool:
    """Zero each named field on ``state``; return whether anything changed."""
    changed = False
    for field in fields:
        if getattr(state, field) != 0:
            setattr(state, field, 0)
            changed = True
    return changed
