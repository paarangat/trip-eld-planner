import { Link } from "react-router-dom";

import Button from "../Button/Button.jsx";
import styles from "./TopBar.module.css";

export default function TopBar({ title, breadcrumb = null, onMenuClick }) {
  return (
    <header className={styles.bar}>
      <button
        type="button"
        className={styles.menu}
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M3 5h14M3 10h14M3 15h14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className={styles.crumb}>
        {breadcrumb ? <span className={styles.breadcrumb}>{breadcrumb}</span> : null}
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.actions}>
        <Button as={Link} to="/new" variant="primary" size="md" className={styles.cta}>
          + New trip
        </Button>
      </div>
    </header>
  );
}
