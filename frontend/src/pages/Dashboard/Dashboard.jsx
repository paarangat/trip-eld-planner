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
import PlayBar from "../../components/PlayBar/PlayBar.jsx";
import RouteMiniMap from "../../components/RouteMiniMap/RouteMiniMap.jsx";
import Skeleton from "../../components/Skeleton/Skeleton.jsx";
import {
  useSimulatedClocks,
  useSimulation,
} from "../../contexts/SimulationContext.jsx";
import { useActiveTrip } from "../../hooks/useActiveTrip.js";
import { useRecentTrips } from "../../hooks/useRecentTrips.js";
import { useSettings } from "../../hooks/useSettings.js";
import { useTripList } from "../../hooks/useTripList.js";
import { useTripStatusOverrides } from "../../hooks/useTripStatusOverrides.js";
import { useCycleHours } from "../../hooks/useCycleHours.js";
import {
  formatClock,
  formatHM,
  formatLogDate,
  formatShortDate,
  isoDateInZone,
  minuteOfDayInZone,
  routeLabel,
  shortTimeZone,
  todayIso,
} from "../../lib/format.js";
import { HOS_LIMITS } from "../../lib/hosLimits.js";
import {
  formatDecimalHours,
  tripProgress,
} from "../../lib/tripProgress.js";
import { TRIP_STATUS, tripStatus } from "../../lib/tripStatus.js";
import styles from "./Dashboard.module.css";

export default function Dashboard() {
  const { settings, update: updateSettings } = useSettings();
  const cycleHours = useCycleHours(settings);
  const { ids: recentTripIds } = useRecentTrips();
  const { overrides: statusOverrides } = useTripStatusOverrides();
  const { trip, todayLog, loading, error: activeTripError } = useActiveTrip(
    settings.timezone,
  );

  // Self-heal a stale carryover: the cycle counter is rolled forward from past
  // trips, so an empty trip list means the counter has nothing left to back it.
  // Reset to a pristine 0:00 so the dashboard, the NewTrip slider, and the
  // gauge all agree.
  useEffect(() => {
    if (recentTripIds.length === 0 && (cycleHours > 0 || settings.cycleHoursSource)) {
      updateSettings({ currentCycleHours: 0, cycleHoursSource: null });
    }
  }, [recentTripIds.length, cycleHours, settings.cycleHoursSource, updateSettings]);

  // Backend attaches the four remaining-time clocks to each daily log. When
  // there's no active trip / no log for today, the trip-dependent clocks render
  // as idle ("-") and the cycle clock falls back to the driver's starting
  // state from settings.
  const status = trip
    ? tripStatus(trip, statusOverrides[trip.id] ?? null)
    : null;
  const isInProgress = status === TRIP_STATUS.IN_PROGRESS;
  const isUpcoming = status === TRIP_STATUS.UPCOMING;

  // Hand the active (or upcoming) trip to the global simulator so the
  // Dashboard gauges, the PlayBar, and the Trip Detail page all read from
  // one source. For in-progress trips the simulator auto-defaults to "live"
  // (simulationNow follows wall-clock); for upcoming trips it parks at the
  // trip start so the user can scrub or hit Play to preview.
  const {
    loadTrip: loadIntoSimulator,
    hasTrip: simulatorHasTrip,
    simulationNow,
  } = useSimulation();
  const simulatedClocks = useSimulatedClocks();
  useEffect(() => {
    if (trip && (isInProgress || isUpcoming)) {
      loadIntoSimulator(trip);
    }
  }, [trip, isInProgress, isUpcoming, loadIntoSimulator]);

  // Prefer simulated clocks any time the simulator has the trip loaded.
  // For in-progress trips this is live wall-clock state; for upcoming it
  // updates as the user scrubs/plays the preview.
  const useSimulated =
    (isInProgress || isUpcoming) && simulatorHasTrip && simulatedClocks;
  const backendClocks = (isInProgress ? todayLog : null)?.hos_clocks ?? {};
  const fallbackCycleLeft = Math.max(0, HOS_LIMITS.CYCLE - (cycleHours ?? 0) * 60);
  const clocks = useSimulated
    ? {
        driveLeft: simulatedClocks.drive_left_minutes,
        windowLeft: simulatedClocks.window_left_minutes,
        breakLeft: simulatedClocks.break_left_minutes,
        cycleLeft: simulatedClocks.cycle_left_minutes,
      }
    : {
        driveLeft: backendClocks.drive_left_minutes ?? null,
        windowLeft: backendClocks.window_left_minutes ?? null,
        breakLeft: backendClocks.break_left_minutes ?? null,
        cycleLeft: backendClocks.cycle_left_minutes ?? fallbackCycleLeft,
      };

  const tz =
    trip?.home_terminal_timezone ?? settings.timezone ?? "America/Chicago";

  // Bind the progress snapshot to simulationNow so distance/drive-time/next-stop
  // update as the user scrubs the play bar. Falls back to real wall-clock when
  // no trip is loaded into the simulator.
  const progress = useMemo(() => {
    if (!trip) return null;
    const now =
      simulatorHasTrip && simulationNow != null
        ? new Date(simulationNow)
        : new Date();
    return tripProgress(trip, { now });
  }, [trip, simulatorHasTrip, simulationNow]);

  // "Today's log" panel: when the simulator is loaded, follow the day that
  // simulationNow lands in (which may be a future day for upcoming trips, or
  // past/future days the user has scrubbed to). Otherwise show today's real
  // log if a trip is in-progress, else nothing.
  const simulatedDate = useMemo(
    () =>
      simulatorHasTrip && simulationNow != null
        ? isoDateInZone(simulationNow, tz)
        : null,
    [simulatorHasTrip, simulationNow, tz],
  );
  const simulatedDayLog = useMemo(() => {
    if (!simulatedDate || !trip) return null;
    return (trip.daily_logs ?? []).find((log) => log.date === simulatedDate) ?? null;
  }, [simulatedDate, trip]);
  const displayLog = simulatedDayLog ?? todayLog;
  // Partial driving minutes within the displayed day, clipped to simulationNow.
  const displayedDriveMinutes = useMemo(() => {
    if (!displayLog) return null;
    if (!simulatorHasTrip || simulationNow == null) {
      return displayLog.totals?.driving_minutes ?? 0;
    }
    let total = 0;
    for (const seg of displayLog.segments ?? []) {
      if (seg.status !== "driving") continue;
      const start = new Date(seg.start).getTime();
      const end = new Date(seg.end).getTime();
      if (end <= simulationNow) {
        total += Math.max(0, Math.round((end - start) / 60000));
      } else if (start <= simulationNow) {
        total += Math.max(0, Math.round((simulationNow - start) / 60000));
        break;
      } else {
        break;
      }
    }
    return total;
  }, [displayLog, simulationNow, simulatorHasTrip]);
  // Minute-of-day for the "now" marker on the day strip; null if simulationNow
  // falls outside the displayed day.
  const nowMinute = useMemo(() => {
    if (!displayLog || !simulatorHasTrip || simulationNow == null) return null;
    const simIso = isoDateInZone(simulationNow, tz);
    if (simIso !== displayLog.date) return null;
    return minuteOfDayInZone(simulationNow, tz);
  }, [displayLog, simulationNow, simulatorHasTrip, tz]);

  const [refreshKey, setRefreshKey] = useState(0);
  const recentListIds = useMemo(
    () => recentTripIds.slice(0, 5),
    [recentTripIds],
  );
  const recentTrips = useTripList({ ids: recentListIds, refreshKey });
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const updatedAt = useMemo(
    () => formatClock(new Date(), tz),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tz, refreshKey],
  );
  const tzShort = useMemo(() => shortTimeZone(tz), [tz]);

  const subtitle = isInProgress && progress?.percent != null
    ? `You're ${progress.percent}% through your current trip.`
    : isUpcoming
      ? "Your next trip is planned but has not started yet."
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
        ) : (isInProgress || isUpcoming) && trip ? (
          <ActiveTripCard
            trip={trip}
            progress={progress}
            timeZone={tz}
            isInProgress={isInProgress}
          />
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
                        {formatShortDate(t.inputs?.start_datetime, tz)}
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
            <h2 className={styles.recentTitle}>
              {simulatedDayLog && simulatedDate !== todayIso(tz)
                ? "Day in view"
                : "Today's log"}
            </h2>
            <span className={styles.todayDate}>
              {displayLog
                ? formatLogDate(displayLog.date)
                : formatLogDate(simulatedDate ?? todayIso(tz))}
            </span>
          </div>
          <Card>
            <div className={styles.todayBody}>
              <span className={styles.todaySubLabel}>
                {simulatorHasTrip && simulationNow != null
                  ? "Driving so far"
                  : "Driving planned"}
              </span>
              <span className={`${styles.todayBig} mono tabular`}>
                {displayedDriveMinutes != null
                  ? formatHM(displayedDriveMinutes)
                  : "00:00"}
              </span>
              <div className={styles.todayStrip}>
                <LogStrip
                  segments={displayLog?.segments ?? []}
                  height={28}
                  nowMinute={nowMinute}
                />
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

function ActiveTripCard({ trip, progress, timeZone, isInProgress = true }) {
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
                {formatShortDate(inputs.start_datetime, timeZone)}
                {progress?.nearLabel ? (
                  <>
                    {" · currently near "}
                    <strong>{progress.nearLabel}</strong>
                  </>
                ) : null}
              </p>
            </div>
            <Badge tone={isInProgress ? "primary" : "neutral"} dot>
              {isInProgress ? "In progress" : "Scheduled"}
            </Badge>
          </div>

          <div className={styles.activeSim}>
            <PlayBar timeZone={timeZone} variant="compact" />
          </div>

          <div className={styles.activeStats}>
            <Stat
              label="Distance done"
              value={
                progress?.milesDone != null && progress?.totalMiles != null
                  ? `${progress.milesDone.toLocaleString()} / ${progress.totalMiles.toLocaleString()}`
                  : "-"
              }
              unit="mi"
            />
            <Stat
              label="Drive time"
              value={
                progress?.driveMinutesSoFar != null
                  ? formatDecimalHours(progress.driveMinutesSoFar)
                  : "-"
              }
              unit="hr"
            />
            <Stat
              label="Next stop"
              value={
                progress?.nextStop
                  ? `${progress.nextStop.kindLabel} - ${progress.nextStop.label}`
                  : "-"
              }
              dense
            />
            <Stat
              label="ETA next stop"
              value={progress?.etaNextStop ?? "-"}
            />
          </div>

          <div className={styles.activeActions}>
            <Button as={Link} to={`/trips/${trip.id}`} variant="primary" size="md">
              View full trip →
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
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
