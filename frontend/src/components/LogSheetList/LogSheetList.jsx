// One LogSheet per trip day, with a section header.

import LogSheet from "../LogSheet/LogSheet.jsx";
import styles from "./LogSheetList.module.css";

export default function LogSheetList({ logs = [] }) {
  if (logs.length === 0) {
    return null;
  }
  return (
    <section className={styles.wrap} aria-label="Daily logs">
      <header className={styles.head}>
        <h2 className={styles.headTitle}>Daily logs</h2>
        <span className={styles.headCount}>
          {logs.length} sheet{logs.length === 1 ? "" : "s"} · FMCSA format
        </span>
      </header>
      <div className={styles.stack}>
        {logs.map((log, idx) => (
          <LogSheet key={log.date} log={log} dayNumber={idx + 1} />
        ))}
      </div>
    </section>
  );
}
