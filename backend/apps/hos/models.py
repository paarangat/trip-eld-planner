"""Domain dataclasses for the HOS engine.

Pure Python. No Django, no I/O. Implementations land in subsequent commits.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class DutyStatus(str, Enum):
    OFF_DUTY = "off_duty"
    SLEEPER_BERTH = "sleeper_berth"
    DRIVING = "driving"
    ON_DUTY_NOT_DRIVING = "on_duty"


@dataclass(frozen=True)
class Location:
    label: str
    lat: float
    lng: float


@dataclass(frozen=True)
class DutySegment:
    status: DutyStatus
    start: datetime
    end: datetime
    location: Location
    note: str = ""


@dataclass
class Timeline:
    segments: list[DutySegment] = field(default_factory=list)
