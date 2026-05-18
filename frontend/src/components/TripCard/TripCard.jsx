import { Link } from "react-router-dom";

import Badge from "../Badge/Badge.jsx";
import styles from "./TripCard.module.css";

export default function TripCard({ trip }) {
  if (!trip) return null;

  const inputs = trip.inputs ?? {};
  const summary = trip.summary ?? {};
  const date = formatDate(inputs.start_datetime);
  const failed = trip.__failed === true;

  return (
    <Link to={`/trips/${trip.id}`} className={styles.row}>
      <span className={styles.date}>{date}</span>
      <span className={styles.route}>
        <span className={styles.place}>{inputs.current_location ?? "—"}</span>
        <span className={styles.arrow} aria-hidden>→</span>
        <span className={styles.place}>{inputs.pickup_location ?? "—"}</span>
        <span className={styles.arrow} aria-hidden>→</span>
        <span className={styles.place}>{inputs.dropoff_location ?? "—"}</span>
      </span>
      <span className={styles.miles}>
        <span className="mono tabular">{formatMiles(summary.total_miles)}</span> mi
      </span>
      <span className={styles.days}>
        <span className="mono tabular">{summary.days ?? "—"}</span>{" "}
        {(summary.days ?? 1) === 1 ? "day" : "days"}
      </span>
      <span className={styles.status}>
        {failed ? (
          <Badge tone="danger" dot>Failed</Badge>
        ) : (
          <Badge tone="success" dot>Compliant</Badge>
        )}
      </span>
      <span className={styles.action} aria-hidden>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="m6 3 5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Link>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return iso;
  }
}

function formatMiles(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
