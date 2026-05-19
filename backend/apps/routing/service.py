"""Geocode + multi-leg route assembly.

Turns three location strings into two driving legs with geometry, distance,
duration, and cumulative-distance markers along each path. Geocoding results
are cached on the service instance so the same string is not geocoded twice
within one request.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Iterable

import openrouteservice.convert as ors_convert

from .client import ORSClient, ORSClientError


logger = logging.getLogger(__name__)


METERS_PER_MILE = 1609.344


@dataclass(frozen=True)
class Coordinate:
    """Latitude/longitude pair.

    Always store as (lat, lng); convert to (lng, lat) at the ORS boundary. This
    is the project's single defence against the most common ORS bug — see
    CLAUDE.md §8.1.
    """

    lat: float
    lng: float

    def as_ors(self) -> tuple[float, float]:
        return (self.lng, self.lat)


@dataclass(frozen=True)
class GeocodedPlace:
    query: str
    resolved_label: str
    coordinate: Coordinate


@dataclass(frozen=True)
class RouteLeg:
    """One driving leg: from one place to the next.

    ``polyline`` is the list of ordered (lat, lng) points along the road.
    ``cumulative_miles`` parallels ``polyline``: cumulative_miles[i] is the
    distance from the leg's start to polyline[i].
    """

    start: GeocodedPlace
    end: GeocodedPlace
    distance_meters: float
    duration_seconds: float
    polyline: list[Coordinate]
    cumulative_miles: list[float] = field(default_factory=list)
    steps: list["RouteStep"] = field(default_factory=list)

    @property
    def distance_miles(self) -> float:
        return self.distance_meters / METERS_PER_MILE


@dataclass(frozen=True)
class RouteStep:
    """One ORS turn-by-turn instruction within a route leg."""

    instruction: str
    name: str
    distance_meters: float
    duration_seconds: float
    type: int | None = None
    way_points: tuple[int, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class TripRoute:
    """The full trip: current → pickup → drop-off, as two legs."""

    legs: list[RouteLeg]

    @property
    def total_distance_miles(self) -> float:
        return sum(leg.distance_miles for leg in self.legs)

    @property
    def total_duration_seconds(self) -> float:
        return sum(leg.duration_seconds for leg in self.legs)


class RoutingError(Exception):
    """Raised when geocoding cannot resolve an input location."""


class RoutingService:
    """Wraps the ORS client with the trip-specific call pattern."""

    def __init__(self, client: ORSClient | None = None) -> None:
        self._client = client or ORSClient()
        self._geocode_cache: dict[str, GeocodedPlace] = {}

    def plan(
        self,
        current_location: str,
        pickup_location: str,
        dropoff_location: str,
    ) -> TripRoute:
        """Geocode the three places and return two driving legs."""
        places = [
            self._geocode(current_location),
            self._geocode(pickup_location),
            self._geocode(dropoff_location),
        ]
        legs = [
            self._leg(places[0], places[1]),
            self._leg(places[1], places[2]),
        ]
        return TripRoute(legs=legs)

    def _geocode(self, query: str) -> GeocodedPlace:
        key = query.strip()
        cached = self._geocode_cache.get(key)
        if cached is not None:
            return cached
        place = _do_geocode(self._client, key)
        self._geocode_cache[key] = place
        return place

    def _leg(self, start: GeocodedPlace, end: GeocodedPlace) -> RouteLeg:
        try:
            response = self._client.directions(
                [start.coordinate.as_ors(), end.coordinate.as_ors()]
            )
        except ORSClientError:
            raise
        routes = response.get("routes") or []
        if not routes:
            raise RoutingError(f"No route between {start.query} and {end.query}")
        route = routes[0]
        summary = route.get("summary") or {}
        distance = float(summary.get("distance") or 0.0)
        duration = float(summary.get("duration") or 0.0)
        polyline_points = _decode_polyline(route.get("geometry") or "")
        cumulative = _scale_cumulative_miles(
            _cumulative_miles(polyline_points), distance / METERS_PER_MILE
        )
        steps = _extract_route_steps(route)
        return RouteLeg(
            start=start,
            end=end,
            distance_meters=distance,
            duration_seconds=duration,
            polyline=polyline_points,
            cumulative_miles=cumulative,
            steps=steps,
        )


def coordinate_at_mile(leg: RouteLeg, target_mile: float) -> Coordinate:
    """Linear-interpolated coordinate at ``target_mile`` into ``leg``.

    Used by the HOS engine to place fuel stops on the route.
    """
    if not leg.polyline:
        return leg.start.coordinate
    if target_mile <= 0.0:
        return leg.polyline[0]
    if target_mile >= leg.cumulative_miles[-1]:
        return leg.polyline[-1]
    for i, miles_at_point in enumerate(leg.cumulative_miles):
        if miles_at_point >= target_mile:
            prev_idx = max(i - 1, 0)
            prev_miles = leg.cumulative_miles[prev_idx]
            span = miles_at_point - prev_miles
            if span <= 0:
                return leg.polyline[i]
            t = (target_mile - prev_miles) / span
            a, b = leg.polyline[prev_idx], leg.polyline[i]
            return Coordinate(
                lat=a.lat + (b.lat - a.lat) * t,
                lng=a.lng + (b.lng - a.lng) * t,
            )
    return leg.polyline[-1]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _do_geocode(client: ORSClient, query: str) -> GeocodedPlace:
    """Geocode a single query string via ORS."""
    response = client.geocode(query)
    features = response.get("features") or []
    if not features:
        raise RoutingError(f"Could not geocode location: {query!r}")
    feature = features[0]
    coords = feature.get("geometry", {}).get("coordinates") or []
    if len(coords) < 2:
        raise RoutingError(f"Geocoder returned no coordinates for {query!r}")
    lng, lat = float(coords[0]), float(coords[1])
    label = feature.get("properties", {}).get("label") or query
    return GeocodedPlace(query=query, resolved_label=label, coordinate=Coordinate(lat=lat, lng=lng))


def _decode_polyline(encoded: str) -> list[Coordinate]:
    """Decode an ORS-encoded polyline string into ordered (lat, lng) points."""
    if not encoded:
        return []
    decoded = ors_convert.decode_polyline(encoded)
    coords: Iterable[list[float]] = decoded.get("coordinates") or []
    return [Coordinate(lat=float(pt[1]), lng=float(pt[0])) for pt in coords if len(pt) >= 2]


def _extract_route_steps(route: dict) -> list[RouteStep]:
    """Flatten ORS segment steps into the leg's ordered instructions."""
    route_steps: list[RouteStep] = []
    for segment in route.get("segments") or []:
        for raw_step in segment.get("steps") or []:
            step = _route_step_from_ors(raw_step)
            if step is not None:
                route_steps.append(step)
    return route_steps


def _route_step_from_ors(raw_step: dict) -> RouteStep | None:
    instruction = str(raw_step.get("instruction") or "").strip()
    name = str(raw_step.get("name") or "").strip()
    if not instruction:
        instruction = name
    if not instruction:
        return None

    return RouteStep(
        instruction=instruction,
        name=name,
        distance_meters=_float_or_zero(raw_step.get("distance")),
        duration_seconds=_float_or_zero(raw_step.get("duration")),
        type=_int_or_none(raw_step.get("type")),
        way_points=_way_points(raw_step.get("way_points")),
    )


def _float_or_zero(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _int_or_none(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _way_points(value) -> tuple[int, ...]:
    if not isinstance(value, list):
        return ()
    points: list[int] = []
    for point in value:
        converted = _int_or_none(point)
        if converted is not None:
            points.append(converted)
    return tuple(points)


def _cumulative_miles(points: list[Coordinate]) -> list[float]:
    """Walk the polyline and accumulate haversine distance in miles per point."""
    if not points:
        return []
    cumulative = [0.0]
    for i in range(1, len(points)):
        cumulative.append(cumulative[-1] + _haversine_miles(points[i - 1], points[i]))
    return cumulative


def _scale_cumulative_miles(
    cumulative: list[float], target_total_miles: float
) -> list[float]:
    """Normalize geometry-derived mileage to the provider summary distance.

    ORS summary distance follows roads; decoded geometry length is a haversine
    approximation over sampled points. Fuel stops are required by route miles, so
    the interpolation axis must end at the ORS summary distance.
    """
    if not cumulative:
        return []
    source_total = cumulative[-1]
    if source_total <= 0 or target_total_miles <= 0:
        return cumulative
    scale = target_total_miles / source_total
    return [miles * scale for miles in cumulative]


def _haversine_miles(a: Coordinate, b: Coordinate) -> float:
    """Great-circle distance between two coordinates, in miles."""
    earth_radius_miles = 3958.7613
    lat1 = math.radians(a.lat)
    lat2 = math.radians(b.lat)
    dlat = lat2 - lat1
    dlng = math.radians(b.lng - a.lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * earth_radius_miles * math.asin(math.sqrt(h))
