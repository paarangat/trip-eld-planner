import { useId } from "react";

import styles from "./SearchInput.module.css";

export default function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  ariaLabel = "Search",
  id: idProp,
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <div className={styles.wrap}>
      <span className={styles.icon} aria-hidden>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="m11 11 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <input
        id={id}
        type="search"
        className={styles.input}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
      />
      {value ? (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onChange?.("")}
          aria-label="Clear search"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="m3 3 8 8M11 3l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
