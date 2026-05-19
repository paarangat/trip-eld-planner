"""Thin HTTP wrapper around the OpenRouteService API.

Owns auth, timeouts, retries, and ORS error translation. Knows nothing about
trips — callers pass coordinates and free-text place names, and receive raw
ORS response dicts back.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

import openrouteservice
from django.conf import settings


logger = logging.getLogger(__name__)


HGV_PROFILE = "driving-hgv"
"""Heavy-goods-vehicle profile — closer to a truck's routing than driving-car."""


class ORSClientError(Exception):
    """Raised when the ORS upstream fails or returns an unusable response.

    The API layer translates this into a clean 502 for the client.
    """

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class ORSClient:
    """Wraps the openrouteservice Python client.

    One retry on transient failures (network, 5xx, timeout). Hard failures and
    4xx errors propagate as ORSClientError immediately.
    """

    def __init__(self, *, api_key: str | None = None, timeout: int | None = None) -> None:
        key = api_key or getattr(settings, "ORS_API_KEY", "")
        if not key:
            raise ORSClientError("ORS_API_KEY is not configured")
        self._client = openrouteservice.Client(
            key=key,
            timeout=timeout or getattr(settings, "ORS_TIMEOUT_SECONDS", 15),
        )

    def geocode(self, text: str) -> dict[str, Any]:
        """Return the top Pelias geocoding result for ``text``."""
        return self._safe(lambda: self._client.pelias_search(text=text, size=1))

    def directions(self, coordinates: list[tuple[float, float]]) -> dict[str, Any]:
        """Request a driving-HGV route for the given ordered ``(lng, lat)`` pairs.

        Returns the raw ORS JSON; callers decode the encoded polyline.
        """
        return self._safe(
            lambda: self._client.directions(
                coordinates=coordinates,
                profile=HGV_PROFILE,
                format="json",
                instructions=True,
                geometry=True,
            )
        )

    def _safe(self, call: Callable[[], Any], *, attempts: int = 2) -> Any:
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                return call()
            except Exception as exc:  # ORS exception classes vary by version
                last_error = exc
                status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
                # 4xx errors are not transient — fail fast.
                if isinstance(status, int) and 400 <= status < 500:
                    logger.error("ORS client error %s: %s", status, exc)
                    raise ORSClientError(str(exc), status=status) from exc
                logger.warning(
                    "ORS transient failure (attempt %d/%d): %s", attempt, attempts, exc
                )
        message = f"ORS upstream failed after {attempts} attempts: {last_error}"
        raise ORSClientError(message) from last_error
