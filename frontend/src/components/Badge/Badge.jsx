import styles from "./Badge.module.css";

export default function Badge({ tone = "neutral", dot = false, children, className = "" }) {
  const classes = [styles.badge, styles[`t_${tone}`], className].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      {dot ? <span className={styles.dot} aria-hidden /> : null}
      {children}
    </span>
  );
}
