// Loads the most-recent trip from localStorage and decides whether it is
// "active" (today falls inside its date range). Used by the Dashboard to
// populate the HOS clocks.

import { useEffect, useState } from "react";

import { getTrip } from "../api/tripApi.js";
import { useRecentTrips } from "./useRecentTrips.js";

function todayIso(timeZone = "America/Chicago") {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

export function useActiveTrip(timeZone = "America/Chicago") {
  const { ids } = useRecentTrips();
  const mostRecentId = ids[0];

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!mostRecentId) {
      setTrip(null);
      setLoading(false);
      setError(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getTrip(mostRecentId, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setTrip(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setError(err);
        setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [mostRecentId]);

  const today = todayIso(timeZone);
  const isActive = isTripActive(trip, today);
  const todayLog = trip ? trip.daily_logs?.find((l) => l.date === today) : null;

  return { trip, isActive, todayLog, loading, error };
}

function isTripActive(trip, today) {
  if (!trip) return false;
  const logs = trip.daily_logs ?? [];
  if (logs.length === 0) return false;
  return today >= logs[0].date && today <= logs[logs.length - 1].date;
}
