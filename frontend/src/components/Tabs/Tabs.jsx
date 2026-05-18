import { useId } from "react";

import styles from "./Tabs.module.css";

export default function Tabs({ value, onChange, tabs = [], ariaLabel = "Tabs" }) {
  const groupId = useId();
  return (
    <div className={styles.tabs} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const isActive = tab.value === value;
        const tabId = `${groupId}-${tab.value}`;
        return (
          <button
            key={tab.value}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={isActive}
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
