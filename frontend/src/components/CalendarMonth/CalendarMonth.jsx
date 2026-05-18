import LogStrip from "../LogStrip/LogStrip.jsx";
import styles from "./CalendarMonth.module.css";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month grid. Cells with a matching DailyLog show its LogStrip and total
 * drive time. Clicking a populated day calls onSelect(log).
 *
 * Props:
 *   year, month        Numeric (month is 0-indexed).
 *   logsByDate         Map<ISO date string, DailyLog>.
 *   today              ISO date string of today.
 *   onSelect           (log) => void
 */
export default function CalendarMonth({ year, month, logsByDate, today, onSelect }) {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // ISO-week start (Mon=0). JS getDay() returns 0=Sun..6=Sat.
  const leading = (firstOfMonth.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < leading; i++) {
    cells.push({ blank: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = formatIso(year, month, d);
    cells.push({
      iso,
      day: d,
      log: logsByDate.get(iso),
      isToday: iso === today,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ blank: true });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.dowRow}>
        {DOW.map((d) => (
          <span key={d} className={styles.dow}>{d}</span>
        ))}
      </div>
      <div className={styles.grid}>
        {cells.map((cell, i) =>
          cell.blank ? (
            <div key={i} className={styles.blank} />
          ) : cell.log ? (
            <button
              key={cell.iso}
              type="button"
              className={`${styles.cell} ${styles.cellActive} ${cell.isToday ? styles.today : ""}`}
              onClick={() => onSelect?.(cell.log)}
            >
              <span className={styles.dayNum}>{cell.day}</span>
              <LogStrip segments={cell.log.segments ?? []} height={6} />
              <span className={styles.hours}>
                <span className="mono tabular">{formatHours(cell.log.totals?.driving_minutes ?? 0)}</span> hr
              </span>
            </button>
          ) : (
            <div
              key={cell.iso}
              className={`${styles.cell} ${styles.cellEmpty} ${cell.isToday ? styles.today : ""}`}
            >
              <span className={styles.dayNum}>{cell.day}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function formatIso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatHours(minutes) {
  return (minutes / 60).toFixed(1);
}
