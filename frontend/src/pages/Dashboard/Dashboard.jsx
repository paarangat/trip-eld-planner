import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";

import Badge from "../../components/Badge/Badge.jsx";
import Button from "../../components/Button/Button.jsx";
import Card from "../../components/Card/Card.jsx";
import ComplianceGauge from "../../components/ComplianceGauge/ComplianceGauge.jsx";
import EmptyState from "../../components/EmptyState/EmptyState.jsx";
import ErrorBanner from "../../components/common/ErrorBanner.jsx";
import LogStrip from "../../components/LogStrip/LogStrip.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import RouteMiniMap from "../../components/RouteMiniMap/RouteMiniMap.jsx";
import Skeleton from "../../components/Skeleton/Skeleton.jsx";
import { getTrip } from "../../api/tripApi.js";
import { useActiveTrip } from "../../hooks/useActiveTrip.js";
import { useRecentTrips } from "../../hooks/useRecentTrips.js";
import { useSettings } from "../../hooks/useSettings.js";
import { useCycleHours } from "../../hooks/useCycleHours.js";
import { HOS_LIMITS } from "../../lib/hosLimits.js";
import {
  formatDecimalHours,
  formatHM,
  tripProgress,
} from "../../lib/tripProgress.js";
import { TRIP_STATUS, tripStatus } from "../../lib/tripStatus.js";
import styles from "./Dashboard.module.css";

export default function Dashboard() {
  const { settings } = useSettings();
  const cycleHours = useCycleHours(settings);
  const { trip, todayLog, loading, error: activeTripError } = useActiveTrip(
    settings.timezone,
  );

  // Backend attaches the four remaining-time clocks to each daily log. When
  // there's no active trip / no log for today, the trip-dependent clocks render
  // as idle ("—") and the cycle clock falls back to the driver's starting
  // state from settings.
  const status = trip ? tripStatus(trip) : null;
  const isInProgress = status === TRIP_STATUS.IN_PROGRESS;
  const activeLog = isInProgress ? todayLog : null;
  const backendClocks = activeLog?.hos_clocks ?? {};
  const fallbackCycleLeft = Math.max(0, HOS_LIMITS.CYCLE - (cycleHours ?? 0) * 60);
  const clocks = {
    driveLeft: backendClocks.drive_left_minutes ?? null,
    windowLeft: backendClocks.window_left_minutes ?? null,
    breakLeft: backendClocks.break_left_minutes ?? null,
    cycleLeft: backendClocks.cycle_left_minutes ?? fallbackCycleLeft,
  };

  const progress = useMemo(() => (trip ? tripProgress(trip) : null), [trip]);

  const [refreshKey, setRefreshKey] = useState(0);
  const recentTrips = useRecentList(5, refreshKey);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const tz = trip?.home_terminal_timezone ?? settings.timezone ?? "America/Chicago";
  const updatedAt = useMemo(
    () => formatClock(new Date(), tz),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tz, refreshKey],
  );
  const tzShort = useMemo(() => shortTz(tz), [tz]);

  const subtitle = isInProgress && progress?.percent != null
    ? `You're ${progress.percent}% through your current trip.`
    : trip
      ? "No trip in progress. Plan a new one to start the clocks."
      : "Plan your first trip to see live HOS clocks and a routed map.";

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={subtitle}
        actions={
          <>
            <Button
              variant="ghost"
              size="md"
              onClick={refresh}
              leadingIcon={<RefreshIcon />}
            >
              Refresh
            </Button>
            <Button
              as={Link}
              to="/new"
              variant="primary"
              size="md"
              leadingIcon={<PlusIcon />}
            >
              New trip
            </Button>
          </>
        }
      />

      <ErrorBanner error={activeTripError} title="Could not load trip status" />

      <section className={styles.section} aria-labelledby="compliance-now">
        <div className={styles.sectionHead}>
          <h2 id="compliance-now" className={styles.eyebrow}>Compliance now</h2>
          <span className={styles.metaText}>
            updated <span className="mono tabular">{updatedAt}</span> · {tzShort}
          </span>
        </div>
        <div className={styles.gauges}>
          <ComplianceGauge
            label="Drive time left"
            remaining={clocks.driveLeft}
            limit={HOS_LIMITS.DRIVE}
            sub="of 11:00 today"
          />
          <ComplianceGauge
            label="On-duty window"
            remaining={clocks.windowLeft}
            limit={HOS_LIMITS.WINDOW}
            sub="of 14:00 today"
          />
          <ComplianceGauge
            label="Time until break"
            remaining={clocks.breakLeft}
            limit={HOS_LIMITS.BREAK}
            sub="until break 08:00"
          />
          <ComplianceGauge
            label="Cycle hours left"
            remaining={clocks.cycleLeft}
            limit={HOS_LIMITS.CYCLE}
            sub="of 70:00 today"
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="active-trip">
        <div className={styles.sectionHead}>
          <h2 id="active-trip" className={styles.eyebrow}>Active trip</h2>
        </div>
        {loading ? (
          <Card>
            <div className={styles.activeLoading}>
              <Skeleton width="60%" height={20} />
              <Skeleton width="40%" height={14} />
              <Skeleton width="100%" height={260} radius={8} />
            </div>
          </Card>
        ) : isInProgress && trip ? (
          <ActiveTripCard trip={trip} progress={progress} timeZone={tz} />
        ) : activeTripError ? (
          <Card padded={false}>
            <EmptyState
              icon={<MapPinIcon />}
              title="Trip status unavailable"
              body="The most recent trip could not be loaded. Check your connection before relying on these clocks."
              action={
                <Button as={Link} to="/trips" variant="secondary" size="lg">
                  Open trip history
                </Button>
              }
            />
          </Card>
        ) : (
          <Card padded={false}>
            <EmptyState
              icon={<MapPinIcon />}
              title="No trip in progress"
              body={
                trip
                  ? "Your last trip is closed out. Plan a new one to start the clocks."
                  : "Plan your first trip to see live HOS clocks and a routed map."
              }
              action={
                <Button as={Link} to="/new" variant="primary" size="lg">
                  Plan a new trip
                </Button>
              }
            />
          </Card>
        )}
      </section>

      <section className={styles.lowerRow}>
        <div className={styles.recent}>
          <div className={styles.sectionHead}>
            <h2 className={styles.recentTitle}>Recent trips</h2>
            <Link to="/trips" className={styles.sectionLink}>
              See all →
            </Link>
          </div>
          <Card padded={false}>
            {recentTrips.loading ? (
              <RecentSkeleton />
            ) : recentTrips.items.length === 0 ? (
              <div className={styles.recentEmpty}>
                No trips yet.{" "}
                <Link to="/new" className={styles.inlineLink}>
                  Plan one →
                </Link>
              </div>
            ) : (
              <ul className={styles.recentList}>
                {recentTrips.items.map((t) => (
                  <li key={t.id}>
                    <Link to={`/trips/${t.id}`} className={styles.recentRow}>
                      <span className={styles.recentDate}>
                        {formatShort(t.inputs?.start_datetime, tz)}
                      </span>
                      <span className={styles.recentRoute}>
                        {t.__failed
                          ? `Trip ${t.id} unavailable`
                          : routeLabel(t.inputs)}
                      </span>
                      <span className={styles.recentArrow} aria-hidden>
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className={styles.todayLog}>
          <div className={styles.sectionHead}>
            <h2 className={styles.recentTitle}>Today's log</h2>
            <span className={styles.todayDate}>
              {todayLog
                ? formatLogDate(todayLog.date)
                : formatLogDate(todayIso(tz))}
            </span>
          </div>
          <Card>
            <div className={styles.todayBody}>
              <span className={styles.todaySubLabel}>Driving so far</span>
              <span className={`${styles.todayBig} mono tabular`}>
                {todayLog
                  ? formatHM(todayLog.totals?.driving_minutes ?? 0)
                  : "00:00"}
              </span>
              <div className={styles.todayStrip}>
                <LogStrip segments={todayLog?.segments ?? []} height={28} />
                <div className={styles.todayAxis}>
                  <span>00</span>
                  <span>06</span>
                  <span>12</span>
                  <span>18</span>
                  <span>24</span>
                </div>
              </div>
              <Link to="/logs" className={styles.viewDaily}>
                View daily log →
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}

function ActiveTripCard({ trip, progress, timeZone }) {
  const inputs = trip.inputs ?? {};
  return (
    <Card padded={false} className={styles.activeCard}>
      <div className={styles.activeGrid}>
        <div className={styles.activeMap}>
          <RouteMiniMap
            route={trip.route}
            stops={trip.stops ?? []}
            places={trip.route?.places ?? []}
            height={320}
          />
        </div>
        <div className={styles.activeInfo}>
          <div className={styles.activeHead}>
            <div className={styles.activeHeadText}>
              <h3 className={styles.activeTitle}>{routeLabel(inputs)}</h3>
              <p className={styles.activeMeta}>
                Trip <span className="mono">{trip.id}</span> · planned{" "}
                {formatPlanned(inputs.start_datetime, timeZone)}
                {progress?.nearLabel ? (
                  <>
                    {" · currently near "}
                    <strong>{progress.nearLabel}</strong>
                  </>
                ) : null}
              </p>
            </div>
            <Badge tone="primary" dot>In progress</Badge>
          </div>

          <div className={styles.activeStats}>
            <Stat
              label="Distance done"
              value={
                progress?.milesDone != null && progress?.totalMiles != null
                  ? `${progress.milesDone.toLocaleString()} / ${progress.totalMiles.toLocaleString()}`
                  : "—"
              }
              unit="mi"
            />
            <Stat
              label="Drive time"
              value={
                progress?.driveMinutesSoFar != null
                  ? formatDecimalHours(progress.driveMinutesSoFar)
                  : "—"
              }
              unit="hr"
            />
            <Stat
              label="Next stop"
              value={
                progress?.nextStop
                  ? `${progress.nextStop.kindLabel} — ${progress.nextStop.label}`
                  : "—"
              }
              dense
            />
            <Stat
              label="ETA next stop"
              value={progress?.etaNextStop ?? "—"}
            />
          </div>

          <div className={styles.activeActions}>
            <Button as={Link} to={`/trips/${trip.id}`} variant="primary" size="md">
              View full trip →
            </Button>
            <Button variant="secondary" size="md" leadingIcon={<PinSmallIcon />}>
              Center map
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function useRecentList(count, refreshKey) {
  const { ids } = useRecentTrips();
  const slice = ids.slice(0, count);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (slice.length === 0) {
      setItems([]);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    Promise.all(
      slice.map((id) =>
        getTrip(id, { signal: controller.signal }).catch((err) => {
          if (err.name === "AbortError") throw err;
          return { id, __failed: true, inputs: {}, summary: {} };
        }),
      ),
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        setItems(results);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
      });
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice.join("|"), refreshKey]);

  return { items, loading };
}

function Stat({ label, value, unit, dense = false }) {
  return (
    <div className={`${styles.stat} ${dense ? styles.statDense : ""}`}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>
        <span className={styles.statValueText}>{value}</span>
        {unit ? <span className={styles.statUnit}>{unit}</span> : null}
      </span>
    </div>
  );
}

function RecentSkeleton() {
  return (
    <ul className={styles.recentList}>
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <div className={styles.recentRow} style={{ pointerEvents: "none" }}>
            <Skeleton width={80} height={14} />
            <Skeleton width="60%" height={16} />
            <span />
          </div>
        </li>
      ))}
    </ul>
  );
}

function routeLabel(inputs = {}) {
  const current = inputs.current_location || "—";
  const pickup = inputs.pickup_location;
  const dropoff = inputs.dropoff_location || "—";
  return pickup ? `${current} → ${pickup} → ${dropoff}` : `${current} → ${dropoff}`;
}

function formatShort(iso, timeZone) {
  if (!iso) return "—";
  try {
    return new Date(iso)
      .toLocaleDateString("en-US", {
        timeZone,
        month: "short",
        day: "numeric",
        year: "2-digit",
      })
      .replace(/(\d+),? (\d+)$/, (_m, d, y) => `${d} '${y}`);
  } catch {
    return iso;
  }
}

function formatPlanned(iso, timeZone) {
  if (!iso) return "—";
  try {
    return new Date(iso)
      .toLocaleDateString("en-US", {
        timeZone,
        month: "short",
        day: "numeric",
        year: "2-digit",
      })
      .replace(/(\d+),? (\d+)$/, (_m, d, y) => `${d} '${y}`);
  } catch {
    return iso;
  }
}

function formatLogDate(iso) {
  if (!iso) return "";
  try {
    return new Date(`${iso.slice(0, 10)}T12:00:00`)
      .toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "2-digit",
      })
      .replace(/(\d+),? (\d+)$/, (_m, d, y) => `${d} '${y}`);
  } catch {
    return iso;
  }
}

function formatClock(date, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

function shortTz(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

function todayIso(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const by = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${by.year}-${by.month}-${by.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function MapPinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M11 19c4-4 6-7 6-10a6 6 0 0 0-12 0c0 3 2 6 6 10z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="11" cy="9" r="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PinSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 12c2.5-2.5 4-4.4 4-6.4A4 4 0 0 0 3 5.6c0 2 1.5 3.9 4 6.4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="5.6" r="1.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2 7a5 5 0 0 1 8.7-3.4M12 7A5 5 0 0 1 3.3 10.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M11 1.5V4H8.5M3 12.5V10H5.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
