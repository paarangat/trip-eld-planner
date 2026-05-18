import styles from "./LogStrip.module.css";

const STATUS_COLORS = {
  off_duty: "var(--status-off)",
  sleeper_berth: "var(--status-sleeper)",
  driving: "var(--status-driving)",
  on_duty: "var(--status-onduty)",
};

/**
 * Compact 24-hour duty-status strip — used in calendar cells and trip cards.
 * Renders one filled bar per segment, positioned by minute-of-day on a
 * 0..1440 axis. No grid lines, no labels.
 */
export default function LogStrip({ segments = [], height = 8 }) {
  return (
    <svg
      viewBox="0 0 1440 100"
      preserveAspectRatio="none"
      className={styles.strip}
      style={{ height }}
      role="img"
      aria-hidden
    >
      <rect x="0" y="0" width="1440" height="100" fill="var(--surface-3)" />
      {segments.map((seg, i) => {
        const x = Math.max(0, seg.start_minute_of_day);
        const w = Math.max(1, seg.end_minute_of_day - seg.start_minute_of_day);
        return (
          <rect
            key={i}
            x={x}
            y={0}
            width={w}
            height={100}
            fill={STATUS_COLORS[seg.status] ?? "var(--text-faint)"}
          />
        );
      })}
    </svg>
  );
}
