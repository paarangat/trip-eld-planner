// Tracks a local cache of free-text location queries the driver has used.
// Used as <datalist> source on the New Trip form.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dispatch.location_history";
const CAP = 30;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function save(arr) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, CAP)));
  } catch {
    // ignore quota errors
  }
}

export function useLocationHistory() {
  const [items, setItems] = useState(load);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setItems(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const remember = useCallback((...newItems) => {
    setItems((prev) => {
      const cleaned = newItems
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean);
      if (!cleaned.length) return prev;
      const merged = [...new Set([...cleaned, ...prev])].slice(0, CAP);
      save(merged);
      return merged;
    });
  }, []);

  return { items, remember };
}
