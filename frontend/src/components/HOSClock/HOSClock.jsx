import { useMemo } from "react";

import styles from "./HOSClock.module.css";

const ARC_SWEEP = 270;
const ARC_START = 135;

const SIZE = 160;
const STROKE = 12;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - STROKE / 2 - 2;

function polar(cx, cy, r, angleDeg) {
  const a = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

/**
 * Hours-of-Service clock — a 270° dial showing remaining time against a
 * limit. The ring length equals the proportion remaining (full ring = lots
 * left, empty ring = running out); color shifts green → amber → red.
 *
 * Props:
 *   label        Short label, e.g. "Drive time left"
 *   remaining    Remaining time in minutes (or null = idle).
 *   limit        Limit in minutes (e.g. 11*60).
 *   sub          Subtext like "of 11:00 today".
 *   size         "lg" (default 160px) or "md" (120px) or "sm" (88px).
 */
export default function HOSClock({
  label,
  remaining,
  limit,
  sub = "",
  size = "lg",
}) {
  const isIdle = remaining == null || limit == null || limit <= 0;
  const ratio = isIdle ? 0 : Math.min(1, Math.max(0, remaining / limit));
  const level = useMemo(() => {
    if (isIdle) return "idle";
    if (ratio > 0.5) return "ok";
    if (ratio > 0.2) return "warn";
    return "danger";
  }, [ratio, isIdle]);

  // Ring fills to represent REMAINING time — tired drivers reading a glance:
  // full ring = lots left, empty ring = running out. Color reinforces it.
  const fillEnd = ARC_START + ARC_SWEEP * ratio;

  const trackPath = arcPath(CX, CY, R, ARC_START, ARC_START + ARC_SWEEP);
  const fillPath =
    !isIdle && ratio > 0.0001 ? arcPath(CX, CY, R, ARC_START, fillEnd) : "";

  const display = isIdle ? "—" : formatHM(remaining);
  const sizeClass = styles[`s_${size}`] ?? styles.s_lg;

  return (
    <div
      className={`${styles.card} ${sizeClass}`}
      data-level={level}
      role="status"
      aria-live="polite"
    >
      <span className={styles.label}>{label}</span>
      <div className={styles.dial}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className={styles.svg}
          aria-hidden
        >
          <path
            d={trackPath}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          {fillPath ? (
            <path
              d={fillPath}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeLinecap="round"
            />
          ) : null}
        </svg>
        <div className={styles.dialCenter}>
          <span className={`${styles.num} mono tabular`}>{display}</span>
          {sub ? <span className={styles.sub}>{sub}</span> : null}
        </div>
      </div>
    </div>
  );
}

function formatHM(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}:${String(r).padStart(2, "0")}`;
}
