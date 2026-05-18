// Leaflet route + stop markers. The backend provides decoded lat/lng polylines
// per leg and a flat list of stops; this component only draws.

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

import styles from "./RouteMap.module.css";

const STOP_LABELS = {
  start: "Start",
  pickup: "Pickup",
  dropoff: "Drop-off",
  fuel: "Fuel",
  break: "Break",
  rest: "10-hr rest",
  restart: "34-hr restart",
};

const STOP_GLYPHS = {
  start: "S",
  pickup: "P",
  dropoff: "D",
  fuel: "F",
  break: "B",
  rest: "R",
  restart: "X",
};

const LEGEND = ["start", "pickup", "fuel", "break", "rest", "dropoff"];

// Hash precision (~11 m at the equator) is enough to detect a real point-set
// change without churning on sub-meter float jitter.
const FIT_HASH_PRECISION = 4;
// Sampling threshold keeps the hash bounded for long polylines (thousands of
// points); every 10th sample still captures any meaningful shape change.
const FIT_HASH_SAMPLE_THRESHOLD = 200;
const FIT_HASH_SAMPLE_STRIDE = 10;

function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function dispatchIcon(kind) {
  return L.divIcon({
    className: "",
    html: `<div class="dispatch-marker" data-kind="${kind}">${STOP_GLYPHS[kind] ?? "•"}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function FitBounds({ points }) {
  const map = useMap();
  // Hash the point set so the effect re-fires only when coordinates actually
  // change — not when a parent re-renders and hands us a fresh array reference.
  const hash = useMemo(() => {
    const sampled =
      points.length > FIT_HASH_SAMPLE_THRESHOLD
        ? points.filter((_, i) => i % FIT_HASH_SAMPLE_STRIDE === 0)
        : points;
    return sampled
      .map(
        ([lat, lng]) =>
          `${lat.toFixed(FIT_HASH_PRECISION)},${lng.toFixed(FIT_HASH_PRECISION)}`
      )
      .join("|");
  }, [points]);

  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40] });
    // Invalidate after layout settles — fixes gray tiles in hidden containers.
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, hash]);
  return null;
}

export default function RouteMap({ route, stops = [], places = [] }) {
  const polyline = useMemo(() => {
    const merged = [];
    for (const leg of route?.legs ?? []) {
      for (const point of leg.polyline ?? []) {
        // ORS expects lon,lat but our polylines arrive lat,lng — drop any
        // point that isn't a valid (lat, lng) pair so Leaflet doesn't crash
        // on NaN or land a marker on null island.
        if (Array.isArray(point) && isValidLatLng(point[0], point[1])) {
          merged.push(point);
        }
      }
    }
    return merged;
  }, [route]);

  const allMarkers = useMemo(() => {
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
  }, [places, stops]);

  const fitPoints = useMemo(
    () => [
      ...polyline,
      ...allMarkers
        .filter((m) => isValidLatLng(m.lat, m.lng))
        .map((m) => [m.lat, m.lng]),
    ],
    [polyline, allMarkers]
  );

  if (polyline.length === 0) {
    return null;
  }

  return (
    <section className={styles.wrap}>
      <header className={styles.head}>
        <h3>Route</h3>
        <div className={styles.legend} aria-label="Map legend">
          {LEGEND.map((kind) => (
            <span key={kind} className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: legendColor(kind) }}
              />
              {STOP_LABELS[kind]}
            </span>
          ))}
        </div>
      </header>
      <div className={styles.mapHost}>
        <MapContainer
          center={polyline[0]}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline
            positions={polyline}
            pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.85 }}
          />
          {allMarkers.map((marker, idx) => (
            <Marker
              key={`${marker.kind}-${idx}`}
              position={[marker.lat, marker.lng]}
              icon={dispatchIcon(marker.kind)}
            >
              <Popup>
                <div className={styles.popupHead}>
                  {STOP_LABELS[marker.kind] ?? marker.kind}
                </div>
                <div className={styles.popupTitle}>{marker.label}</div>
                {marker.start && (
                  <div className={styles.popupTime}>
                    {formatTime(marker.start)}
                    {marker.end ? ` → ${formatTime(marker.end)}` : ""}
                  </div>
                )}
              </Popup>
            </Marker>
          ))}
          <FitBounds points={fitPoints} />
        </MapContainer>
      </div>
    </section>
  );
}

function legendColor(kind) {
  switch (kind) {
    case "start":
      return "#0f172a";
    case "pickup":
      return "var(--success)";
    case "dropoff":
      return "var(--danger)";
    case "fuel":
      return "var(--warn)";
    case "break":
      return "var(--status-off)";
    case "rest":
      return "var(--status-sleeper)";
    case "restart":
      return "var(--primary)";
    default:
      return "var(--text-muted)";
  }
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
