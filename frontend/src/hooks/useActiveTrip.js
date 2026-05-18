// Loads the most-recent trip from localStorage and decides whether it is
// "active" (today falls inside its date range). Used by the Dashboard to
// populate the HOS clocks.

import { useEffect, useState } from "react";

import { getTrip } from "../api/tripApi.js";
import { useRecentTrips } from "./useRecentTrips.js";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useActiveTrip() {
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
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTrip(mostRecentId)
      .then((data) => {
        if (!cancelled) {
          setTrip(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mostRecentId]);

  const isActive = isTripActive(trip);
  const todayLog = trip ? trip.daily_logs?.find((l) => l.date === todayIso()) : null;

  return { trip, isActive, todayLog, loading, error };
}

function isTripActive(trip) {
  if (!trip) return false;
  const logs = trip.daily_logs ?? [];
  if (logs.length === 0) return false;
  const today = todayIso();
  return today >= logs[0].date && today <= logs[logs.length - 1].date;
}
