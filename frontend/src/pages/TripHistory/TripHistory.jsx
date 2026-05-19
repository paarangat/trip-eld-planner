import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import Badge from "../../components/Badge/Badge.jsx";
import Button from "../../components/Button/Button.jsx";
import Card from "../../components/Card/Card.jsx";
import EmptyState from "../../components/EmptyState/EmptyState.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import SearchInput from "../../components/SearchInput/SearchInput.jsx";
import Skeleton from "../../components/Skeleton/Skeleton.jsx";
import Tabs from "../../components/Tabs/Tabs.jsx";
import { getTrip } from "../../api/tripApi.js";
import { useRecentTrips } from "../../hooks/useRecentTrips.js";
import { TRIP_STATUS, tripStatus, tripStatusLabel } from "../../lib/tripStatus.js";
import styles from "./TripHistory.module.css";

const FILTERS = [
  { value: "all", label: "All" },
  { value: TRIP_STATUS.IN_PROGRESS, label: "In progress" },
  { value: TRIP_STATUS.COMPLIANT, label: "Compliant" },
  { value: TRIP_STATUS.FAILED, label: "Failed" },
];

export default function TripHistory() {
  const { ids, forget, clear } = useRecentTrips();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (ids.length === 0) {
      setTrips([]);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    Promise.all(
      ids.map((id) =>
        getTrip(id, { signal: controller.signal })
          .then((data) => ({ ...data, __failed: false }))
          .catch((err) => {
            if (err.name === "AbortError") throw err;
            return {
              id,
              __failed: true,
              inputs: {},
              summary: { total_miles: 0, days: 0 },
            };
          }),
      ),
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        setTrips(results);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
      });
    return () => {
      controller.abort();
    };
  }, [ids]);

  const withStatus = useMemo(
    () => trips.map((t) => ({ ...t, __status: tripStatus(t) })),
    [trips],
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
        formatShort(t.inputs?.start_datetime),
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

  const total = trips.length;
  const subtitle =
    total === 0
      ? "Plan a trip to populate this list."
      : `${total} trip${total === 1 ? "" : "s"} saved locally · cached from /api/trips/{id}/`;

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
                onClick={() => {
                  if (window.confirm("Clear all trip history from this device?")) clear();
                }}
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

      {loading ? (
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
      ) : trips.length === 0 ? (
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
      ) : filtered.length === 0 ? (
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
      ) : (
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
                <li key={trip.id} role="row">
                  <Link to={`/trips/${trip.id}`} className={styles.row}>
                    <span className={styles.date}>
                      {formatShort(trip.inputs?.start_datetime)}
                    </span>
                    <span className={styles.route}>
                      {trip.__failed
                        ? `Trip ${trip.id} unavailable`
                        : routeLabel(trip.inputs)}
                    </span>
                    <span className={`${styles.num} ${styles.alignRight}`}>
                      {trip.__failed
                        ? "—"
                        : `${Math.round(trip.summary?.total_miles ?? 0).toLocaleString()} mi`}
                    </span>
                    <span className={`${styles.num} ${styles.alignRight}`}>
                      {trip.__failed ? "—" : `${trip.summary?.days ?? 0} d`}
                    </span>
                    <span>
                      <StatusBadge status={trip.__status} />
                    </span>
                    <span className={styles.arrow} aria-hidden>›</span>
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
    </>
  );
}

function StatusBadge({ status }) {
  if (status === TRIP_STATUS.IN_PROGRESS) {
    return <Badge tone="primary" dot>In progress</Badge>;
  }
  if (status === TRIP_STATUS.COMPLIANT) {
    return <Badge tone="success" dot>Compliant</Badge>;
  }
  return <Badge tone="warn" dot>Failed</Badge>;
}

function routeLabel(inputs = {}) {
  const current = inputs.current_location || "—";
  const pickup = inputs.pickup_location;
  const dropoff = inputs.dropoff_location || "—";
  return pickup ? `${current} → ${pickup} → ${dropoff}` : `${current} → ${dropoff}`;
}

function formatShort(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso)
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

function csvCell(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
