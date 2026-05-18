import styles from "./StatCard.module.css";

export default function StatCard({ label, value, unit = "", hint = "", tone = "default" }) {
  return (
    <div className={`${styles.card} ${tone !== "default" ? styles[`t_${tone}`] : ""}`}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        <span className={`mono tabular ${styles.num}`}>{value}</span>
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </span>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}
