// Loads the most-recent trip from localStorage and decides whether it is
// "active" (today falls inside its date range). Used by the Dashboard to
// populate the HOS clocks.

import { useEffect, useState } from "react";

import { getTrip } from "../api/tripApi.js";
import { todayIso } from "../lib/format.js";
import { useRecentTrips } from "./useRecentTrips.js";

export function useActiveTrip(timeZone = "America/Chicago") {
  const { ids } = useRecentTrips();
  const mostRecentId = ids[0];

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!mostRecentId) {
      return undefined;
    }
    const controller = new AbortController();
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return null;
        setLoading(true);
        setError(null);
        return getTrip(mostRecentId, { signal: controller.signal });
      })
      .then((data) => {
        if (!data) return;
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

  const currentTrip = trip?.id === mostRecentId ? trip : null;
  const today = todayIso(timeZone);
  const isActive = isTripActive(currentTrip, today);
  const todayLog = currentTrip
    ? currentTrip.daily_logs?.find((l) => l.date === today)
    : null;

  return {
    trip: currentTrip,
    isActive,
    todayLog,
    loading: mostRecentId ? loading || (!currentTrip && !error) : false,
    error: mostRecentId ? error : null,
  };
}

function isTripActive(trip, today) {
  if (!trip) return false;
  const logs = trip.daily_logs ?? [];
  if (logs.length === 0) return false;
  return today >= logs[0].date && today <= logs[logs.length - 1].date;
}
