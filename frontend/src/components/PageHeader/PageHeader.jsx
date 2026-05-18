import styles from "./PageHeader.module.css";

export default function PageHeader({ eyebrow = "", title, description = "", actions = null }) {
  return (
    <header className={styles.head}>
      <div className={styles.body}>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.desc}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
