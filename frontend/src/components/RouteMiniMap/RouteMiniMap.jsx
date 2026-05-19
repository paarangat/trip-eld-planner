// Compact Leaflet preview used inside the Dashboard "active trip" card.
// Same data the full RouteMap consumes, but no header, no legend, fixed
// height, optional "current position" marker.

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";

import {
  hashLatLngPoints,
  isValidLatLng,
  routeFitPoints,
  routeMarkers,
  routePolyline,
} from "../../lib/routeGeometry.js";
import { STOP_GLYPHS } from "../../lib/stops.js";
import styles from "./RouteMiniMap.module.css";

function miniIcon(kind) {
  return L.divIcon({
    className: "",
    html: `<div class="mini-marker" data-kind="${kind}">${STOP_GLYPHS[kind] ?? "*"}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function FitBounds({ points }) {
  const map = useMap();
  const hash = useMemo(() => hashLatLngPoints(points), [points]);
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [20, 20] });
    const timer = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(timer);
  }, [map, points, hash]);
  return null;
}

export default function RouteMiniMap({
  route,
  stops = [],
  places = [],
  currentPosition = null,
  height = 260,
}) {
  const polyline = useMemo(() => routePolyline(route), [route]);
  const markers = useMemo(
    () => routeMarkers({ places, stops }),
    [places, stops],
  );

  const fitPoints = useMemo(
    () => routeFitPoints(polyline, markers),
    [polyline, markers],
  );
  const currentIsValid = isValidLatLng(currentPosition?.lat, currentPosition?.lng);

  if (polyline.length === 0) {
    return (
      <div className={styles.empty} style={{ height }}>
        <span>Route preview unavailable</span>
      </div>
    );
  }

  return (
    <div className={styles.host} style={{ height }}>
      <MapContainer
        center={polyline[0]}
        zoom={5}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Polyline
          positions={polyline}
          pathOptions={{ color: "#047857", weight: 4, opacity: 0.85 }}
        />
        {markers.map((m, i) => (
          <Marker
            key={`${m.kind}-${i}`}
            position={[m.lat, m.lng]}
            icon={miniIcon(m.kind)}
          />
        ))}
        {currentIsValid ? (
          <Marker
            position={[currentPosition.lat, currentPosition.lng]}
            icon={miniIcon("current")}
          />
        ) : null}
        <FitBounds points={fitPoints} />
      </MapContainer>
    </div>
  );
}
