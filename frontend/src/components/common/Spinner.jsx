import styles from "./Spinner.module.css";

export default function Spinner({ label = "Loading…" }) {
  return (
    <div className={styles.wrap} aria-live="polite" role="status">
      <span className={styles.bar}>
        <span className={styles.barFill} />
      </span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
