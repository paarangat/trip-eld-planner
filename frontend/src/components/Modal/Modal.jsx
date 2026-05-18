import { useEffect } from "react";
import { createPortal } from "react-dom";

import styles from "./Modal.module.css";

export default function Modal({ open, onClose, title, children, footer = null }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const node = (
    <div className={styles.scrim} onClick={onClose} role="presentation">
      <aside
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <h3 className={styles.title}>{title}</h3>
          <button
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
