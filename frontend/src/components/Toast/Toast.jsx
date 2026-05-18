import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import styles from "./Toast.module.css";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    ({ tone = "success", message, durationMs = 4000 }) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, tone, message }]);
      if (durationMs > 0) {
        setTimeout(() => remove(id), durationMs);
      }
      return id;
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ push, remove }}>
      {children}
      <div className={styles.viewport} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[`t_${t.tone}`]}`}>
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

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // graceful no-op when used outside provider
    return { push: () => {}, remove: () => {} };
  }
  return ctx;
}
