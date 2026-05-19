import { useId } from "react";

import styles from "./Tabs.module.css";

/**
 * Horizontal tab list following the WAI-ARIA tabs pattern.
 *
 * Each tab button receives `aria-controls="${panelIdPrefix}-{value}"` so screen
 * readers know which tabpanel the tab governs. Consumers that render their
 * panels should set the matching `id` (and ideally `role="tabpanel"` plus
 * `aria-labelledby={tabId}`) on the panel container, using the same
 * `panelIdPrefix`. When `panelIdPrefix` is omitted, a stable per-instance
 * prefix is derived from `useId`, which keeps the references internally
 * consistent even if the consumer hasn't wired up panel ids yet.
 */
export default function Tabs({
  value,
  onChange,
  tabs = [],
  ariaLabel = "Tabs",
  panelIdPrefix,
}) {
  const groupId = useId();
  const panelPrefix = panelIdPrefix ?? `${groupId}-panel`;
  return (
    <div
      className={styles.tabs}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
    >
      {tabs.map((tab) => {
        const isActive = tab.value === value;
        const tabId = `${groupId}-${tab.value}`;
        const panelId = `${panelPrefix}-${tab.value}`;
        return (
          <button
            key={tab.value}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={panelId}
            tabIndex={isActive ? 0 : -1}
            className={`${styles.tab} ${isActive ? styles.active : ""}`}
            onClick={() => onChange?.(tab.value)}
            onKeyDown={(e) => {
              const i = tabs.findIndex((t) => t.value === value);
              if (e.key === "ArrowRight") {
                e.preventDefault();
                onChange?.(tabs[(i + 1) % tabs.length].value);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                onChange?.(tabs[(i - 1 + tabs.length) % tabs.length].value);
              }
            }}
          >
            {tab.label}
            {tab.count != null ? <span className={styles.count}>{tab.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
