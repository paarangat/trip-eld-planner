import assert from "node:assert/strict";
import test from "node:test";

import { isValidLatLng, routeMarkers, routePolyline } from "./routeGeometry.js";

test("isValidLatLng rejects malformed coordinates", () => {
  assert.equal(isValidLatLng(41.88, -87.63), true);
  assert.equal(isValidLatLng(95, -87.63), false);
  assert.equal(isValidLatLng(41.88, Number.NaN), false);
});

test("routePolyline filters invalid points", () => {
  const points = routePolyline({
    legs: [
      {
        polyline: [
          [41.88, -87.63],
          [95, -87.63],
          null,
        ],
      },
    ],
  });

  assert.deepEqual(points, [[41.88, -87.63]]);
});

test("routeMarkers keeps only valid start and stop markers", () => {
  const markers = routeMarkers({
    places: [{ label: "Start", lat: 41.88, lng: -87.63 }],
    stops: [
      { kind: "fuel", label: "Fuel", lat: 39.0, lng: -90.0 },
      { kind: "break", label: "Bad", lat: 200, lng: -90.0 },
    ],
  });

  assert.deepEqual(
    markers.map((marker) => marker.kind),
    ["start", "fuel"],
  );
});
