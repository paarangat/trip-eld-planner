import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Badge from "../../components/Badge/Badge.jsx";
import Button from "../../components/Button/Button.jsx";
import Card from "../../components/Card/Card.jsx";
import EmptyState from "../../components/EmptyState/EmptyState.jsx";
import LogSheet from "../../components/LogSheet/LogSheet.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import RouteMap from "../../components/RouteMap/RouteMap.jsx";
import Skeleton from "../../components/Skeleton/Skeleton.jsx";
import StatCard from "../../components/StatCard/StatCard.jsx";
import Tabs from "../../components/Tabs/Tabs.jsx";
import { getTrip } from "../../api/tripApi.js";
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
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTrip(null);
    setTab("overview");
    getTrip(id)
      .then((data) => {
        if (!cancelled) {
          setTrip(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const empty = !loading && !trip;
  const failedResult =
    trip && (!trip.daily_logs || trip.daily_logs.length === 0);

  const inputs = trip?.inputs ?? {};
  const summary = trip?.summary ?? {};
  const dailyLogs = trip?.daily_logs ?? [];
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
    return (
      <>
        <PageHeader title="Trip not found" eyebrow="Trip detail" />
        <EmptyState
          icon={<MissingIcon />}
          title={`Trip ${id} could not be loaded`}
          body={
            error?.message
              ? error.message
              : "We couldn't find this trip on the server. It may have been deleted."
          }
          action={
            <Button as={Link} to="/trips" variant="secondary">
              Back to history
            </Button>
          }
        />
      </>
    );
  }

  if (failedResult) {
    return (
      <>
        <PageHeader
          title={`${inputs.current_location ?? "?"} → ${inputs.dropoff_location ?? "?"}`}
          eyebrow={`Trip · ${trip.id}`}
        />
        <Card>
          <div className={styles.failBanner}>
            <Badge tone="warn" dot>Result unavailable</Badge>
            <span>
              This trip didn't produce a complete result. Try replanning with
              the same inputs.
            </span>
          </div>
          <div className={styles.failActions}>
            <Button
              variant="primary"
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
              Replan trip
            </Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`Trip · ${trip.id}`}
        title={`${inputs.current_location} → ${inputs.pickup_location} → ${inputs.dropoff_location}`}
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
          <Card padded={false}>
            <RouteMap
              route={trip.route}
              stops={trip.stops ?? []}
              places={trip.route?.places ?? []}
            />
          </Card>
        ) : null}

        {tab === "logs" ? (
          <div className={styles.logsStack}>
            {dailyLogs.map((log, idx) => (
              <LogSheet
                key={log.date}
                log={log}
                dayNumber={idx + 1}
                homeTerminalTimezone={homeTerminalTimezone}
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
