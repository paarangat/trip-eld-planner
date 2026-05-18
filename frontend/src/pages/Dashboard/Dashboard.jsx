import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import Button from "../../components/Button/Button.jsx";
import Card from "../../components/Card/Card.jsx";
import EmptyState from "../../components/EmptyState/EmptyState.jsx";
import HOSClock from "../../components/HOSClock/HOSClock.jsx";
import LogStrip from "../../components/LogStrip/LogStrip.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import Skeleton from "../../components/Skeleton/Skeleton.jsx";
import { getTrip } from "../../api/tripApi.js";
import { useActiveTrip } from "../../hooks/useActiveTrip.js";
import { useRecentTrips } from "../../hooks/useRecentTrips.js";
import { useSettings } from "../../hooks/useSettings.js";
import { useCycleHours } from "../../hooks/useCycleHours.js";
import { HOS_LIMITS, computeClocks } from "../../lib/hosClocks.js";
import styles from "./Dashboard.module.css";

export default function Dashboard() {
  const { settings } = useSettings();
  const cycleHours = useCycleHours(settings);
  const { trip, isActive, todayLog, loading } = useActiveTrip();

  const clocks = computeClocks({
    trip: isActive ? trip : null,
    todayLog: isActive ? todayLog : null,
    cycleStartHours: cycleHours,
  });

  const recentTrips = useRecentList(5);

  const driverName = settings.driverName || "driver";

  return (
    <>
      <PageHeader
        eyebrow={`Good ${greeting()}, ${driverName}`}
        title="Today, at a glance"
        description="Your on-the-clock status, your active trip, and your last five runs."
      />

      <section className={styles.clocks} aria-label="Hours-of-service clocks">
        <HOSClock
          label="Drive time left"
          remaining={clocks.driveLeft}
          limit={HOS_LIMITS.DRIVE}
          sub="of 11:00 today"
        />
        <HOSClock
          label="On-duty window"
          remaining={clocks.windowLeft}
          limit={HOS_LIMITS.WINDOW}
          sub="of 14:00 window"
        />
        <HOSClock
          label="Until 30-min break"
          remaining={clocks.breakLeft}
          limit={HOS_LIMITS.BREAK}
          sub="after 8 cumul. hours"
        />
        <HOSClock
          label="Cycle hours left"
          remaining={clocks.cycleLeft}
          limit={HOS_LIMITS.CYCLE}
          sub="of 70 in 8 days"
        />
      </section>

      <section className={styles.activeRow}>
        {loading ? (
          <Card>
            <div className={styles.activeLoading}>
              <Skeleton width="60%" height={20} />
              <Skeleton width="40%" height={14} />
              <Skeleton width="100%" height={120} radius={8} />
            </div>
          </Card>
        ) : isActive && trip ? (
          <ActiveTripCard trip={trip} todayLog={todayLog} />
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
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Recent trips</h2>
            <Link to="/trips" className={styles.sectionLink}>
              View all →
            </Link>
          </header>
          {recentTrips.loading ? (
            <RecentSkeleton />
          ) : recentTrips.items.length === 0 ? (
            <Card>
              <p className={styles.mutedText}>
                No trips yet. <Link to="/new" className={styles.inlineLink}>Plan one →</Link>
              </p>
            </Card>
          ) : (
            <ul className={styles.recentList}>
              {recentTrips.items.map((t) => (
                <li key={t.id}>
                  <Link to={`/trips/${t.id}`} className={styles.recentRow}>
                    <span className={styles.recentDate}>
                      {formatShort(t.inputs?.start_datetime)}
                    </span>
                    <span className={styles.recentRoute}>
                      {t.inputs?.current_location ?? "—"} →{" "}
                      {t.inputs?.dropoff_location ?? "—"}
                    </span>
                    <span className={styles.recentMiles}>
                      <span className="mono tabular">
                        {Math.round(t.summary?.total_miles ?? 0).toLocaleString()}
                      </span>{" "}
                      mi · {t.summary?.days ?? 1}{" "}
                      {(t.summary?.days ?? 1) === 1 ? "day" : "days"}
                    </span>
                    <span className={styles.recentArrow} aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.todayLog}>
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Today's log</h2>
            <Link to="/logs" className={styles.sectionLink}>
              Open calendar →
            </Link>
          </header>
          <Card>
            {todayLog ? (
              <div className={styles.todayBody}>
                <div className={styles.todayMeta}>
                  <span className={styles.mutedText}>{formatLongDate(todayLog.date)}</span>
                  <span className={styles.todayDrive}>
                    <span className="mono tabular">
                      {formatHM(todayLog.totals?.driving_minutes ?? 0)}
                    </span>{" "}
                    drive
                  </span>
                </div>
                <LogStrip segments={todayLog.segments ?? []} height={20} />
                <div className={styles.todayLegend}>
                  <LegendDot kind="off_duty" label="Off" />
                  <LegendDot kind="sleeper_berth" label="Sleeper" />
                  <LegendDot kind="driving" label="Driving" />
                  <LegendDot kind="on_duty" label="On-duty" />
                </div>
              </div>
            ) : (
              <p className={styles.mutedText}>No log for today.</p>
            )}
          </Card>
        </div>
      </section>
    </>
  );
}

function useRecentList(count) {
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
    let cancelled = false;
    setLoading(true);
    Promise.all(
      slice.map((id) =>
        getTrip(id).catch(() => ({ id, __failed: true, inputs: {}, summary: {} })),
      ),
    ).then((results) => {
      if (!cancelled) {
        setItems(results);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice.join("|")]);

  return { items, loading };
}

function ActiveTripCard({ trip, todayLog }) {
  const inputs = trip.inputs ?? {};
  return (
    <Card>
      <div className={styles.activeHead}>
        <div>
          <span className={styles.eyebrowSmall}>Active trip · {trip.id}</span>
          <h3 className={styles.activeTitle}>
            {inputs.current_location} → {inputs.dropoff_location}
          </h3>
        </div>
        <Button as={Link} to={`/trips/${trip.id}`} variant="secondary" size="md">
          View full trip
        </Button>
      </div>
      <div className={styles.activeStats}>
        <Stat label="Total miles" value={Math.round(trip.summary?.total_miles ?? 0)} unit="mi" />
        <Stat
          label="Drive time"
          value={(trip.summary?.total_drive_hours ?? 0).toFixed(1)}
          unit="hr"
        />
        <Stat
          label="On-duty"
          value={(trip.summary?.total_on_duty_hours ?? 0).toFixed(1)}
          unit="hr"
        />
        <Stat label="Days" value={trip.summary?.days ?? 1} unit="d" />
      </div>
      {todayLog ? (
        <div className={styles.activeStrip}>
          <span className={styles.eyebrowSmall}>Today · {formatLongDate(todayLog.date)}</span>
          <LogStrip segments={todayLog.segments ?? []} height={16} />
        </div>
      ) : null}
    </Card>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>
        <span className="mono tabular">{value}</span>
        <span className={styles.statUnit}>{unit}</span>
      </span>
    </div>
  );
}

function LegendDot({ kind, label }) {
  return (
    <span className={styles.legendItem}>
      <span
        className={styles.legendDot}
        style={{ background: `var(--status-${kind === "sleeper_berth" ? "sleeper" : kind === "off_duty" ? "off" : kind === "on_duty" ? "onduty" : "driving"})` }}
      />
      {label}
    </span>
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
            <Skeleton width={100} height={14} />
            <span />
          </div>
        </li>
      ))}
    </ul>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function formatShort(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatLongDate(iso) {
  if (!iso) return "";
  try {
    return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatHM(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")}`;
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
