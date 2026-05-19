import { useEffect, useMemo, useRef, useState } from "react";
import LogStrip from "../LogStrip/LogStrip.jsx";
import styles from "./CalendarMonth.module.css";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month grid. Cells with a matching DailyLog show its LogStrip and total
 * drive time. Clicking a populated day calls onSelect(log).
 *
 * Exposed as an ARIA grid: the outer `.grid` is `role="grid"`, weekly rows are
 * `role="row"`, day-of-week headers are `role="columnheader"`, and each cell
 * is `role="gridcell"`. A roving `tabIndex` plus arrow-key handling lets a
 * keyboard user navigate days without tabbing through every cell.
 *
 * Props:
 *   year, month        Numeric (month is 0-indexed).
 *   logsByDate         Map<ISO date string, DailyLog>.
 *   today              ISO date string of today.
 *   onSelect           (log) => void
 *   monthLabel         Optional accessible label for the grid (e.g.
 *                      "November 2025"). Falls back to a derived label.
 */
export default function CalendarMonth({
  year,
  month,
  logsByDate,
  today,
  onSelect,
  monthLabel,
}) {
  const { weeks, activeIsos } = useMemo(
    () => buildWeeks(year, month, logsByDate, today),
    [year, month, logsByDate, today],
  );

  const defaultFocusIso = useMemo(
    () => pickInitialFocus(year, month, today, activeIsos),
    [year, month, today, activeIsos],
  );
  const monthKey = `${year}-${month}`;
  const [focusState, setFocusState] = useState({
    monthKey,
    iso: defaultFocusIso,
  });
  const focusedIso =
    focusState.monthKey === monthKey ? focusState.iso : defaultFocusIso;
  const setFocusedIso = (iso) => setFocusState({ monthKey, iso });

  const cellRefs = useRef(new Map());
  const pendingFocus = useRef(false);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    const node = cellRefs.current.get(focusedIso);
    if (node) node.focus();
  }, [focusedIso]);

  const moveFocus = (deltaDays) => {
    const next = shiftWithinMonth(focusedIso, deltaDays, year, month);
    if (next && next !== focusedIso) {
      pendingFocus.current = true;
      setFocusedIso(next);
    }
  };

  const handleKeyDown = (event) => {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        moveFocus(-1);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-7);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(7);
        break;
      case "Home":
        event.preventDefault();
        jumpTo(formatIso(year, month, 1));
        break;
      case "End":
        event.preventDefault();
        jumpTo(formatIso(year, month, new Date(year, month + 1, 0).getDate()));
        break;
      default:
        break;
    }

    function jumpTo(iso) {
      if (iso !== focusedIso) {
        pendingFocus.current = true;
        setFocusedIso(iso);
      }
    }
  };

  const registerCell = (iso) => (node) => {
    if (!iso) return;
    if (node) cellRefs.current.set(iso, node);
    else cellRefs.current.delete(iso);
  };

  const gridLabel = monthLabel ?? formatMonthLabel(year, month);

  return (
    <div className={styles.wrap}>
      <div className={styles.dowRow} role="row">
        {DOW.map((d) => (
          <span key={d} role="columnheader" className={styles.dow}>
            {d}
          </span>
        ))}
      </div>
      <div
        className={styles.grid}
        role="grid"
        aria-label={gridLabel}
        onKeyDown={handleKeyDown}
      >
        {weeks.map((week, wi) => (
          <div key={wi} role="row" className={styles.row}>
            {week.map((cell, ci) => {
              if (cell.blank) {
                return (
                  <div
                    key={`b-${wi}-${ci}`}
                    role="gridcell"
                    aria-hidden="true"
                    className={styles.blank}
                  />
                );
              }

              const isFocused = cell.iso === focusedIso;
              const tabIndex = isFocused ? 0 : -1;
              const ariaLabel = formatCellLabel(cell);
              const todayClass = cell.isToday ? styles.today : "";

              if (cell.log) {
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    role="gridcell"
                    aria-label={ariaLabel}
                    tabIndex={tabIndex}
                    ref={registerCell(cell.iso)}
                    className={`${styles.cell} ${styles.cellActive} ${todayClass}`}
                    onClick={() => onSelect?.(cell.log)}
                    onFocus={() => setFocusedIso(cell.iso)}
                  >
                    <span className={styles.dayNum}>{cell.day}</span>
                    <LogStrip segments={cell.log.segments ?? []} height={6} />
                    <span className={styles.hours}>
                      <span className="mono tabular">
                        {formatHours(cell.log.totals?.driving_minutes ?? 0)}
                      </span>{" "}
                      hr
                    </span>
                  </button>
                );
              }

              return (
                <div
                  key={cell.iso}
                  role="gridcell"
                  aria-label={ariaLabel}
                  tabIndex={tabIndex}
                  ref={registerCell(cell.iso)}
                  className={`${styles.cell} ${styles.cellEmpty} ${todayClass}`}
                  onFocus={() => setFocusedIso(cell.iso)}
                >
                  <span className={styles.dayNum}>{cell.day}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildWeeks(year, month, logsByDate, today) {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // ISO-week start (Mon=0). JS getDay() returns 0=Sun..6=Sat.
  const leading = (firstOfMonth.getDay() + 6) % 7;

  const cells = [];
  const activeIsos = [];
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
    activeIsos.push(iso);
  }
  while (cells.length % 7 !== 0) {
    cells.push({ blank: true });
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return { weeks, activeIsos };
}

function pickInitialFocus(year, month, today, activeIsos) {
  if (activeIsos.length === 0) return null;
  if (today && today.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)) {
    return today;
  }
  return activeIsos[0];
}

function shiftWithinMonth(iso, deltaDays, year, month) {
  if (!iso) return null;
  const [, , dStr] = iso.split("-");
  const day = Number(dStr);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const next = day + deltaDays;
  if (next < 1 || next > daysInMonth) return null;
  return formatIso(year, month, next);
}

function formatIso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatHours(minutes) {
  return (minutes / 60).toFixed(1);
}

// Noon prevents DST-edge dates from shifting to the previous day.
function parseIsoNoon(iso) {
  return new Date(`${iso}T12:00:00`);
}

function formatLongDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parseIsoNoon(iso));
}

function formatMonthLabel(year, month) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
  }).format(new Date(year, month, 1, 12));
}

function formatCellLabel(cell) {
  const date = formatLongDate(cell.iso);
  if (!cell.log) return `${date} - no logs`;
  const hours = formatHours(cell.log.totals?.driving_minutes ?? 0);
  return `${date} - ${hours} hours driving`;
}
