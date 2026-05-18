import styles from "./ErrorBanner.module.css";

export default function ErrorBanner({ error }) {
  if (!error) return null;
  return (
    <div role="alert" className={styles.banner}>
      <span className={styles.label}>Could not plan trip</span>
      <span className={styles.message}>{error.message ?? String(error)}</span>
    </div>
  );
}
