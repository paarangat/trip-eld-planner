// Top-of-results panel: trip ID + four headline stats.

import styles from "./TripSummary.module.css";

export default function TripSummary({ trip }) {
  if (!trip) return null;
  const summary = trip.summary ?? {};
  const inputs = trip.inputs ?? {};

  return (
    <section className={styles.summary} aria-label="Trip summary">
      <div className={styles.head}>
        <span className={styles.eyebrow}>Trip · {trip.id}</span>
        <span className={styles.tripId}>Manifest</span>
        <span className={styles.tripPath}>
          {inputs.current_location} → {inputs.pickup_location} → {inputs.dropoff_location}
        </span>
      </div>
      <Stat label="Total miles" value={summary.total_miles} unit="mi" />
      <Stat label="Drive time" value={summary.total_drive_hours} unit="hr" />
      <Stat label="On-duty time" value={summary.total_on_duty_hours} unit="hr" />
      <Stat label="Days" value={summary.days} unit="day(s)" integer />
    </section>
  );
}

function Stat({ label, value, unit, integer }) {
  const formatted = value == null ? "—" : integer ? String(value) : value.toFixed(1);
  return (
    <div className={styles.cell}>
      <span className={styles.cellLabel}>{label}</span>
      <span className={styles.cellValue}>{formatted}</span>
      <span className={styles.cellUnit}>{unit}</span>
    </div>
  );
}
