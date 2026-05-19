import { useEffect, useMemo, useState } from "react";

import { getTrips } from "../api/tripApi.js";

function failedTrip(id) {
  return {
    id,
    __failed: true,
    inputs: {},
    summary: { total_miles: 0, days: 0 },
    daily_log_dates: [],
  };
}

export function useTripList({
  ids = [],
  includeLogs = false,
  refreshKey = 0,
} = {}) {
  const key = useMemo(() => ids.join("|"), [ids]);
  const stableIds = useMemo(() => (key ? key.split("|") : []), [key]);
  const requestKey = `${key}:${includeLogs ? "logs" : "summary"}:${refreshKey}`;
  const [state, setState] = useState({
    requestKey: "",
    key: "",
    items: [],
    error: null,
  });

  useEffect(() => {
    if (stableIds.length === 0) {
      return undefined;
    }

    const controller = new AbortController();

    getTrips({ ids: stableIds, includeLogs, signal: controller.signal })
      .then((body) => {
        if (controller.signal.aborted) return;
        const byId = new Map(
          (body.results ?? []).map((trip) => [
            trip.id,
            { ...trip, __failed: false },
          ]),
        );
        setState({
          requestKey,
          key,
          items: stableIds.map((id) => byId.get(id) ?? failedTrip(id)),
          error: null,
        });
      })
      .catch((err) => {
        if (err.name === "AbortError" || controller.signal.aborted) return;
        setState({
          requestKey,
          key,
          items: stableIds.map(failedTrip),
          error: err,
        });
      });

    return () => {
      controller.abort();
    };
  }, [key, requestKey, includeLogs, stableIds]);

  if (stableIds.length === 0) {
    return { key, items: [], loading: false, error: null };
  }

  return state.requestKey === requestKey
    ? { key, items: state.items, loading: false, error: state.error }
    : {
        key,
        items: state.key === key ? state.items : [],
        loading: true,
        error: null,
      };
}
