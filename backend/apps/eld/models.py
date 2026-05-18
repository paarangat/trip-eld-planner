"""ELD log-sheet dataclasses."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass
class Remark:
    time: str
    location: str


@dataclass
class DailyLog:
    log_date: date
    segments: list = field(default_factory=list)
    total_off_duty_minutes: int = 0
    total_sleeper_minutes: int = 0
    total_driving_minutes: int = 0
    total_on_duty_minutes: int = 0
    total_miles: float = 0.0
    remarks: list[Remark] = field(default_factory=list)
