import styles from "./ErrorBanner.module.css";

export default function ErrorBanner({ error, title = "Could not plan trip" }) {
  if (!error) return null;
  return (
    <div role="alert" className={styles.banner}>
      <span className={styles.label}>{title}</span>
      <span className={styles.message}>{error.message ?? String(error)}</span>
    </div>
  );
}
