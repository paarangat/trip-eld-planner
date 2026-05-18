// User-level settings — driver name, home-terminal timezone, theme, default start.
// Persisted to localStorage and applied to <html data-theme>.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "dispatch.settings";

const DEFAULTS = {
  driverName: "",
  timezone: "America/Chicago",
  theme: "system", // "light" | "dark" | "system"
  defaultStartTime: "06:00",
  currentCycleHours: 0,
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

function applyTheme(theme) {
  const root = document.documentElement;
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  root.setAttribute("data-theme", resolved);
}

export function useSettings() {
  const [settings, setSettings] = useState(load);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => applyTheme("system");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    return undefined;
  }, [settings.theme]);

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

export function useStoredTheme() {
  // For early bootstrapping if needed; not used currently but kept for parity.
  return load().theme;
}
