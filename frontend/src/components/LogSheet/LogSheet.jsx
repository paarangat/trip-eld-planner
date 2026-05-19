// One FMCSA daily log, drawn as SVG. Renders from a DailyLog payload — the
// 24-hour grid, 4 duty-status rows, the continuous step line, totals, and remarks.

import { useEffect, useMemo } from "react";

import styles from "./LogSheet.module.css";

const ROWS = ["off_duty", "sleeper_berth", "driving", "on_duty"];
const KNOWN_STATUSES = new Set(ROWS);
const MINUTES_PER_DAY = 24 * 60;
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
const DEFAULT_HOME_TERMINAL_TIMEZONE = "America/Chicago";
const PLACEHOLDER = "Not provided";

// SVG geometry — designed at this viewBox; scales to container width.
const VIEW_W = 960;
const PAD_L = 70;
const PAD_R = 20;
const PAD_T = 36;
const ROW_H = 38;
const TOTAL_COL_W = 64;
const GRID_W = VIEW_W - PAD_L - PAD_R - TOTAL_COL_W;
const TOTAL_COL_L = PAD_L + GRID_W;
const TOTAL_COL_R = TOTAL_COL_L + TOTAL_COL_W;
const VIEW_H = PAD_T + ROW_H * 4 + 24;

const minuteToX = (m) => PAD_L + (m / 1440) * GRID_W;
const rowToY = (rowIdx) => PAD_T + rowIdx * ROW_H + ROW_H / 2;

export default function LogSheet({
  log,
  dayNumber,
  homeTerminalTimezone,
  simulationNow,
}) {
  const segments = useMemo(() => log?.segments ?? [], [log?.segments]);
  const totalsMinutes = log?.totals ?? {};
  const timeZone =
    homeTerminalTimezone ??
    log?.home_terminal_timezone ??
    DEFAULT_HOME_TERMINAL_TIMEZONE;
  const stepPath = useMemo(() => buildStepPath(segments), [segments]);
  const changeDots = useMemo(() => buildChangeDots(segments), [segments]);
  const nowMarker = useMemo(
    () => buildNowMarker(simulationNow, log?.date, timeZone),
    [simulationNow, log?.date, timeZone],
  );
  const sheetFields = useMemo(
    () => buildSheetFields(log, timeZone),
    [log, timeZone],
  );
  const segmentStartMinutes = useMemo(() => {
    const minutes = new Map();
    for (const segment of segments) {
      minutes.set(segment.start, segment.start_minute_of_day);
    }
    return minutes;
  }, [segments]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      if (!log) return;
      const date = log.date;
      const totals = log.totals ?? {};
      const sum =
        (totals.off_duty_minutes ?? 0) +
        (totals.sleeper_minutes ?? 0) +
        (totals.driving_minutes ?? 0) +
        (totals.on_duty_minutes ?? 0);
      if (sum !== MINUTES_PER_DAY) {
        console.warn(
          `LogSheet[${date}]: duty totals sum to ${sum} minutes, expected ${MINUTES_PER_DAY}`,
        );
      }
      const ordered = [...segments].sort(
        (a, b) => a.start_minute_of_day - b.start_minute_of_day,
      );
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1];
        const curr = ordered[i];
        if (curr.start_minute_of_day !== prev.end_minute_of_day) {
          console.warn(
            `LogSheet[${date}]: segments not contiguous between ` +
              `[${prev.start_minute_of_day},${prev.end_minute_of_day}] and ` +
              `[${curr.start_minute_of_day},${curr.end_minute_of_day}]`,
          );
        }
      }
      for (const seg of segments) {
        if (!KNOWN_STATUSES.has(seg.status)) {
          console.warn(
            `LogSheet[${date}]: segment has unknown status "${seg.status}"`,
          );
        }
      }
    }
  }, [log, segments]);

  if (!log) return null;

  const dayTotalMinutes = totalDutyMinutes(totalsMinutes);
  const onDutyTodayMinutes =
    (totalsMinutes.driving_minutes ?? 0) +
    (totalsMinutes.on_duty_minutes ?? 0);
  const cycleLeftMinutes = log.hos_clocks?.cycle_left_minutes;
  const remarks = log.remarks ?? [];

  return (
    <article className={styles.sheet}>
      <header className={styles.head}>
        <div className={styles.titleBlock}>
          {typeof dayNumber === "number" && (
            <span className={styles.dayNum}>
              DAY {String(dayNumber).padStart(2, "0")}
            </span>
          )}
          <span className={styles.formTitle}>Driver's Daily Log</span>
          <h3 className={styles.date}>{formatDate(log.date)}</h3>
        </div>
        <div className={styles.totals}>
          <Total label="OFF" minutes={totalsMinutes.off_duty_minutes} />
          <Total label="SB" minutes={totalsMinutes.sleeper_minutes} />
          <Total label="DRIVE" minutes={totalsMinutes.driving_minutes} />
          <Total label="ON" minutes={totalsMinutes.on_duty_minutes} />
          <Total label="TOTAL" minutes={dayTotalMinutes} />
          <Total label="MILES" miles={log.total_miles} />
        </div>
      </header>

      <section className={styles.fieldGrid} aria-label="FMCSA log fields">
        <FieldLine label="Month / Day / Year" value={formatFormDate(log.date)} />
        <FieldLine
          label="Total miles driving today"
          value={formatMiles(log.total_miles)}
        />
        <FieldLine label="From" value={sheetFields.from} />
        <FieldLine label="To" value={sheetFields.to} />
        <FieldLine
          label="Name of carrier or carriers"
          value={sheetFields.carrier}
        />
        <FieldLine
          label="Main office address"
          value={sheetFields.mainOffice}
        />
        <FieldLine
          label="Home terminal address / time zone"
          value={sheetFields.homeTerminal}
        />
        <FieldLine
          label="Truck / tractor and trailer no."
          value={sheetFields.equipment}
        />
        <FieldLine
          label="Driver's name / signature"
          value={sheetFields.driverName}
        />
        <FieldLine label="Name of co-driver" value={sheetFields.coDriver} />
        <FieldLine
          label="Shipping docs, manifest no., or shipper and commodity"
          value={sheetFields.shippingDocs}
          wide
        />
      </section>

      <svg
        className={styles.grid}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`Duty-status graph for ${log.date}`}
      >
        <Grid />
        <RowLabels />
        <RowTotals totalsMinutes={totalsMinutes} />
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
        {nowMarker != null ? (
          <g aria-label="simulator now" data-print-hide>
            <line
              x1={nowMarker}
              y1={PAD_T - 8}
              x2={nowMarker}
              y2={PAD_T + ROW_H * 4 + 8}
              stroke="var(--primary)"
              strokeWidth={2.25}
              strokeDasharray="4 3"
              strokeLinecap="round"
              opacity={0.9}
            />
            <circle
              cx={nowMarker}
              cy={PAD_T - 8}
              r={4}
              fill="var(--primary)"
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
            <text
              x={nowMarker}
              y={PAD_T - 14}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="var(--primary)"
            >
              NOW
            </text>
          </g>
        ) : null}
      </svg>

      <div className={styles.remarks}>
        <div className={styles.remarksHead}>
          <div>
            <div className={styles.remarksTitle}>Remarks</div>
            <div className={styles.remarksRoute}>
              <span>From: {sheetFields.from ?? PLACEHOLDER}</span>
              <span>To: {sheetFields.to ?? PLACEHOLDER}</span>
            </div>
          </div>
          <div className={styles.certification}>
            I certify these entries are true and correct.
          </div>
        </div>
        <ul className={styles.remarkList}>
          {remarks.length > 0 ? (
            remarks.map((remark, i) => (
              <li key={i} className={styles.remarkItem}>
                <span className={styles.remarkTime}>
                  {formatRemarkTime(
                    remark.time,
                    timeZone,
                    segmentStartMinutes.get(remark.time),
                  )}
                </span>
                <span>{remark.location}</span>
              </li>
            ))
          ) : (
            <li className={styles.remarkItem}>
              <span className={styles.remarkTime}>--:--</span>
              <span className={styles.placeholder}>{PLACEHOLDER}</span>
            </li>
          )}
        </ul>
      </div>

      <section className={styles.recap} aria-label="70-hour recap placeholder">
        <div className={styles.recapTitle}>Recap complete at end of day</div>
        <div className={styles.recapGrid}>
          <FieldLine
            label="Total hours on duty today"
            value={formatHM(onDutyTodayMinutes)}
          />
          <FieldLine
            label="70-hour clock left at day end"
            value={
              Number.isFinite(cycleLeftMinutes)
                ? formatHM(cycleLeftMinutes)
                : null
            }
          />
          <FieldLine label="Total hours on duty last 7 days" />
          <FieldLine label="Total hours available tomorrow" />
          <FieldLine label="Total hours on duty last 8 days" />
        </div>
      </section>
    </article>
  );
}

function FieldLine({ label, value, wide = false }) {
  const empty = value == null || value === "";
  return (
    <div className={`${styles.fieldLine} ${wide ? styles.fieldWide : ""}`}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue} data-empty={empty ? "true" : "false"}>
        {empty ? PLACEHOLDER : value}
      </span>
    </div>
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
        x2={TOTAL_COL_R}
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
      <line
        x1={TOTAL_COL_L}
        y1={PAD_T}
        x2={TOTAL_COL_L}
        y2={PAD_T + ROW_H * 4}
        stroke="var(--border-strong)"
        strokeWidth={1.4}
      />
      <line
        x1={TOTAL_COL_R}
        y1={PAD_T}
        x2={TOTAL_COL_R}
        y2={PAD_T + ROW_H * 4}
        stroke="var(--border-strong)"
        strokeWidth={1.4}
      />
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

function RowTotals({ totalsMinutes }) {
  const values = [
    totalsMinutes.off_duty_minutes,
    totalsMinutes.sleeper_minutes,
    totalsMinutes.driving_minutes,
    totalsMinutes.on_duty_minutes,
  ];
  const totalX = TOTAL_COL_L + TOTAL_COL_W / 2;

  return (
    <g>
      <text
        x={totalX}
        y={PAD_T - 10}
        textAnchor="middle"
        className={styles.gridText}
      >
        TOTAL
      </text>
      {values.map((minutes, r) => (
        <text
          key={ROWS[r]}
          x={totalX}
          y={rowToY(r) + 4}
          textAnchor="middle"
          className={styles.gridTotal}
        >
          {formatHM(minutes ?? 0)}
        </text>
      ))}
    </g>
  );
}

function buildStepPath(segments) {
  if (!segments.length) return "";
  const ordered = [...segments].sort(
    (a, b) => a.start_minute_of_day - b.start_minute_of_day
  );
  let path = "";
  let needsMove = true;
  for (const seg of ordered) {
    const rowIdx = ROWS.indexOf(seg.status);
    if (rowIdx < 0) {
      needsMove = true;
      continue;
    }
    const x1 = minuteToX(seg.start_minute_of_day);
    const x2 = minuteToX(seg.end_minute_of_day);
    const y = rowToY(rowIdx);
    path += needsMove ? `M ${x1},${y} ` : `L ${x1},${y} `;
    path += `L ${x2},${y} `;
    needsMove = false;
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

function buildSheetFields(log, timeZone) {
  if (!log) {
    return {
      from: null,
      to: null,
      carrier: null,
      mainOffice: null,
      homeTerminal: timeZone,
      equipment: null,
      driverName: null,
      coDriver: null,
      shippingDocs: null,
    };
  }

  const routeFields = inferFromTo(log);
  const truck = firstPresent(
    log.truck_number,
    log.tractor_number,
    log.power_unit_number,
    log.vehicle_number,
  );
  const trailer = firstPresent(log.trailer_number, log.trailer);
  const equipment =
    truck && trailer ? `${truck} / ${trailer}` : firstPresent(truck, trailer);

  return {
    from: firstPresent(log.from, log.origin, routeFields.from),
    to: firstPresent(log.to, log.destination, routeFields.to),
    carrier: firstPresent(log.carrier_name, log.carrier),
    mainOffice: firstPresent(log.main_office_address, log.mainOfficeAddress),
    homeTerminal: firstPresent(
      log.home_terminal_address,
      log.homeTerminalAddress,
      timeZone,
    ),
    equipment,
    driverName: firstPresent(log.driver_name, log.driverName),
    coDriver: firstPresent(log.co_driver_name, log.coDriverName),
    shippingDocs: firstPresent(
      log.shipping_documents,
      log.shippingDocs,
      log.manifest_number,
      log.bol_number,
      log.commodity,
    ),
  };
}

function inferFromTo(log) {
  const segmentLocations = (log.segments ?? [])
    .map((segment) => cleanText(segment.location))
    .filter(Boolean);
  const remarkLocations = (log.remarks ?? [])
    .map((remark) => cleanText(remark.location))
    .filter(Boolean);
  const locations = segmentLocations.length > 0 ? segmentLocations : remarkLocations;
  if (!locations.length) {
    return { from: null, to: null };
  }
  return {
    from: locations[0],
    to: locations[locations.length - 1],
  };
}

function firstPresent(...values) {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function buildNowMarker(simulationNow, logDateIso, timeZone) {
  if (simulationNow == null || !logDateIso) return null;
  const parts = dateAndMinuteInZone(simulationNow, timeZone);
  if (parts.date !== logDateIso) return null;
  return minuteToX(parts.minute);
}

function dateAndMinuteInZone(timestamp, timeZone) {
  const date = new Date(timestamp);
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const byType = Object.fromEntries(
      formatter.formatToParts(date).map((p) => [p.type, p.value]),
    );
    return {
      date: `${byType.year}-${byType.month}-${byType.day}`,
      minute: Number(byType.hour) * 60 + Number(byType.minute),
    };
  } catch {
    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      minute: date.getHours() * 60 + date.getMinutes(),
    };
  }
}

function formatHM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function formatMiles(miles) {
  const value = Number(miles);
  if (!Number.isFinite(value)) return null;
  return `${Math.round(value).toLocaleString()} mi`;
}

function formatFormDate(iso) {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match) {
    return `${match[2]}/${match[3]}/${match[1]}`;
  }
  return iso;
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

function formatMinuteOfDay(minuteOfDay) {
  const normalized = ((minuteOfDay % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatRemarkTime(iso, timeZone, minuteOfDay) {
  if (Number.isFinite(minuteOfDay)) {
    return formatMinuteOfDay(minuteOfDay);
  }
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(d);
  } catch {
    return iso;
  }
}

function hourLabel(h) {
  if (h === 0 || h === 24) return "M";
  if (h === 12) return "N";
  return h > 12 ? String(h - 12) : String(h);
}

function totalDutyMinutes(totals) {
  return (
    (totals.off_duty_minutes ?? 0) +
    (totals.sleeper_minutes ?? 0) +
    (totals.driving_minutes ?? 0) +
    (totals.on_duty_minutes ?? 0)
  );
}
