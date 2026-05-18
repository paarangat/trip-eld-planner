"""ELD builder tests — totals must sum to 24:00 and midnight crossings split."""

from __future__ import annotations

import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from apps.eld.builder import build_daily_logs
from apps.hos.engine import schedule_trip
from apps.hos.models import DutySegment, DutyStatus, Location, Timeline
from apps.routing.service import Coordinate, GeocodedPlace, RouteLeg, TripRoute


TZ = ZoneInfo("America/Chicago")


def _place(label: str) -> GeocodedPlace:
    return GeocodedPlace(query=label, resolved_label=label, coordinate=Coordinate(lat=0, lng=0))


def _route(legs: list[tuple[str, str, float, float]]) -> TripRoute:
    return TripRoute(
        legs=[
            RouteLeg(
                start=_place(a),
                end=_place(b),
                distance_meters=miles * 1609.344,
                duration_seconds=hours * 3600,
                polyline=[Coordinate(lat=0, lng=0), Coordinate(lat=0, lng=0)],
                cumulative_miles=[0.0, miles],
            )
            for (a, b, miles, hours) in legs
        ]
    )


class TotalsSumToTwentyFourHours(unittest.TestCase):
    def test_short_trip(self):
        start = datetime(2026, 6, 1, 6, 0, tzinfo=TZ)
        route = _route([("A", "B", 100, 2.0), ("B", "C", 200, 4.0)])
        timeline = schedule_trip(route, current_cycle_hours=0.0, start_datetime=start)
        logs = build_daily_logs(timeline)
        self.assertGreaterEqual(len(logs), 1)
        for log in logs:
            self.assertEqual(log.total_minutes, 24 * 60)

    def test_long_trip(self):
        start = datetime(2026, 6, 1, 6, 0, tzinfo=TZ)
        route = _route([("A", "B", 10, 0.25), ("B", "C", 1800, 32.0)])
        timeline = schedule_trip(route, current_cycle_hours=0.0, start_datetime=start)
        logs = build_daily_logs(timeline)
        self.assertGreater(len(logs), 2)
        for log in logs:
            self.assertEqual(log.total_minutes, 24 * 60)


class MidnightCrossing(unittest.TestCase):
    def test_segment_spanning_midnight_splits(self):
        tz = TZ
        location = Location(label="anywhere", lat=0, lng=0)
        seg = DutySegment(
            status=DutyStatus.DRIVING,
            start=datetime(2026, 6, 1, 22, 0, tzinfo=tz),
            end=datetime(2026, 6, 2, 4, 0, tzinfo=tz),
            location=location,
            note="overnight",
            miles=300.0,
        )
        timeline = Timeline(segments=[seg], total_miles=300.0)
        logs = build_daily_logs(timeline)
        self.assertEqual(len(logs), 2)
        # Driving minutes split: 2 hours on day 1, 4 hours on day 2.
        self.assertEqual(logs[0].total_driving_minutes, 2 * 60)
        self.assertEqual(logs[1].total_driving_minutes, 4 * 60)
        # Miles split proportionally to time.
        self.assertAlmostEqual(logs[0].total_miles, 100.0, places=1)
        self.assertAlmostEqual(logs[1].total_miles, 200.0, places=1)
        # And totals sum to 24:00 on both days.
        for log in logs:
            self.assertEqual(log.total_minutes, 24 * 60)


if __name__ == "__main__":
    unittest.main()
