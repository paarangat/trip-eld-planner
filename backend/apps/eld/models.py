"""ELD log-sheet dataclasses."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from apps.hos.models import DutyStatus, Location, StopKind


@dataclass(frozen=True)
class Remark:
    """A duty-status-change marker, per FMCSA log-sheet format."""

    time: datetime
    location: str


@dataclass(frozen=True)
class LogSegment:
    """A duty segment clipped to a single calendar day, in home-terminal time."""

    status: DutyStatus
    start: datetime
    end: datetime
    location: Location
    note: str
    miles: float
    stop_kind: StopKind | None


@dataclass
class DailyLog:
    log_date: date
    segments: list[LogSegment] = field(default_factory=list)
    total_off_duty_minutes: int = 0
    total_sleeper_minutes: int = 0
    total_driving_minutes: int = 0
    total_on_duty_minutes: int = 0
    total_miles: float = 0.0
    remarks: list[Remark] = field(default_factory=list)

    @property
    def total_minutes(self) -> int:
        return (
            self.total_off_duty_minutes
            + self.total_sleeper_minutes
            + self.total_driving_minutes
            + self.total_on_duty_minutes
        )
