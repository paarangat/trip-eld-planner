"""Routing service cache behavior."""

from __future__ import annotations

import unittest
from collections import Counter

from apps.routing.service import RoutingService


class FakeClient:
    def __init__(self) -> None:
        self.geocode_calls: Counter[str] = Counter()

    def geocode(self, text: str):
        self.geocode_calls[text] += 1
        return {
            "features": [
                {
                    "geometry": {"coordinates": [float(len(text)), 1.0]},
                    "properties": {"label": text},
                }
            ]
        }

    def directions(self, _coordinates):
        return {
            "routes": [
                {
                    "summary": {"distance": 1609.344, "duration": 60},
                    "geometry": "",
                }
            ]
        }


class RequestLocalGeocodeCache(unittest.TestCase):
    def test_reuses_geocode_result_within_one_service_instance(self):
        client = FakeClient()
        service = RoutingService(client=client)

        service.plan("Chicago, IL", "Chicago, IL", "Denver, CO")

        self.assertEqual(client.geocode_calls["Chicago, IL"], 1)
        self.assertEqual(client.geocode_calls["Denver, CO"], 1)

    def test_cache_is_not_shared_between_service_instances(self):
        client = FakeClient()

        RoutingService(client=client).plan("Chicago, IL", "Chicago, IL", "Denver, CO")
        RoutingService(client=client).plan("Chicago, IL", "Chicago, IL", "Denver, CO")

        self.assertEqual(client.geocode_calls["Chicago, IL"], 2)
        self.assertEqual(client.geocode_calls["Denver, CO"], 2)


if __name__ == "__main__":
    unittest.main()
