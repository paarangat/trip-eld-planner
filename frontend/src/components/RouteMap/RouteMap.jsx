// Leaflet route + stop markers. The backend provides decoded lat/lng polylines
// per leg and a flat list of stops; this component only draws.

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

import { formatDateTimeShort } from "../../lib/format.js";
import {
  hashLatLngPoints,
  routeFitPoints,
  routeMarkers,
  routePolyline,
} from "../../lib/routeGeometry.js";
import {
  MAP_LEGEND_STOPS,
  STOP_GLYPHS,
  stopColor,
  stopLabel,
} from "../../lib/stops.js";
import styles from "./RouteMap.module.css";

// Hash precision (~11 m at the equator) is enough to detect a real point-set
// change without churning on sub-meter float jitter.
const FIT_HASH_PRECISION = 4;
// Sampling threshold keeps the hash bounded for long polylines (thousands of
// points); every 10th sample still captures any meaningful shape change.
const FIT_HASH_SAMPLE_THRESHOLD = 200;
const FIT_HASH_SAMPLE_STRIDE = 10;

function dispatchIcon(kind) {
  return L.divIcon({
    className: "",
    html: `<div class="dispatch-marker" data-kind="${kind}">${STOP_GLYPHS[kind] ?? "*"}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function FitBounds({ points }) {
  const map = useMap();
  // Hash the point set so the effect re-fires only when coordinates actually
  // change - not when a parent re-renders and hands us a fresh array reference.
  const hash = useMemo(
    () =>
      hashLatLngPoints(points, {
        precision: FIT_HASH_PRECISION,
        threshold: FIT_HASH_SAMPLE_THRESHOLD,
        stride: FIT_HASH_SAMPLE_STRIDE,
      }),
    [points],
  );

  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40] });
    // Invalidate after layout settles - fixes gray tiles in hidden containers.
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, hash]);
  return null;
}

export default function RouteMap({ route, stops = [], places = [] }) {
  const polyline = useMemo(() => routePolyline(route), [route]);
  const allMarkers = useMemo(
    () => routeMarkers({ places, stops }),
    [places, stops],
  );

  const fitPoints = useMemo(
    () => routeFitPoints(polyline, allMarkers),
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
          {MAP_LEGEND_STOPS.map((kind) => (
            <span key={kind} className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: stopColor(kind) }}
              />
              {stopLabel(kind)}
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
            pathOptions={{ color: "#047857", weight: 4, opacity: 0.85 }}
          />
          {allMarkers.map((marker, idx) => (
            <Marker
              key={`${marker.kind}-${idx}`}
              position={[marker.lat, marker.lng]}
              icon={dispatchIcon(marker.kind)}
            >
              <Popup>
                <div className={styles.popupHead}>
                  {stopLabel(marker.kind)}
                </div>
                <div className={styles.popupTitle}>{marker.label}</div>
                {marker.start && (
                  <div className={styles.popupTime}>
                    {formatDateTimeShort(marker.start)}
                    {marker.end ? ` -> ${formatDateTimeShort(marker.end)}` : ""}
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
