export function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function routePolyline(route) {
  const merged = [];
  for (const leg of route?.legs ?? []) {
    for (const point of leg.polyline ?? []) {
      if (Array.isArray(point) && isValidLatLng(point[0], point[1])) {
        merged.push(point);
      }
    }
  }
  return merged;
}

export function routeMarkers({ places = [], stops = [] } = {}) {
  const list = [];
  if (places[0] && isValidLatLng(places[0].lat, places[0].lng)) {
    list.push({
      kind: "start",
      label: places[0].label,
      lat: places[0].lat,
      lng: places[0].lng,
    });
  }
  for (const stop of stops) {
    if (isValidLatLng(stop?.lat, stop?.lng)) {
      list.push(stop);
    }
  }
  return list;
}

export function routeFitPoints(polyline, markers) {
  return [
    ...polyline,
    ...markers
      .filter((marker) => isValidLatLng(marker.lat, marker.lng))
      .map((marker) => [marker.lat, marker.lng]),
  ];
}

export function hashLatLngPoints(points, { precision = 4, threshold = 200, stride = 10 } = {}) {
  const sampled =
    points.length > threshold
      ? points.filter((_point, index) => index % stride === 0)
      : points;
  return sampled
    .map(([lat, lng]) => `${lat.toFixed(precision)},${lng.toFixed(precision)}`)
    .join("|");
}
