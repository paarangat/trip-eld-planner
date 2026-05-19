/* eslint-disable react-refresh/only-export-components */
// Scrub a virtual "now" along a planned trip's timeline.
//
// Two modes:
//   - "live"   - simulationNow follows real wall-clock, ticking every second.
//                Used automatically when a loaded trip's [start, end] range
//                brackets Date.now() (an in-progress trip).
//   - "manual" - simulationNow is controlled by the user (scrub) or by the
//                playback engine (Play at speed x real ms).
//
// `loadTrip` is idempotent on tripId so multiple pages can load the same
// trip without resetting the scrub position.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { clampToRange, clocksAt, parseSnapshots } from "../lib/clockSnapshots.js";

const SimulationContext = createContext(null);

export const SIMULATION_SPEEDS = [
  { value: 1, label: "1x" },
  { value: 60, label: "60x" },
  { value: 600, label: "600x" },
  { value: 3600, label: "1h/s" },
];

const DEFAULT_SPEED = SIMULATION_SPEEDS[2].value;
const EMPTY_ARRAY = Object.freeze([]);
const LIVE_TICK_MS = 1000;

export function SimulationProvider({ children }) {
  const [trip, setTrip] = useState(null);
  const [simulationNow, setSimulationNow] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  // "live" follows wall-clock; "manual" is user/play-controlled.
  const [mode, setMode] = useState("manual");
  const [wallClockNow, setWallClockNow] = useState(() => Date.now());

  const tripStartMs = trip?.startMs ?? null;
  const tripEndMs = trip?.endMs ?? null;
  const snapshots = trip?.snapshots ?? EMPTY_ARRAY;

  const loadTrip = useCallback(
    (tripData) => {
      if (
        !tripData ||
        !Array.isArray(tripData.clock_snapshots) ||
        tripData.clock_snapshots.length === 0
      ) {
        setTrip(null);
        setSimulationNow(null);
        setIsPlaying(false);
        setMode("manual");
        return;
      }
      // Idempotent - re-loading the same trip is a no-op so the user's
      // scrub position survives navigation between pages.
      if (tripData.id && trip?.id === tripData.id) return;

      const snaps = parseSnapshots(tripData.clock_snapshots);
      const startMs = snaps[0].at;
      const endMs = snaps[snaps.length - 1].at;
      const segments = flattenSegments(tripData.daily_logs);
      const stops = parseStops(tripData.stops, startMs);

      setTrip({
        id: tripData.id,
        snapshots: snaps,
        startMs,
        endMs,
        segments,
        stops,
      });

      // If real now is inside the trip range, start in live mode pinned to
      // wall-clock. Otherwise default to the trip start in manual mode.
      const realNow = Date.now();
      if (realNow >= startMs && realNow <= endMs) {
        setSimulationNow(realNow);
        setMode("live");
      } else {
        setSimulationNow(startMs);
        setMode("manual");
      }
      setIsPlaying(false);
    },
    [trip?.id],
  );

  const seek = useCallback(
    (time) => {
      setMode("manual");
      setSimulationNow((prev) => {
        if (!snapshots.length) return prev;
        return clampToRange(snapshots, time);
      });
    },
    [snapshots],
  );

  const play = useCallback(() => {
    if (!snapshots.length) return;
    setMode("manual");
    setIsPlaying((prev) => {
      if (prev) return prev;
      setSimulationNow((now) =>
        now != null && now >= tripEndMs ? tripStartMs : now,
      );
      return true;
    });
  }, [snapshots, tripStartMs, tripEndMs]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const reset = useCallback(() => {
    setMode("manual");
    if (tripStartMs != null) setSimulationNow(tripStartMs);
    setIsPlaying(false);
  }, [tripStartMs]);

  // Snap back to real-time-following live mode. Only meaningful while the
  // trip is currently in-progress per wall-clock - otherwise a no-op.
  const goLive = useCallback(() => {
    if (tripStartMs == null || tripEndMs == null) return;
    const realNow = Date.now();
    if (realNow < tripStartMs || realNow > tripEndMs) return;
    setSimulationNow(realNow);
    setIsPlaying(false);
    setMode("live");
  }, [tripStartMs, tripEndMs]);

  useEffect(() => {
    const id = setInterval(() => setWallClockNow(Date.now()), LIVE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Whether the trip is currently in-progress per wall-clock.
  const isInProgress = useMemo(() => {
    if (tripStartMs == null || tripEndMs == null) return false;
    return wallClockNow >= tripStartMs && wallClockNow <= tripEndMs;
  }, [tripStartMs, tripEndMs, wallClockNow]);

  // ----- Live mode: tick simulationNow to wall-clock once per second.
  useEffect(() => {
    if (mode !== "live" || tripStartMs == null || tripEndMs == null) {
      return undefined;
    }
    const tick = () => {
      const realNow = Date.now();
      if (realNow >= tripEndMs) {
        setSimulationNow(tripEndMs);
        setMode("manual");
        return;
      }
      if (realNow < tripStartMs) {
        // Wall-clock is before the trip window - leave live mode rather
        // than pinning to a pre-trip moment.
        setSimulationNow(tripStartMs);
        setMode("manual");
        return;
      }
      setSimulationNow(realNow);
    };
    tick();
    const id = setInterval(tick, LIVE_TICK_MS);
    return () => clearInterval(id);
  }, [mode, tripStartMs, tripEndMs]);

  // ----- Manual playback: advance simulationNow by realDelta × speed.
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);
  useEffect(() => {
    if (mode !== "manual" || !isPlaying) {
      cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
      return undefined;
    }
    const tick = (now) => {
      if (!lastTickRef.current) {
        lastTickRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const realDelta = now - lastTickRef.current;
      lastTickRef.current = now;
      setSimulationNow((prev) => {
        if (prev == null || tripEndMs == null) return prev;
        const next = prev + realDelta * speed;
        if (next >= tripEndMs) {
          setIsPlaying(false);
          return tripEndMs;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
    };
  }, [mode, isPlaying, speed, tripEndMs]);

  const segments = trip?.segments ?? EMPTY_ARRAY;
  const stops = trip?.stops ?? EMPTY_ARRAY;

  const value = useMemo(
    () => ({
      tripId: trip?.id ?? null,
      hasTrip: snapshots.length > 0,
      tripStartMs,
      tripEndMs,
      snapshots,
      segments,
      stops,
      simulationNow,
      isPlaying,
      speed,
      mode,
      isInProgress,
      loadTrip,
      seek,
      play,
      pause,
      toggle,
      reset,
      goLive,
      setSpeed,
    }),
    [
      trip?.id,
      snapshots,
      segments,
      stops,
      tripStartMs,
      tripEndMs,
      simulationNow,
      isPlaying,
      speed,
      mode,
      isInProgress,
      loadTrip,
      seek,
      play,
      pause,
      toggle,
      reset,
      goLive,
    ],
  );

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) {
    throw new Error("useSimulation must be used inside <SimulationProvider>");
  }
  return ctx;
}

export function useSimulatedClocks() {
  const { snapshots, simulationNow } = useSimulation();
  return useMemo(() => {
    if (!snapshots.length || simulationNow == null) return null;
    return clocksAt(snapshots, simulationNow);
  }, [snapshots, simulationNow]);
}

// What is the driver doing at simulationNow? Returns the segment whose
// [start, end) brackets the moment, plus a human label.
export function useSimulatedActivity() {
  const { segments, simulationNow } = useSimulation();
  return useMemo(() => {
    if (!segments.length || simulationNow == null) return null;
    const seg = findSegmentAt(segments, simulationNow);
    if (!seg) return null;
    return {
      status: seg.status,
      stop_kind: seg.stop_kind,
      note: seg.note,
      label: activityLabel(seg),
      tone: activityTone(seg),
    };
  }, [segments, simulationNow]);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function flattenSegments(dailyLogs) {
  if (!Array.isArray(dailyLogs)) return [];
  const out = [];
  for (const log of dailyLogs) {
    for (const seg of log.segments ?? []) {
      out.push({
        status: seg.status,
        stop_kind: seg.stop_kind,
        note: seg.note,
        startMs: new Date(seg.start).getTime(),
        endMs: new Date(seg.end).getTime(),
      });
    }
  }
  out.sort((a, b) => a.startMs - b.startMs);
  return out;
}

function parseStops(stops, tripStartMs) {
  if (!Array.isArray(stops)) return [];
  return stops
    .map((s) => ({
      kind: s.kind,
      label: s.label,
      startMs: new Date(s.start).getTime(),
      endMs: new Date(s.end).getTime(),
    }))
    .filter((s) => Number.isFinite(s.startMs) && s.startMs >= tripStartMs);
}

function findSegmentAt(segments, time) {
  const t = typeof time === "number" ? time : new Date(time).getTime();
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid];
    if (t < seg.startMs) hi = mid - 1;
    else if (t >= seg.endMs) lo = mid + 1;
    else return seg;
  }
  return segments[segments.length - 1] ?? null;
}

function activityLabel(seg) {
  if (seg.status === "driving") return "Driving";
  if (seg.status === "on_duty") {
    if (seg.stop_kind === "pickup") return "Pickup";
    if (seg.stop_kind === "dropoff") return "Drop-off";
    if (seg.stop_kind === "fuel") return "Fueling";
    return "On duty";
  }
  if (seg.status === "sleeper_berth") return "Sleeper berth";
  if (seg.stop_kind === "break") return "30-min break";
  if (seg.stop_kind === "rest") return "10-hr rest";
  if (seg.stop_kind === "restart") return "34-hr restart";
  return "Off duty";
}

function activityTone(seg) {
  if (seg.status === "driving") return "driving";
  if (seg.status === "on_duty") return "on-duty";
  if (seg.stop_kind === "rest" || seg.stop_kind === "restart") return "rest";
  return "off-duty";
}
