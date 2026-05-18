"""Slice a Timeline into one DailyLog per calendar day.

A drive or rest that crosses midnight is split across two DailyLogs — see
CLAUDE.md §8.3. The four duty-status totals on each DailyLog must sum to
exactly 24:00; the builder asserts this before returning.

All times are interpreted in the timezone of the Timeline segments — the
caller is responsible for using home-terminal local time end-to-end.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from apps.hos.models import DutyStatus, DutySegment, Timeline

from .models import DailyLog, LogSegment, Remark


MINUTES_PER_DAY = 24 * 60


def build_daily_logs(timeline: Timeline) -> list[DailyLog]:
    """Return one DailyLog per calendar day spanned by ``timeline``."""
    by_date: dict[date, list[LogSegment]] = defaultdict(list)
    for segment in timeline.segments:
        for sliced in _slice_at_midnight(segment):
            by_date[sliced.start.date()].append(sliced)

    logs: list[DailyLog] = []
    for log_date in sorted(by_date):
        segments = by_date[log_date]
        log = _assemble_day(log_date, segments)
        _assert_totals_sum_to_24h(log)
        logs.append(log)
    return logs


# ---------------------------------------------------------------------------
# Slicing
# ---------------------------------------------------------------------------


def _slice_at_midnight(segment: DutySegment) -> list[LogSegment]:
    """Split a DutySegment into one LogSegment per calendar day it spans."""
    parts: list[LogSegment] = []
    cursor = segment.start
    total_minutes = max(0, int((segment.end - segment.start).total_seconds() // 60))

    while cursor < segment.end:
        next_midnight = _next_midnight(cursor)
        slice_end = min(segment.end, next_midnight)
        slice_minutes = max(0, int((slice_end - cursor).total_seconds() // 60))
        if slice_minutes == 0:
            break
        share = slice_minutes / total_minutes if total_minutes else 0.0
        parts.append(
            LogSegment(
                status=segment.status,
                start=cursor,
                end=slice_end,
                location=segment.location,
                note=segment.note,
                miles=segment.miles * share,
                stop_kind=segment.stop_kind,
            )
        )
        cursor = slice_end
    return parts


def _next_midnight(moment: datetime) -> datetime:
    next_day = (moment + timedelta(days=1)).date()
    return datetime.combine(next_day, time.min, tzinfo=moment.tzinfo)


# ---------------------------------------------------------------------------
# Per-day assembly
# ---------------------------------------------------------------------------


def _assemble_day(log_date: date, segments: list[LogSegment]) -> DailyLog:
    log = DailyLog(log_date=log_date)
    _pad_with_off_duty(log_date, segments)
    segments.sort(key=lambda s: s.start)
    log.segments = segments

    for seg in segments:
        minutes = max(0, int((seg.end - seg.start).total_seconds() // 60))
        if seg.status is DutyStatus.OFF_DUTY:
            log.total_off_duty_minutes += minutes
        elif seg.status is DutyStatus.SLEEPER_BERTH:
            log.total_sleeper_minutes += minutes
        elif seg.status is DutyStatus.DRIVING:
            log.total_driving_minutes += minutes
            log.total_miles += seg.miles
        elif seg.status is DutyStatus.ON_DUTY_NOT_DRIVING:
            log.total_on_duty_minutes += minutes

    log.remarks = _remarks(segments)
    return log


def _pad_with_off_duty(log_date: date, segments: list[LogSegment]) -> None:
    """Fill any gap before/after/between segments with OFF_DUTY so totals = 24:00."""
    if not segments:
        return
    tzinfo = segments[0].start.tzinfo
    day_start = datetime.combine(log_date, time.min, tzinfo=tzinfo)
    day_end = day_start + timedelta(days=1)
    segments.sort(key=lambda s: s.start)

    padding: list[LogSegment] = []
    cursor = day_start
    for seg in segments:
        if seg.start > cursor:
            padding.append(_off_duty_pad(cursor, seg.start, seg.location.label))
        cursor = max(cursor, seg.end)
    if cursor < day_end:
        last_label = segments[-1].location.label
        padding.append(_off_duty_pad(cursor, day_end, last_label))

    segments.extend(padding)


def _off_duty_pad(start: datetime, end: datetime, label: str) -> LogSegment:
    from apps.hos.models import Location

    return LogSegment(
        status=DutyStatus.OFF_DUTY,
        start=start,
        end=end,
        location=Location(label=label, lat=0.0, lng=0.0),
        note="Off duty",
        miles=0.0,
        stop_kind=None,
    )


def _remarks(segments: list[LogSegment]) -> list[Remark]:
    """One remark at every duty-status change, recording location."""
    remarks: list[Remark] = []
    previous_status: DutyStatus | None = None
    for seg in segments:
        if seg.status is not previous_status:
            remarks.append(Remark(time=seg.start, location=seg.location.label))
            previous_status = seg.status
    return remarks


def _assert_totals_sum_to_24h(log: DailyLog) -> None:
    total = log.total_minutes
    if total != MINUTES_PER_DAY:
        raise AssertionError(
            f"DailyLog totals must sum to 24:00 ({MINUTES_PER_DAY} min); "
            f"got {total} on {log.log_date.isoformat()}"
        )
