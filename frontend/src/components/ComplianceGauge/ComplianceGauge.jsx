import { useMemo } from "react";

import styles from "./ComplianceGauge.module.css";

const ARC_SWEEP = 270;
const ARC_START = 135;

const SIZE = 80;
const STROKE = 10;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - STROKE / 2 - 1;

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
 * ComplianceGauge — horizontal stat card used on the Dashboard and the
 * Compliance "right now" section.
 *
 * Left: a small 270° arc gauge with the percent-remaining in the centre.
 * Right: a big HH:MM readout and a sub-label.
 * Top-right: a coloured status dot (green / amber / red / muted).
 *
 * The arc fills clockwise to represent REMAINING time — full ring = lots left,
 * empty ring = running out. Color tracks the ratio: green > 50%,
 * amber > 20%, red below; the card border picks up the warn/danger colour so
 * a glancing driver immediately sees which clock is the concern.
 *
 * Props:
 *   label      — Short label, e.g. "Drive time left".
 *   remaining  — Minutes remaining, or null for idle.
 *   limit      — Limit in minutes (e.g. 11*60).
 *   sub        — Sub-text under the readout (e.g. "of 11:00 today").
 */
export default function ComplianceGauge({ label, remaining, limit, sub = "" }) {
  const isIdle = remaining == null || limit == null || limit <= 0;
  const ratio = isIdle ? 0 : Math.min(1, Math.max(0, remaining / limit));
  const level = useMemo(() => {
    if (isIdle) return "idle";
    if (ratio > 0.5) return "ok";
    if (ratio > 0.2) return "warn";
    return "danger";
  }, [ratio, isIdle]);

  const fillEnd = ARC_START + ARC_SWEEP * ratio;
  const trackPath = arcPath(CX, CY, R, ARC_START, ARC_START + ARC_SWEEP);
  const fillPath =
    !isIdle && ratio > 0.0001 ? arcPath(CX, CY, R, ARC_START, fillEnd) : "";

  const display = isIdle ? "—" : formatHM(remaining);
  const percent = isIdle ? null : Math.round(ratio * 100);

  return (
    <div
      className={styles.card}
      data-level={level}
      role="status"
      aria-live="polite"
    >
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.statusDot} aria-hidden />
      </div>
      <div className={styles.body}>
        <div className={styles.dial}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={styles.svg} aria-hidden>
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
          <span className={`${styles.percent} mono tabular`}>
            {percent == null ? "—" : `${percent}%`}
          </span>
        </div>
        <div className={styles.readout}>
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
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
