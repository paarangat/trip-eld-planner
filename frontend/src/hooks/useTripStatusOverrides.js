// Per-trip manual status pins, stored locally so the driver can mark a
// planned trip as "in progress" before its start date — useful when the
// fixed-time assumption in trip planning doesn't match real dispatch.
//
// The map shape is { [tripId]: status } where status is one of the values
// from TRIP_STATUS or null (no pin). Synced across tabs via the storage
// event, same pattern as useRecentTrips.

import { useCallback, useEffect, useState } from "react";

import { TRIP_STATUS } from "../lib/tripStatus.js";

const STORAGE_KEY = "dispatch.trip_status_overrides";
const VALID = new Set(Object.values(TRIP_STATUS));

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out = {};
    for (const [id, status] of Object.entries(parsed)) {
      if (typeof id === "string" && VALID.has(status)) {
        out[id] = status;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function save(overrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore quota errors
  }
}

export function useTripStatusOverrides() {
  const [overrides, setOverrides] = useState(load);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setOverrides(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setStatus = useCallback((id, status) => {
    if (!id) return;
    setOverrides((prev) => {
      const next = { ...prev };
      if (status && VALID.has(status)) {
        next[id] = status;
      } else {
        delete next[id];
      }
      save(next);
      return next;
    });
  }, []);

  const clearStatus = useCallback((id) => {
    setOverrides((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      save(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setOverrides({});
    save({});
  }, []);

  return { overrides, setStatus, clearStatus, clearAll };
}
