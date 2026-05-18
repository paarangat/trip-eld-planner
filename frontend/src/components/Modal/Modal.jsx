import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import styles from "./Modal.module.css";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

export default function Modal({ open, onClose, title, children, footer = null }) {
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);
  const scrimMouseDownRef = useRef(false);
  const titleId = useId();

  // Body scroll lock + escape-to-close + focus restoration.
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose]);

  // Move focus into the dialog when it opens.
  useEffect(() => {
    if (!open) return;
    const focusables = getFocusableElements(panelRef.current);
    const target = focusables[0] ?? closeButtonRef.current;
    target?.focus?.();
  }, [open]);

  // Focus trap: keep Tab/Shift+Tab inside the panel.
  const onPanelKeyDown = useCallback((e) => {
    if (e.key !== "Tab") return;
    const focusables = getFocusableElements(panelRef.current);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // Scrim close only when both mousedown and click started on the scrim itself.
  const onScrimMouseDown = useCallback((e) => {
    scrimMouseDownRef.current = e.target === e.currentTarget;
  }, []);

  const onScrimClick = useCallback(
    (e) => {
      const startedOnScrim = scrimMouseDownRef.current;
      scrimMouseDownRef.current = false;
      if (startedOnScrim && e.target === e.currentTarget) {
        onClose?.();
      }
    },
    [onClose],
  );

  if (!open) return null;

  const node = (
    <div
      className={styles.scrim}
      onMouseDown={onScrimMouseDown}
      onClick={onScrimClick}
      role="presentation"
    >
      <aside
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onPanelKeyDown}
      >
        <header className={styles.head}>
          <h3 id={titleId} className={styles.title}>
            {title}
          </h3>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="m3 3 10 10M13 3 3 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.foot}>{footer}</footer> : null}
      </aside>
    </div>
  );

  return createPortal(node, document.body);
}
