import { useEffect, useId, useRef, useState } from "react";

import { fetchLocationSuggestions } from "../../api/tripApi.js";
import styles from "./LocationAutocomplete.module.css";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LEN = 2;

export default function LocationAutocomplete({
  label,
  value,
  onChange,
  placeholder = "",
  required = false,
  disabled = false,
  leadingIcon = null,
  helper = "",
  error = "",
  fallbackOptions = [],
  id: idProp,
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listboxId = `${id}-listbox`;
  const describedBy = error ? `${id}-error` : helper ? `${id}-helper` : undefined;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Track the last query the user picked so we don't immediately re-fetch
  // suggestions for it (which would reopen the dropdown after a selection).
  const justPickedRef = useRef("");
  const inputRef = useRef(null);
  const blurTimerRef = useRef(null);

  const trimmed = value?.trim() ?? "";
  const queryLongEnough = trimmed.length >= MIN_QUERY_LEN;

  useEffect(() => {
    if (!queryLongEnough) return undefined;
    if (justPickedRef.current && trimmed === justPickedRef.current) {
      return undefined;
    }
    justPickedRef.current = "";

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const data = await fetchLocationSuggestions(trimmed, {
          signal: controller.signal,
        });
        setItems(Array.isArray(data?.results) ? data.results : []);
        setActive(-1);
      } catch (err) {
        if (err?.name === "AbortError") return;
        setItems([]);
        setFetchError(err?.message ?? "Lookup failed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, queryLongEnough]);

  // When the query drops below the threshold, hide stale suggestions without
  // wiping `items` state (which would force a setState during render).
  const visibleItems = queryLongEnough ? items : [];
  const visibleLoading = queryLongEnough && loading;
  const visibleError = queryLongEnough ? fetchError : null;

  useEffect(() => () => clearTimeout(blurTimerRef.current), []);

  function handleInput(next) {
    onChange?.(next);
    setOpen(true);
  }

  function handleFocus() {
    setOpen(true);
  }

  function handleBlur() {
    // Delay close so a mousedown on a suggestion can fire first.
    blurTimerRef.current = setTimeout(() => setOpen(false), 120);
  }

  function pick(item) {
    clearTimeout(blurTimerRef.current);
    justPickedRef.current = item.label;
    onChange?.(item.label, item);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
  }

  function handleKeyDown(e) {
    const list = visibleItems;
    if (e.key === "ArrowDown") {
      if (!open) setOpen(true);
      if (list.length > 0) {
        e.preventDefault();
        setActive((i) => (i + 1) % list.length);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      if (list.length > 0) {
        e.preventDefault();
        setActive((i) => (i <= 0 ? list.length - 1 : i - 1));
      }
      return;
    }
    if (e.key === "Enter") {
      if (open && active >= 0 && active < list.length) {
        e.preventDefault();
        pick(list[active]);
      }
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  const showFallback =
    open &&
    !visibleLoading &&
    visibleItems.length === 0 &&
    !visibleError &&
    !queryLongEnough &&
    fallbackOptions.length > 0;

  const showDropdown =
    open &&
    (visibleLoading ||
      visibleItems.length > 0 ||
      visibleError ||
      showFallback ||
      queryLongEnough);

  return (
    <div className={styles.field}>
      {label ? (
        <label htmlFor={id} className={styles.label}>
          {label}
          {required ? <span aria-hidden className={styles.req}>*</span> : null}
        </label>
      ) : null}
      <div className={styles.combo}>
        <div className={`${styles.shell} ${error ? styles.shellError : ""}`}>
          {leadingIcon ? <span className={styles.lead}>{leadingIcon}</span> : null}
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={value ?? ""}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              active >= 0 ? `${listboxId}-opt-${active}` : undefined
            }
            aria-describedby={describedBy}
            aria-invalid={Boolean(error) || undefined}
            className={styles.input}
          />
          {visibleLoading ? (
            <span className={styles.spinner} aria-hidden>
              <Spinner />
            </span>
          ) : null}
        </div>

        {showDropdown ? (
          <ul
            id={listboxId}
            role="listbox"
            className={styles.dropdown}
            onMouseDown={(e) => e.preventDefault()}
          >
            {visibleError ? (
              <li className={styles.message}>Lookup unavailable - try again.</li>
            ) : null}

            {!visibleError && visibleItems.length > 0
              ? visibleItems.map((item, i) => (
                  <li
                    key={`${item.label}-${item.lat}-${item.lng}`}
                    id={`${listboxId}-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={`${styles.option} ${
                      i === active ? styles.optionActive : ""
                    }`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(item)}
                  >
                    <span className={styles.optionLabel}>{item.label}</span>
                    {item.layer ? (
                      <span className={styles.optionMeta}>{item.layer}</span>
                    ) : null}
                  </li>
                ))
              : null}

            {!visibleError &&
            !visibleLoading &&
            visibleItems.length === 0 &&
            queryLongEnough ? (
              <li className={styles.message}>No matches.</li>
            ) : null}

            {showFallback
              ? fallbackOptions.map((opt) => (
                  <li
                    key={opt}
                    role="option"
                    aria-selected={false}
                    className={styles.option}
                    onClick={() => pick({ label: opt })}
                  >
                    <span className={styles.optionLabel}>{opt}</span>
                    <span className={styles.optionMeta}>recent</span>
                  </li>
                ))
              : null}
          </ul>
        ) : null}
      </div>

      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className={styles.helper}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 8 8"
          to="360 8 8"
          dur="0.7s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}
