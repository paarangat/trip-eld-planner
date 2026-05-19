import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Badge from "../../components/Badge/Badge.jsx";
import Button from "../../components/Button/Button.jsx";
import Card from "../../components/Card/Card.jsx";
import ComplianceGauge from "../../components/ComplianceGauge/ComplianceGauge.jsx";
import EmptyState from "../../components/EmptyState/EmptyState.jsx";
import LogSheet from "../../components/LogSheet/LogSheet.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import PlayBar from "../../components/PlayBar/PlayBar.jsx";
import RouteMap from "../../components/RouteMap/RouteMap.jsx";
import Skeleton from "../../components/Skeleton/Skeleton.jsx";
import StatCard from "../../components/StatCard/StatCard.jsx";
import Tabs from "../../components/Tabs/Tabs.jsx";
import { ApiError, getTrip } from "../../api/tripApi.js";
import {
  useSimulation,
  useSimulatedClocks,
} from "../../contexts/SimulationContext.jsx";
import { HOS_LIMITS } from "../../lib/hosLimits.js";
import styles from "./TripDetail.module.css";

const STOP_LABELS = {
  start: "Start",
  pickup: "Pickup",
  dropoff: "Drop-off",
  fuel: "Fuel",
  break: "Break",
  rest: "10-hr rest",
  restart: "34-hr restart",
};

const STOP_TONE = {
  start: "neutral",
  pickup: "success",
  dropoff: "danger",
  fuel: "warn",
  break: "neutral",
  rest: "primary",
  restart: "primary",
};

export default function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${id}:${reloadKey}`;
  const [request, setRequest] = useState({
    key: requestKey,
    trip: null,
    loading: true,
    error: null,
  });
  const { loadTrip, simulationNow, tripId: simTripId } = useSimulation();
  const simulatedClocks = useSimulatedClocks();

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return null;
        setRequest({ key: requestKey, trip: null, loading: true, error: null });
        setTab("overview");
        return getTrip(id, { signal: controller.signal });
      })
      .then((data) => {
        if (!data) return;
        if (controller.signal.aborted) return;
        setRequest({ key: requestKey, trip: data, loading: false, error: null });
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        setRequest({ key: requestKey, trip: null, loading: false, error: err });
      });
    return () => {
      controller.abort();
    };
  }, [id, reloadKey, requestKey]);

  const requestStale = request.key !== requestKey;
  const trip = requestStale ? null : request.trip;
  const loading = requestStale || request.loading;
  const error = requestStale ? null : request.error;

  const empty = !loading && !trip;
  const emptyLogs = trip && (!trip.daily_logs || trip.daily_logs.length === 0);

  useEffect(() => {
    if (trip && trip.id !== simTripId) {
      loadTrip(trip);
    }
  }, [trip, simTripId, loadTrip]);

  const inputs = trip?.inputs ?? {};
  const summary = trip?.summary ?? {};
  const dailyLogs = trip?.daily_logs ?? [];
  const routeLegs = trip?.route?.legs ?? [];
  const homeTerminalTimezone =
    trip?.home_terminal_timezone ?? inputs.home_terminal_timezone;

  const tabs = useMemo(
    () => [
      { value: "overview", label: "Overview" },
      { value: "route", label: "Route" },
      { value: "logs", label: "Daily logs", count: dailyLogs.length },
      { value: "stops", label: "Stops", count: (trip?.stops ?? []).length },
    ],
    [dailyLogs.length, trip?.stops],
  );

  if (loading) {
    return (
      <>
        <PageHeader title="Loading trip…" eyebrow="Trip detail" />
        <Card>
          <div className={styles.skelHead}>
            <Skeleton width="40%" height={24} />
            <Skeleton width="20%" height={14} />
          </div>
          <Skeleton width="100%" height={240} radius={8} />
        </Card>
      </>
    );
  }

  if (error || empty) {
    const isNotFound = error instanceof ApiError && error.status === 404;
    const headerTitle = isNotFound ? "Trip not found" : "Couldn't load this trip";
    const bodyCopy = isNotFound
      ? "We couldn't find this trip on the server. It may have been deleted."
      : "We hit an error reaching the server. Try again or check back in a moment.";
    return (
      <>
        <PageHeader title={headerTitle} eyebrow="Trip detail" />
        <EmptyState
          icon={<MissingIcon />}
          title={`Trip ${id} could not be loaded`}
          body={bodyCopy}
          action={
            <>
              <Button
                variant="primary"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                Retry
              </Button>
              <Button as={Link} to="/trips" variant="secondary">
                Back to history
              </Button>
            </>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`Trip · ${trip.id}`}
        title={routeLabel(inputs)}
        description={`Planned ${formatLong(inputs.start_datetime, homeTerminalTimezone)}`}
        actions={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={() =>
                navigate("/new", {
                  state: {
                    replay: {
                      current_location: inputs.current_location ?? "",
                      pickup_location: inputs.pickup_location ?? "",
                      dropoff_location: inputs.dropoff_location ?? "",
                      current_cycle_hours: inputs.current_cycle_hours ?? 0,
                    },
                  },
                })
              }
            >
              Replan
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => window.print()}
              leadingIcon={<PrinterIcon />}
            >
              Print logs
            </Button>
          </>
        }
      />

      {emptyLogs ? (
        <Card>
          <div className={styles.failBanner}>
            <Badge tone="warn" dot>No daily logs</Badge>
            <span>
              This trip didn't produce any daily logs. The route may be
              incomplete — try replanning with the same inputs.
            </span>
          </div>
        </Card>
      ) : null}

      <div data-print-hide>
        <Tabs value={tab} onChange={setTab} tabs={tabs} ariaLabel="Trip sections" />
      </div>

      <div className={styles.body}>
        {tab === "overview" ? (
          <div className={styles.overview}>
            <div className={styles.statRow}>
              <StatCard
                label="Total miles"
                value={Math.round(summary.total_miles ?? 0).toLocaleString()}
                unit="mi"
              />
              <StatCard
                label="Drive time"
                value={(summary.total_drive_hours ?? 0).toFixed(1)}
                unit="hr"
              />
              <StatCard
                label="On-duty time"
                value={(summary.total_on_duty_hours ?? 0).toFixed(1)}
                unit="hr"
              />
              <StatCard
                label="Days"
                value={summary.days ?? 1}
                unit={(summary.days ?? 1) === 1 ? "day" : "days"}
              />
            </div>
            <Card data-print-hide className={styles.simBar}>
              <div className={styles.simHeader}>
                <div>
                  <h2 className={styles.simTitle}>Simulate the drive</h2>
                  <p className={styles.simHelp}>
                    Press <strong>Play</strong> to watch the four HOS clocks tick
                    down through the planned trip, or drag the ribbon to jump to
                    any moment. Coloured bands show what the driver is doing —
                    driving, on-duty, breaks, rests — and chips above call out
                    each pickup, fuel stop, and drop-off.
                  </p>
                </div>
              </div>
              <PlayBar timeZone={homeTerminalTimezone} />
              <div className={styles.simGauges}>
                <ComplianceGauge
                  label="Drive time left"
                  remaining={simulatedClocks?.drive_left_minutes ?? null}
                  limit={HOS_LIMITS.DRIVE}
                  sub="of 11:00"
                />
                <ComplianceGauge
                  label="On-duty window"
                  remaining={simulatedClocks?.window_left_minutes ?? null}
                  limit={HOS_LIMITS.WINDOW}
                  sub="of 14:00"
                />
                <ComplianceGauge
                  label="Time until break"
                  remaining={simulatedClocks?.break_left_minutes ?? null}
                  limit={HOS_LIMITS.BREAK}
                  sub="until break 08:00"
                />
                <ComplianceGauge
                  label="Cycle hours left"
                  remaining={simulatedClocks?.cycle_left_minutes ?? null}
                  limit={HOS_LIMITS.CYCLE}
                  sub="of 70:00"
                />
              </div>
            </Card>
            <div className={styles.overviewMap}>
              <RouteMap
                route={trip.route}
                stops={trip.stops ?? []}
                places={trip.route?.places ?? []}
              />
            </div>
            <Card>
              <div className={styles.summaryRow}>
                <div>
                  <span className={styles.label}>Starts</span>
                  <span className={styles.bigDate}>
                    {formatLongWithTime(inputs.start_datetime, homeTerminalTimezone)}
                  </span>
                </div>
                <div>
                  <span className={styles.label}>Ends</span>
                  <span className={styles.bigDate}>
                    {formatEndDate(dailyLogs)}
                  </span>
                </div>
                <div>
                  <span className={styles.label}>Cycle at start</span>
                  <span className={styles.bigDate}>
                    <span className="mono tabular">
                      {Number(inputs.current_cycle_hours ?? 0).toFixed(2)}
                    </span>{" "}
                    <span className={styles.unitSmall}>hr used</span>
                  </span>
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {tab === "route" ? (
          <div className={styles.routeView}>
            <RouteMap
              route={trip.route}
              stops={trip.stops ?? []}
              places={trip.route?.places ?? []}
            />
            <section className={styles.directionsPanel}>
              <header className={styles.directionsHeader}>
                <div>
                  <span className={styles.label}>Turn-by-turn</span>
                  <h2 className={styles.directionsTitle}>Route directions</h2>
                </div>
                <span className={styles.directionsCount}>
                  {formatStepCount(routeLegs)}
                </span>
              </header>
              <div className={styles.legDirections}>
                {routeLegs.map((leg, legIndex) => (
                  <section
                    key={`${leg.from}-${leg.to}-${legIndex}`}
                    className={styles.routeLeg}
                  >
                    <div className={styles.legHead}>
                      <h3>
                        {leg.from} → {leg.to}
                      </h3>
                      <span>
                        {formatMiles(leg.distance_miles)} ·{" "}
                        {formatDurationHours(leg.duration_hours)}
                      </span>
                    </div>
                    {(leg.steps ?? []).length > 0 ? (
                      <ol className={styles.stepList}>
                        {leg.steps.map((step, stepIndex) => (
                          <li
                            key={`${stepIndex}-${step.instruction}`}
                            className={styles.stepItem}
                          >
                            <span className={styles.stepIndex}>
                              {stepIndex + 1}
                            </span>
                            <div className={styles.stepBody}>
                              <p className={styles.stepInstruction}>
                                {step.instruction}
                              </p>
                              <span className={styles.stepMeta}>
                                {formatMeters(step.distance_meters)} ·{" "}
                                {formatDurationSeconds(step.duration_seconds)}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className={styles.noDirections}>
                        No turn-by-turn directions were returned for this leg.
                      </p>
                    )}
                  </section>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "logs" ? (
          <div className={styles.logsStack}>
            {dailyLogs.map((log, idx) => (
              <LogSheet
                key={log.date}
                log={log}
                dayNumber={idx + 1}
                homeTerminalTimezone={homeTerminalTimezone}
                simulationNow={simulationNow}
              />
            ))}
          </div>
        ) : null}

        {tab === "stops" ? (
          <Card padded={false}>
            <table className={styles.stopsTable}>
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Location</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(trip.stops ?? []).map((s, i) => (
                  <tr key={i}>
                    <td>
                      <Badge tone={STOP_TONE[s.kind] ?? "neutral"} dot>
                        {STOP_LABELS[s.kind] ?? s.kind}
                      </Badge>
                    </td>
                    <td className="mono tabular">
                      {formatTime(s.start, homeTerminalTimezone)}
                    </td>
                    <td className="mono tabular">
                      {formatTime(s.end, homeTerminalTimezone)}
                    </td>
                    <td>{s.label}</td>
                    <td className={styles.note}>{s.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function routeLabel({ current_location, pickup_location, dropoff_location } = {}) {
  const c = current_location || "—";
  const d = dropoff_location || "—";
  return pickup_location ? `${c} → ${pickup_location} → ${d}` : `${c} → ${d}`;
}

function formatLong(iso, timeZone) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      timeZone,
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatLongWithTime(iso, timeZone) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso, timeZone) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatStepCount(legs) {
  const count = legs.reduce((total, leg) => total + (leg.steps?.length ?? 0), 0);
  if (count === 1) return "1 step";
  return `${count.toLocaleString()} steps`;
}

function formatMiles(value) {
  const miles = Number(value);
  if (!Number.isFinite(miles)) return "0 mi";
  return `${miles.toLocaleString(undefined, {
    maximumFractionDigits: miles < 10 ? 1 : 0,
  })} mi`;
}

function formatMeters(value) {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters <= 0) return "0 mi";
  const miles = meters / 1609.344;
  if (miles < 0.1) {
    return `${Math.round(miles * 5280).toLocaleString()} ft`;
  }
  return formatMiles(miles);
}

function formatDurationHours(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return "0 min";
  return formatMinutes(Math.round(hours * 60));
}

function formatDurationSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  return formatMinutes(Math.max(1, Math.round(seconds / 60)));
}

function formatMinutes(totalMinutes) {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function formatEndDate(logs) {
  if (!logs || logs.length === 0) return "—";
  const last = logs[logs.length - 1].date;
  try {
    return new Date(`${last}T23:59:00`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return last;
  }
}

function MissingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M11 7v4M11 14v.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 5V2h8v3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="2" y="5" width="12" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 11v3h8v-3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
