// User-level settings - driver name, home-terminal timezone, default start.
// Persisted to localStorage.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dispatch.settings";

const DEFAULTS = {
  driverName: "",
  timezone: "America/Chicago",
  defaultStartTime: "06:00",
  currentCycleHours: 0,
  // Set when ``currentCycleHours`` was rolled forward from a prior trip's
  // projected end. Used by NewTrip to show a "continued from trip X" hint -
  // and to know to clear it as soon as the user manually adjusts the slider.
  cycleHoursSource: null, // { tripId: string, endDate: string } | null
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(load);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        setSettings(load());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }, []);

  return { settings, update };
}
