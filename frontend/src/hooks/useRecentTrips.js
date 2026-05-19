// localStorage-backed list of recent trip IDs, capped at 50.
// Synced across browser tabs via the storage event.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dispatch.recent_trip_ids";
const CAP = 50;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((id) => typeof id === "string").slice(0, CAP);
  } catch {
    return [];
  }
}

function save(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, CAP)));
  } catch {
    // ignore quota errors
  }
}

export function useRecentTrips() {
  const [ids, setIds] = useState(load);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setIds(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const remember = useCallback((id) => {
    if (!id) return;
    setIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, CAP);
      save(next);
      return next;
    });
  }, []);

  const forget = useCallback((id) => {
    setIds((prev) => {
      const next = prev.filter((x) => x !== id);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds([]);
    save([]);
  }, []);

  return { ids, remember, forget, clear };
}
