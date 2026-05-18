"""Domain dataclasses for the HOS engine.

Pure Python. No Django, no I/O.
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


class StopKind(str, Enum):
    """Why a non-driving segment exists. Used by the API for map markers."""

    START = "start"
    PICKUP = "pickup"
    DROPOFF = "dropoff"
    FUEL = "fuel"
    BREAK = "break"
    REST = "rest"
    RESTART = "restart"


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
    miles: float = 0.0
    stop_kind: StopKind | None = None

    @property
    def duration_minutes(self) -> int:
        delta = self.end - self.start
        return int(delta.total_seconds() // 60)


@dataclass
class Timeline:
    segments: list[DutySegment] = field(default_factory=list)
    total_miles: float = 0.0
