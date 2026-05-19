import { useCallback, useEffect, useRef, useState } from "react";

import { ToastContext } from "./ToastContext.js";
import styles from "./Toast.module.css";

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map());

  const remove = useCallback((id) => {
    const entry = timersRef.current.get(id);
    if (entry?.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pause = useCallback((id) => {
    const entry = timersRef.current.get(id);
    if (!entry || entry.timeoutId == null) return;
    clearTimeout(entry.timeoutId);
    const elapsed = Date.now() - entry.startedAt;
    timersRef.current.set(id, {
      timeoutId: null,
      remainingMs: Math.max(0, entry.remainingMs - elapsed),
      startedAt: 0,
    });
  }, []);

  const resume = useCallback(
    (id) => {
      const entry = timersRef.current.get(id);
      if (!entry || entry.timeoutId != null) return;
      if (entry.remainingMs <= 0) return;
      const timeoutId = setTimeout(() => remove(id), entry.remainingMs);
      timersRef.current.set(id, {
        timeoutId,
        remainingMs: entry.remainingMs,
        startedAt: Date.now(),
      });
    },
    [remove],
  );

  const push = useCallback(
    ({ tone = "success", message, durationMs = 4000 }) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, tone, message }]);
      if (durationMs > 0) {
        const timeoutId = setTimeout(() => remove(id), durationMs);
        timersRef.current.set(id, {
          timeoutId,
          remainingMs: durationMs,
          startedAt: Date.now(),
        });
      }
      return id;
    },
    [remove],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((entry) => {
        if (entry.timeoutId) {
          clearTimeout(entry.timeoutId);
        }
      });
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ push, remove }}>
      {children}
      <div className={styles.viewport} aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles.toast} ${styles[`t_${t.tone}`]}`}
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
            onFocus={() => pause(t.id)}
            onBlur={() => resume(t.id)}
          >
            <span className={styles.dot} aria-hidden />
            <span className={styles.message}>{t.message}</span>
            <button
              type="button"
              className={styles.close}
              onClick={() => remove(t.id)}
              aria-label="Dismiss"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 2l8 8M10 2l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
