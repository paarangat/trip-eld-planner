// One FMCSA daily log, drawn as SVG. Renders from a DailyLog payload — the
// 24-hour grid, 4 duty-status rows, the continuous step line, totals, and remarks.

import { useMemo } from "react";

import styles from "./LogSheet.module.css";

const ROWS = ["off_duty", "sleeper_berth", "driving", "on_duty"];
const ROW_LABELS = {
  off_duty: "OFF",
  sleeper_berth: "SB",
  driving: "D",
  on_duty: "ON",
};
const ROW_FULL_LABELS = {
  off_duty: "Off-duty",
  sleeper_berth: "Sleeper",
  driving: "Driving",
  on_duty: "On-duty",
};

// SVG geometry — designed at this viewBox; scales to container width.
const VIEW_W = 960;
const PAD_L = 70;
const PAD_R = 20;
const PAD_T = 36;
const ROW_H = 38;
const GRID_W = VIEW_W - PAD_L - PAD_R;
const VIEW_H = PAD_T + ROW_H * 4 + 24;

const minuteToX = (m) => PAD_L + (m / 1440) * GRID_W;
const rowToY = (rowIdx) => PAD_T + rowIdx * ROW_H + ROW_H / 2;

export default function LogSheet({ log, dayNumber }) {
  const segments = log?.segments ?? [];
  const totalsMinutes = log?.totals ?? {};
  const stepPath = useMemo(() => buildStepPath(segments), [segments]);
  const changeDots = useMemo(() => buildChangeDots(segments), [segments]);
  if (!log) return null;

  return (
    <article className={styles.sheet}>
      <header className={styles.head}>
        <div className={styles.headLeft}>
          {typeof dayNumber === "number" && (
            <span className={styles.dayNum}>
              DAY {String(dayNumber).padStart(2, "0")}
            </span>
          )}
          <h3 className={styles.date}>{formatDate(log.date)}</h3>
        </div>
        <div className={styles.totals}>
          <Total label="OFF" minutes={totalsMinutes.off_duty_minutes} />
          <Total label="SB" minutes={totalsMinutes.sleeper_minutes} />
          <Total label="DRIVE" minutes={totalsMinutes.driving_minutes} />
          <Total label="ON" minutes={totalsMinutes.on_duty_minutes} />
          <Total label="MILES" miles={log.total_miles} />
        </div>
      </header>

      <svg
        className={styles.grid}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`Duty-status graph for ${log.date}`}
      >
        <Grid />
        <RowLabels />
        <path
          d={stepPath}
          fill="none"
          stroke="var(--text)"
          strokeWidth={2.25}
          strokeLinejoin="miter"
          strokeLinecap="butt"
        />
        {changeDots.map((dot, i) => (
          <circle key={i} cx={dot.x} cy={dot.y} r={2.5} fill="var(--text)" />
        ))}
      </svg>

      <div className={styles.remarks}>
        <div className={styles.remarksTitle}>Remarks</div>
        <ul className={styles.remarkList}>
          {(log.remarks ?? []).map((remark, i) => (
            <li key={i} className={styles.remarkItem}>
              <span className={styles.remarkTime}>{formatRemarkTime(remark.time)}</span>
              <span>{remark.location}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function Total({ label, minutes, miles }) {
  return (
    <div className={styles.totalCell}>
      <span className={styles.totalLabel}>{label}</span>
      <span className={styles.totalValue}>
        {miles != null ? `${miles.toFixed(1)}` : formatHM(minutes ?? 0)}
      </span>
    </div>
  );
}

function Grid() {
  const hourLines = [];
  for (let h = 0; h <= 24; h++) {
    const x = minuteToX(h * 60);
    hourLines.push(
      <line
        key={`h${h}`}
        x1={x}
        y1={PAD_T}
        x2={x}
        y2={PAD_T + ROW_H * 4}
        stroke="var(--border-strong)"
        strokeWidth={h % 6 === 0 ? 1.4 : 0.8}
      />
    );
    hourLines.push(
      <text
        key={`l${h}`}
        x={x}
        y={PAD_T - 10}
        textAnchor="middle"
        className={styles.gridText}
      >
        {hourLabel(h)}
      </text>
    );
  }

  const quarterLines = [];
  for (let h = 0; h < 24; h++) {
    for (let q = 1; q < 4; q++) {
      const x = minuteToX(h * 60 + q * 15);
      quarterLines.push(
        <line
          key={`q${h}-${q}`}
          x1={x}
          y1={PAD_T}
          x2={x}
          y2={PAD_T + ROW_H * 4}
          stroke="var(--border)"
          strokeWidth={0.5}
        />
      );
    }
  }

  const rowLines = [];
  for (let r = 0; r <= 4; r++) {
    const y = PAD_T + r * ROW_H;
    rowLines.push(
      <line
        key={`r${r}`}
        x1={PAD_L}
        y1={y}
        x2={PAD_L + GRID_W}
        y2={y}
        stroke="var(--border-strong)"
        strokeWidth={r === 0 || r === 4 ? 1.4 : 0.8}
      />
    );
  }

  return (
    <g>
      {quarterLines}
      {hourLines}
      {rowLines}
    </g>
  );
}

function RowLabels() {
  return (
    <g>
      {ROWS.map((row, r) => (
        <g key={row}>
          <text
            x={PAD_L - 14}
            y={rowToY(r) + 4}
            textAnchor="end"
            className={styles.gridRowLabel}
          >
            {ROW_LABELS[row]}
          </text>
          <text
            x={PAD_L - 14}
            y={rowToY(r) + 16}
            textAnchor="end"
            className={styles.gridText}
          >
            {ROW_FULL_LABELS[row]}
          </text>
        </g>
      ))}
    </g>
  );
}

function buildStepPath(segments) {
  if (!segments.length) return "";
  const ordered = [...segments].sort(
    (a, b) => a.start_minute_of_day - b.start_minute_of_day
  );
  const first = ordered[0];
  let path = `M ${minuteToX(first.start_minute_of_day)},${rowToY(ROWS.indexOf(first.status))} `;
  for (const seg of ordered) {
    const rowIdx = ROWS.indexOf(seg.status);
    if (rowIdx < 0) continue;
    const x1 = minuteToX(seg.start_minute_of_day);
    const x2 = minuteToX(seg.end_minute_of_day);
    const y = rowToY(rowIdx);
    path += `L ${x1},${y} L ${x2},${y} `;
  }
  return path.trim();
}

function buildChangeDots(segments) {
  const dots = [];
  let prevStatus = null;
  for (const seg of segments) {
    if (seg.status !== prevStatus) {
      const rowIdx = ROWS.indexOf(seg.status);
      if (rowIdx >= 0) {
        dots.push({ x: minuteToX(seg.start_minute_of_day), y: rowToY(rowIdx) });
      }
      prevStatus = seg.status;
    }
  }
  return dots;
}

function formatHM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function formatDate(iso) {
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatRemarkTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function hourLabel(h) {
  if (h === 0 || h === 24) return "M";
  if (h === 12) return "N";
  return h > 12 ? String(h - 12) : String(h);
}
