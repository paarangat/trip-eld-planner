// Play/pause/seek/speed control for the trip simulator. Reads from and
// writes to SimulationContext. Renders nothing if no trip is loaded.
//
// The scrub area is a "duty ribbon": colored bands across the trip duration
// for each segment's duty status, with named event chips above (pickup, fuel,
// rest, etc.) and a day axis below. A dark "now" line scrubs the stack.

import { useMemo } from "react";

import {
  SIMULATION_SPEEDS,
  useSimulatedActivity,
  useSimulation,
} from "../../contexts/SimulationContext.jsx";
import styles from "./PlayBar.module.css";

const DEFAULT_TIMEZONE = "America/Chicago";

const STOP_NAMES = {
  pickup: "Pickup",
  dropoff: "Drop-off",
  fuel: "Fuel",
  break: "Break",
  rest: "10-hr rest",
  restart: "34-hr restart",
};

// Rests/restarts are wide enough on the ribbon to label themselves in-band,
// so we don't chip them above. Chips above are reserved for the short,
// instantaneous events the user wants to *locate* on the timeline.
const CHIPPED_KINDS = new Set(["pickup", "dropoff", "fuel", "break"]);

const CHIP_ROW_MIN_GAP_PCT = 9;
const CHIP_ROW_COUNT = 2;

const SPEED_TOOLTIPS = {
  1: "Real time - 1 second of wall clock = 1 second of trip",
  60: "Fast - 1 second = 1 minute of trip",
  600: "Faster - 1 second = 10 minutes of trip",
  3600: "Fastest - 1 second = 1 hour of trip",
};

const MIN_BAND_LABEL_PCT = 5;
const NARROW_BAND_LABEL_PCT = 2.5;

export default function PlayBar({
  timeZone = DEFAULT_TIMEZONE,
  variant = "full",
}) {
  const {
    hasTrip,
    tripStartMs,
    tripEndMs,
    segments,
    stops,
    simulationNow,
    isPlaying,
    speed,
    mode,
    isInProgress,
    toggle,
    reset,
    seek,
    setSpeed,
    goLive,
  } = useSimulation();
  const activity = useSimulatedActivity();
  const isCompact = variant === "compact";
  const isLive = mode === "live";

  const tripDurationMs = useMemo(() => {
    if (tripStartMs == null || tripEndMs == null) return 0;
    return Math.max(0, tripEndMs - tripStartMs);
  }, [tripStartMs, tripEndMs]);

  // Duty-state bands across the trip duration. The ELD builder splits any
  // segment at midnight so per-day totals sum to 24h, which means a 10-hr
  // rest that crosses midnight arrives as two segments. Visually we want
  // one continuous band — merge contiguous same-kind segments.
  const bands = useMemo(() => {
    if (!segments?.length || tripDurationMs <= 0) return [];
    const raw = segments
      .map((seg) => {
        const startOffset = Math.max(0, seg.startMs - tripStartMs);
        const endOffset = Math.min(tripDurationMs, seg.endMs - tripStartMs);
        if (endOffset <= startOffset) return null;
        const kind = bandKind(seg);
        return {
          startOffset,
          endOffset,
          kind,
          label: bandLabel(seg),
          durationMs: seg.endMs - seg.startMs,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.startOffset - b.startOffset);

    // Merge adjacent same-kind bands so cross-midnight rests read as one.
    const merged = [];
    for (const band of raw) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        prev.kind === band.kind &&
        Math.abs(prev.endOffset - band.startOffset) < 60000
      ) {
        prev.endOffset = band.endOffset;
        prev.durationMs += band.durationMs;
      } else {
        merged.push({ ...band });
      }
    }

    return merged.map((band, i) => {
      const widthPct = ((band.endOffset - band.startOffset) / tripDurationMs) * 100;
      return {
        key: i,
        left: (band.startOffset / tripDurationMs) * 100,
        width: widthPct,
        kind: band.kind,
        label: band.label,
        durationMs: band.durationMs,
        abbreviation: bandAbbreviation(band.kind),
      };
    });
  }, [segments, tripStartMs, tripDurationMs]);

  // Day spans for the bottom axis (one cell per calendar day in tz).
  const daySpans = useMemo(() => {
    if (tripDurationMs <= 0 || tripStartMs == null || tripEndMs == null) {
      return [];
    }
    const result = [];
    let cursor = startOfDay(tripStartMs, timeZone);
    let safety = 0;
    while (cursor < tripEndMs && safety < 14) {
      const nextDay = addDays(cursor, 1);
      const dayStart = Math.max(tripStartMs, cursor);
      const dayEnd = Math.min(tripEndMs, nextDay);
      result.push({
        left: ((dayStart - tripStartMs) / tripDurationMs) * 100,
        width: ((dayEnd - dayStart) / tripDurationMs) * 100,
        label: formatDayLabel(dayStart, timeZone),
        boundary:
          cursor > tripStartMs
            ? ((cursor - tripStartMs) / tripDurationMs) * 100
            : null,
      });
      cursor = nextDay;
      safety += 1;
    }
    return result;
  }, [tripStartMs, tripEndMs, tripDurationMs, timeZone]);

  // Event chips above the ribbon — only short events the user needs to find
  // (pickup/dropoff/fuel/break). Greedy row assignment so two close-together
  // chips stack instead of overprinting.
  const eventChips = useMemo(() => {
    if (!stops?.length || tripDurationMs <= 0) return [];
    const candidates = stops
      .filter((stop) => CHIPPED_KINDS.has(stop.kind))
      .map((stop) => {
        const startOffset = stop.startMs - tripStartMs;
        if (startOffset < 0 || startOffset > tripDurationMs) return null;
        return {
          key: `${stop.kind}-${stop.startMs}`,
          kind: stop.kind,
          percent: (startOffset / tripDurationMs) * 100,
          name: STOP_NAMES[stop.kind] ?? stop.kind,
          location: stop.label,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.percent - b.percent);

    const lastInRow = [];
    for (const chip of candidates) {
      let row = 0;
      while (
        row < CHIP_ROW_COUNT - 1 &&
        lastInRow[row] != null &&
        chip.percent - lastInRow[row] < CHIP_ROW_MIN_GAP_PCT
      ) {
        row += 1;
      }
      chip.row = row;
      lastInRow[row] = chip.percent;
    }
    return candidates;
  }, [stops, tripStartMs, tripDurationMs]);

  if (!hasTrip || tripStartMs == null || tripEndMs == null) return null;

  const elapsedMs =
    simulationNow != null ? Math.max(0, simulationNow - tripStartMs) : 0;
  const progress = tripDurationMs > 0 ? elapsedMs / tripDurationMs : 0;
  const progressPct = progress * 100;
  const atEnd = simulationNow != null && simulationNow >= tripEndMs;

  const onScrub = (e) => {
    const fraction = Number(e.target.value) / 1000;
    seek(tripStartMs + fraction * tripDurationMs);
  };

  return (
    <div
      className={styles.bar}
      data-variant={variant}
      role="group"
      aria-label="Trip simulator"
    >
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.playBtn}
          onClick={toggle}
          aria-pressed={isPlaying}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
          <span>{isPlaying ? "Pause" : atEnd ? "Replay" : "Play"}</span>
        </button>

        <div className={styles.readout}>
          <span className={styles.nowTime}>
            {formatDateTime(simulationNow, timeZone)}
          </span>
          {isLive ? (
            <span
              className={styles.liveTag}
              title="Following real time — updates every second"
            >
              <span className={styles.liveDot} aria-hidden />
              Live
            </span>
          ) : isInProgress ? (
            <button
              type="button"
              className={styles.liveJump}
              onClick={goLive}
              title="Snap back to the real wall-clock moment"
            >
              <span className={styles.liveDot} aria-hidden />
              Jump to live
            </button>
          ) : null}
          {activity ? (
            <span
              className={styles.activity}
              data-tone={activity.tone}
              title={activity.note || activity.label}
            >
              {activity.label}
            </span>
          ) : null}
        </div>

        <div className={styles.tail}>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={reset}
            disabled={!atEnd && elapsedMs === 0}
          >
            <ResetIcon />
            <span>Reset</span>
          </button>
          <div className={styles.speeds} role="radiogroup" aria-label="Playback speed">
            {SIMULATION_SPEEDS.map((option) => {
              const isActive = option.value === speed;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.speed} ${isActive ? styles.speedActive : ""}`}
                  onClick={() => setSpeed(option.value)}
                  role="radio"
                  aria-checked={isActive}
                  title={SPEED_TOOLTIPS[option.value] ?? option.label}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.timeline}>
        {isCompact ? null : (
          <div className={styles.chipRow} aria-hidden>
          {eventChips.map((chip) => (
            <span
              key={chip.key}
              className={styles.chip}
              data-kind={chip.kind}
              data-row={chip.row}
              style={{ left: `${chip.percent}%` }}
              title={`${chip.name} · ${chip.location}`}
            >
              <span className={styles.chipDot} />
              <span className={styles.chipLabel}>{chip.name}</span>
            </span>
          ))}
          </div>
        )}

        <div className={styles.ribbon} data-variant={variant}>
          {bands.map((band) => (
            <div
              key={band.key}
              className={styles.band}
              data-kind={band.kind}
              style={{ left: `${band.left}%`, width: `${band.width}%` }}
              title={`${band.label} · ${formatDuration(band.durationMs)}`}
            >
              {isCompact ? null : band.width >= MIN_BAND_LABEL_PCT ? (
                <span className={styles.bandLabel}>{band.label}</span>
              ) : band.width >= NARROW_BAND_LABEL_PCT ? (
                <span className={styles.bandLabel}>{band.abbreviation}</span>
              ) : null}
            </div>
          ))}

          {daySpans.map((day, i) =>
            day.boundary != null && day.boundary > 0 ? (
              <div
                key={`boundary-${i}`}
                className={styles.dayBoundary}
                style={{ left: `${day.boundary}%` }}
                aria-hidden
              />
            ) : null,
          )}

          <div
            className={styles.nowLine}
            style={{ left: `${progressPct}%` }}
            aria-hidden
          >
            <div className={styles.nowHandle} />
          </div>

          <input
            type="range"
            className={styles.scrubInput}
            min={0}
            max={1000}
            step={1}
            value={Math.round(progress * 1000)}
            onChange={onScrub}
            aria-label="Scrub through trip"
          />
        </div>

        {isCompact ? null : (
          <div className={styles.dayAxis} aria-hidden>
            {daySpans.map((day, i) => (
              <div
                key={`day-${i}`}
                className={styles.daySpan}
                style={{ left: `${day.left}%`, width: `${day.width}%` }}
              >
                <span className={styles.dayLabel}>{day.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isCompact ? null : (
        <div className={styles.legend} aria-hidden>
          <LegendItem kind="driving" label="Driving" />
          <LegendItem kind="on_duty" label="On-duty (pickup · drop-off · fuel)" />
          <LegendItem kind="break" label="30-min break" />
          <LegendItem kind="rest" label="10-hr rest" />
          <LegendItem kind="restart" label="34-hr restart" />
          <LegendItem kind="off_duty" label="Off-duty" />
        </div>
      )}
    </div>
  );
}

function LegendItem({ kind, label }) {
  return (
    <span className={styles.legendItem} data-kind={kind}>
      <span className={styles.legendSwatch} />
      <span>{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers — segment → band classification + formatting
// ---------------------------------------------------------------------------

function bandKind(seg) {
  if (seg.status === "driving") return "driving";
  if (seg.status === "on_duty") return "on_duty";
  if (seg.status === "sleeper_berth") return "sleeper";
  if (seg.stop_kind === "break") return "break";
  if (seg.stop_kind === "rest") return "rest";
  if (seg.stop_kind === "restart") return "restart";
  return "off_duty";
}

function bandLabel(seg) {
  if (seg.status === "driving") return "Driving";
  if (seg.status === "on_duty") {
    if (seg.stop_kind === "pickup") return "Pickup";
    if (seg.stop_kind === "dropoff") return "Drop-off";
    if (seg.stop_kind === "fuel") return "Fuel";
    return "On-duty";
  }
  if (seg.status === "sleeper_berth") return "Sleeper";
  if (seg.stop_kind === "break") return "Break";
  if (seg.stop_kind === "rest") return "10-hr rest";
  if (seg.stop_kind === "restart") return "34-hr restart";
  return "Off-duty";
}

function bandAbbreviation(kind) {
  switch (kind) {
    case "driving":
      return "D";
    case "on_duty":
      return "ON";
    case "break":
      return "BR";
    case "rest":
      return "REST";
    case "restart":
      return "RSTRT";
    case "sleeper":
      return "SB";
    default:
      return "OFF";
  }
}

function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h}h ${m}m`;
}

function formatDateTime(ms, timeZone) {
  if (ms == null) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

function formatDayLabel(ms, timeZone) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "short",
      day: "numeric",
    })
      .format(new Date(ms))
      .toUpperCase();
  } catch {
    return new Date(ms).toDateString();
  }
}

// Timezone-aware start-of-day. Returns milliseconds at the local midnight
// of the calendar day containing `ms` in `timeZone`. Assumes the trip does
// not cross a DST boundary (true for the home-terminal pin in this app).
function startOfDay(ms, timeZone) {
  const ymd = ymdInZone(ms, timeZone);
  const offset = tzOffsetAt(ms, timeZone);
  return Date.UTC(ymd.year, ymd.month - 1, ymd.day) - offset;
}

function addDays(ms, days) {
  return ms + days * 24 * 60 * 60 * 1000;
}

function ymdInZone(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
  };
}

function tzOffsetAt(ms, timeZone) {
  // Standard trick: format the timestamp twice — once as if it were UTC and
  // once in the target zone — and diff. Works in all modern browsers.
  const date = new Date(ms);
  const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tz = new Date(date.toLocaleString("en-US", { timeZone }));
  return tz.getTime() - utc.getTime();
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M3.5 2.5v9l8-4.5-8-4.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <rect x="3" y="2.5" width="3" height="9" rx="0.5" />
      <rect x="8" y="2.5" width="3" height="9" rx="0.5" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M11 7a4 4 0 1 1-4-4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M7 1.5 9 3l-2 1.5z" fill="currentColor" />
    </svg>
  );
}
