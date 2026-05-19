import { Link } from "react-router-dom";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import Badge from "../../components/Badge/Badge.jsx";
import Button from "../../components/Button/Button.jsx";
import Card from "../../components/Card/Card.jsx";
import EmptyState from "../../components/EmptyState/EmptyState.jsx";
import Modal from "../../components/Modal/Modal.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import SearchInput from "../../components/SearchInput/SearchInput.jsx";
import Skeleton from "../../components/Skeleton/Skeleton.jsx";
import Tabs from "../../components/Tabs/Tabs.jsx";
import { useRecentTrips } from "../../hooks/useRecentTrips.js";
import { useSettings } from "../../hooks/useSettings.js";
import { useTripList } from "../../hooks/useTripList.js";
import { useTripStatusOverrides } from "../../hooks/useTripStatusOverrides.js";
import { csvCell, formatShortDate, routeLabel } from "../../lib/format.js";
import {
  MANUAL_STATUS_OPTIONS,
  TRIP_STATUS,
  tripStatus,
  tripStatusLabel,
} from "../../lib/tripStatus.js";
import styles from "./TripHistory.module.css";

const FILTERS = [
  { value: "all", label: "All" },
  { value: TRIP_STATUS.UPCOMING, label: "Upcoming" },
  { value: TRIP_STATUS.IN_PROGRESS, label: "In progress" },
  { value: TRIP_STATUS.COMPLIANT, label: "Compliant" },
  { value: TRIP_STATUS.FAILED, label: "Failed" },
];

export default function TripHistory() {
  const { ids, forget: forgetTripId, clear: clearTripIds } = useRecentTrips();
  const { settings, update: updateSettings } = useSettings();
  const {
    overrides: statusOverrides,
    setStatus: setStatusOverride,
    clearStatus: clearStatusOverride,
    clearAll: clearAllStatusOverrides,
  } = useTripStatusOverrides();

  // The cycle counter and its "continued from trip X" carryover live in
  // dispatch.settings, independent of the recent-trip list. Clearing history
  // must also reset them - otherwise the dashboard cycle gauge keeps showing
  // a rolled-forward value with no trips to back it.
  const clear = () => {
    clearTripIds();
    clearAllStatusOverrides();
    updateSettings({ currentCycleHours: 0, cycleHoursSource: null });
  };

  // Forgetting the trip that sourced the carryover invalidates the banner
  // shown on NewTrip; the cumulative counter may include other trips, so
  // leave its value alone.
  const forget = (id) => {
    forgetTripId(id);
    clearStatusOverride(id);
    if (settings.cycleHoursSource?.tripId === id) {
      updateSettings({ cycleHoursSource: null });
    }
  };
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [clearOpen, setClearOpen] = useState(false);
  const hasTripIds = ids.length > 0;
  const tripList = useTripList({ ids });

  const effectiveTrips = useMemo(
    () => (hasTripIds ? tripList.items : []),
    [hasTripIds, tripList.items],
  );
  const effectiveLoading = hasTripIds ? tripList.loading : false;
  const withStatus = useMemo(
    () =>
      effectiveTrips.map((t) => ({
        ...t,
        __override: statusOverrides[t.id] ?? null,
        __status: tripStatus(t, statusOverrides[t.id] ?? null),
      })),
    [effectiveTrips, statusOverrides],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withStatus.filter((t) => {
      if (filter !== "all" && t.__status !== filter) return false;
      if (!q) return true;
      const places = [
        t.inputs?.current_location,
        t.inputs?.pickup_location,
        t.inputs?.dropoff_location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return places.includes(q) || (t.id ?? "").toLowerCase().includes(q);
    });
  }, [withStatus, filter, query]);

  function exportCsv() {
    const rows = [["Date", "Route", "Miles", "Days", "Status"]];
    for (const t of filtered) {
      rows.push([
        formatShortDate(t.inputs?.start_datetime),
        routeLabel(t.inputs),
        Math.round(t.summary?.total_miles ?? 0),
        t.summary?.days ?? 0,
        tripStatusLabel(t.__status),
      ]);
    }
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trip-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const total = effectiveTrips.length;
  const subtitle =
    total === 0
      ? "Plan a trip to populate this list."
      : `${total} trip${total === 1 ? "" : "s"} saved locally · fetched from /api/trips/`;

  const showDemo = filter === TRIP_STATUS.FAILED;
  const showEmptyState =
    effectiveTrips.length === 0 && !showDemo;
  const showNoMatches =
    effectiveTrips.length > 0 && filtered.length === 0 && !showDemo;

  return (
    <>
      <PageHeader
        title="Trip history"
        description={subtitle}
        actions={
          <>
            <div className={styles.searchWrap}>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search by city or trip ID..."
              />
            </div>
            <Button
              variant="secondary"
              size="md"
              leadingIcon={<DownloadIcon />}
              disabled={filtered.length === 0}
              onClick={exportCsv}
            >
              Export CSV
            </Button>
            {ids.length > 0 ? (
              <Button
                variant="ghost"
                size="md"
                onClick={() => setClearOpen(true)}
              >
                Clear all
              </Button>
            ) : null}
          </>
        }
      />

      <div className={styles.tabsRow}>
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={FILTERS}
          ariaLabel="Filter trips by status"
        />
      </div>

      {showDemo ? <DemoFailedTripCard /> : null}

      {effectiveLoading ? (
        <Card padded={false}>
          <div className={styles.skelTable}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={styles.skelRow}>
                <Skeleton width={70} height={14} />
                <Skeleton width="60%" height={14} />
                <Skeleton width={60} height={14} />
                <Skeleton width={40} height={14} />
                <Skeleton width={90} height={20} radius={99} />
              </div>
            ))}
          </div>
        </Card>
      ) : showEmptyState ? (
        <EmptyState
          icon={<RouteIcon />}
          title="No trips yet"
          body="Plan your first trip to see it here. History is stored on this device."
          action={
            <Button as={Link} to="/new" variant="primary" size="lg">
              Plan your first trip
            </Button>
          }
        />
      ) : showNoMatches ? (
        <EmptyState
          icon={<RouteIcon />}
          title="No matches"
          body={
            query
              ? `No trips match "${query}".`
              : `No ${tripStatusLabel(filter).toLowerCase()} trips.`
          }
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : filtered.length === 0 ? null : (
        <Card padded={false} className={styles.tableCard}>
          <div className={styles.table} role="table" aria-label="Trips">
            <div className={styles.headRow} role="row">
              <span role="columnheader">Date</span>
              <span role="columnheader">Route</span>
              <span role="columnheader" className={styles.alignRight}>Miles</span>
              <span role="columnheader" className={styles.alignRight}>Days</span>
              <span role="columnheader">Status</span>
              <span role="columnheader" aria-hidden />
            </div>
            <ul className={styles.rows}>
              {filtered.map((trip) => (
                <li key={trip.id} role="row" className={styles.rowItem}>
                  <Link to={`/trips/${trip.id}`} className={styles.rowLink}>
                    <span className={styles.date}>
                      {formatShortDate(trip.inputs?.start_datetime)}
                    </span>
                    <span className={styles.route}>
                      {trip.__failed
                        ? `Trip ${trip.id} unavailable`
                        : routeLabel(trip.inputs)}
                    </span>
                    <span className={`${styles.num} ${styles.alignRight}`}>
                      {trip.__failed
                        ? "-"
                        : `${Math.round(trip.summary?.total_miles ?? 0).toLocaleString()} mi`}
                    </span>
                    <span className={`${styles.num} ${styles.alignRight}`}>
                      {trip.__failed ? "-" : `${trip.summary?.days ?? 0} d`}
                    </span>
                  </Link>
                  <div className={styles.statusCell}>
                    <StatusMenu
                      tripId={trip.id}
                      status={trip.__status}
                      override={trip.__override}
                      onPin={(next) => setStatusOverride(trip.id, next)}
                      onClear={() => clearStatusOverride(trip.id)}
                    />
                  </div>
                  <Link
                    to={`/trips/${trip.id}`}
                    className={styles.arrowLink}
                    aria-label={`View trip ${trip.id}`}
                  >
                    <span aria-hidden>›</span>
                  </Link>
                  {trip.__failed ? (
                    <div className={styles.failActions}>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => forget(trip.id)}
                      >
                        Remove from history
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <p className={styles.footnote}>
        Follow-up: backend list endpoint at{" "}
        <code className={styles.code}>GET /api/trips/</code> would replace the
        localStorage cache.
      </p>

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear all trip history?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clear();
                setClearOpen(false);
              }}
            >
              Clear history
            </Button>
          </>
        }
      >
        <p>
          This removes all {total} trips from this device and resets your
          cycle hours to 0:00. The trips themselves remain on the server and
          can be reloaded by ID, but they won't appear in this list anymore.
        </p>
      </Modal>
    </>
  );
}

function StatusMenu({ tripId, status, override, onPin, onClear }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const isPinned = Boolean(override);
  const [coords, setCoords] = useState(null);

  // Portal the menu to <body> so it escapes the table card's overflow: hidden
  // clipping. Anchor it to the button's bottom-right corner; reposition on
  // scroll/resize while open.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return undefined;
    const update = () => {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      const target = e.target;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (value) => {
    if (value == null) onClear();
    else onPin(value);
    setOpen(false);
  };

  const menu =
    open && coords
      ? createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            role="menu"
            id={menuId}
            style={{ top: coords.top, right: coords.right }}
          >
            <div className={styles.menuHeader}>Set status</div>
            {MANUAL_STATUS_OPTIONS.map((opt) => {
              const active = override === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={`${styles.menuItem} ${active ? styles.menuItemActive : ""}`}
                  onClick={() => choose(opt.value)}
                >
                  <StatusBadge status={opt.value} />
                  <span className={styles.menuItemHint}>
                    {active ? "Pinned" : ""}
                  </span>
                </button>
              );
            })}
            <div className={styles.menuDivider} />
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => choose(null)}
              disabled={!isPinned}
            >
              <span className={styles.menuItemAuto}>Use automatic</span>
              <span className={styles.menuItemHint}>From dates</span>
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={styles.statusWrap}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.statusButton}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={
          isPinned
            ? `Status set manually. Click to change for trip ${tripId}.`
            : `Change status for trip ${tripId}`
        }
      >
        <StatusBadge status={status} pinned={isPinned} />
        <span className={styles.statusCaret} aria-hidden>▾</span>
      </button>
      {menu}
    </div>
  );
}

function StatusBadge({ status, pinned = false }) {
  if (status === TRIP_STATUS.UPCOMING) {
    return (
      <Badge tone="neutral" dot>
        Upcoming
        {pinned ? <PinGlyph /> : null}
      </Badge>
    );
  }
  if (status === TRIP_STATUS.IN_PROGRESS) {
    return (
      <Badge tone="primary" dot>
        In progress
        {pinned ? <PinGlyph /> : null}
      </Badge>
    );
  }
  if (status === TRIP_STATUS.COMPLIANT) {
    return (
      <Badge tone="success" dot>
        Compliant
        {pinned ? <PinGlyph /> : null}
      </Badge>
    );
  }
  return (
    <Badge tone="warn" dot>
      Failed
      {pinned ? <PinGlyph /> : null}
    </Badge>
  );
}

function PinGlyph() {
  return (
    <span className={styles.pinGlyph} aria-label="manually set" title="Manually set">
      ●
    </span>
  );
}

function DemoFailedTripCard() {
  const [phase, setPhase] = useState("idle"); // idle | connecting | retrying | failed
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const step = (next, delay) => {
    timerRef.current = setTimeout(() => setPhase(next), delay);
  };

  const start = () => {
    if (phase !== "idle" && phase !== "failed") return;
    setPhase("connecting");
    step("retrying", 1200);
    setTimeout(() => setPhase("failed"), 2600);
  };

  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("idle");
  };

  const isRunning = phase === "connecting" || phase === "retrying";

  return (
    <Card padded={false} className={styles.demoCard}>
      <div className={styles.demoHeader}>
        <div className={styles.demoHeading}>
          <Badge tone="warn" dot>DEMO</Badge>
          <h2 className={styles.demoTitle}>What a failed trip looks like</h2>
        </div>
        <p className={styles.demoSubtitle}>
          This entry is a simulation, not a real trip. Press <strong>Simulate
          failure</strong> to watch the app retry the upstream call and
          finally mark the trip as failed.
        </p>
      </div>

      <div className={styles.demoRow} aria-live="polite">
        <span className={styles.date}>May 18 '26</span>
        <span className={styles.route}>
          Trip <span className="mono">demo-fail-001</span> · Chicago, IL → Tulsa, OK → Phoenix, AZ
        </span>
        <span className={`${styles.num} ${styles.alignRight}`}>
          {phase === "failed" ? "-" : "1,742 mi"}
        </span>
        <span className={`${styles.num} ${styles.alignRight}`}>
          {phase === "failed" ? "-" : "3 d"}
        </span>
        <span>
          <DemoPhaseBadge phase={phase} />
        </span>
        <span className={styles.arrow} aria-hidden>›</span>
      </div>

      <div className={styles.demoTimeline} aria-label="Simulation steps">
        <DemoStep
          label="ORS request sent"
          active={isRunning || phase === "failed"}
          done={phase !== "idle" && phase !== "connecting"}
        />
        <DemoStep
          label="Retry after timeout"
          active={phase === "retrying" || phase === "failed"}
          done={phase === "failed"}
        />
        <DemoStep
          label="Marked failed · 502 from upstream"
          active={phase === "failed"}
          done={phase === "failed"}
          terminal
        />
      </div>

      <div className={styles.demoActions}>
        <Button
          variant="primary"
          size="md"
          onClick={start}
          disabled={isRunning}
        >
          {phase === "failed"
            ? "Run again"
            : isRunning
              ? "Simulating…"
              : "Simulate failure"}
        </Button>
        <Button
          variant="ghost"
          size="md"
          onClick={reset}
          disabled={phase === "idle"}
        >
          Reset demo
        </Button>
        <span className={styles.demoFootnote}>
          Real failed trips appear here with a "Remove from history" action.
        </span>
      </div>
    </Card>
  );
}

function DemoPhaseBadge({ phase }) {
  if (phase === "connecting") {
    return <Badge tone="neutral" dot>Connecting…</Badge>;
  }
  if (phase === "retrying") {
    return <Badge tone="neutral" dot>Retrying…</Badge>;
  }
  if (phase === "failed") {
    return <Badge tone="warn" dot>Failed</Badge>;
  }
  return <Badge tone="neutral" dot>Idle</Badge>;
}

function DemoStep({ label, active, done, terminal = false }) {
  const cls = [
    styles.demoStep,
    active ? styles.demoStepActive : "",
    done ? styles.demoStepDone : "",
    terminal ? styles.demoStepTerminal : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      <span className={styles.demoStepDot} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

function RouteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 6h6a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 2v8M4 7l3 3 3-3M2.5 12.5h9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
