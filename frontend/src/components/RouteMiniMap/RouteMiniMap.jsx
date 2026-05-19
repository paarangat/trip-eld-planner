// Compact Leaflet preview used inside the Dashboard "active trip" card.
// Same data the full RouteMap consumes, but no header, no legend, fixed
// height, optional "current position" marker. The full RouteMap (used on the
// Trip Detail page) is left untouched.

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";

import styles from "./RouteMiniMap.module.css";

const STOP_GLYPHS = {
  start: "S",
  pickup: "P",
  dropoff: "D",
  fuel: "F",
  break: "B",
  rest: "R",
  restart: "X",
  current: "•",
};

function miniIcon(kind) {
  return L.divIcon({
    className: "",
    html: `<div class="mini-marker" data-kind="${kind}">${STOP_GLYPHS[kind] ?? "•"}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [20, 20] });
    const timer = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(timer);
  }, [map, points]);
  return null;
}

export default function RouteMiniMap({
  route,
  stops = [],
  places = [],
  currentPosition = null,
  height = 260,
}) {
  const polyline = useMemo(() => {
    const merged = [];
    for (const leg of route?.legs ?? []) {
      for (const point of leg.polyline ?? []) merged.push(point);
    }
    return merged;
  }, [route]);

  const markers = useMemo(() => {
    const list = [];
    if (places[0]) {
      list.push({
        kind: "start",
        label: places[0].label,
        lat: places[0].lat,
        lng: places[0].lng,
      });
    }
    for (const stop of stops) list.push(stop);
    return list;
  }, [places, stops]);

  const fitPoints = useMemo(
    () => [...polyline, ...markers.map((m) => [m.lat, m.lng])],
    [polyline, markers],
  );

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
        {currentPosition?.lat != null && currentPosition?.lng != null ? (
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
