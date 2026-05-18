import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import Badge from "../../components/Badge/Badge.jsx";
import Button from "../../components/Button/Button.jsx";
import EmptyState from "../../components/EmptyState/EmptyState.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import SearchInput from "../../components/SearchInput/SearchInput.jsx";
import Skeleton from "../../components/Skeleton/Skeleton.jsx";
import TripCard from "../../components/TripCard/TripCard.jsx";
import { getTrip } from "../../api/tripApi.js";
import { useRecentTrips } from "../../hooks/useRecentTrips.js";
import styles from "./TripHistory.module.css";

export default function TripHistory() {
  const { ids, forget, clear } = useRecentTrips();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (ids.length === 0) {
      setTrips([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      ids.map((id) =>
        getTrip(id)
          .then((data) => ({ ...data, __failed: false }))
          .catch(() => ({
            id,
            __failed: true,
            inputs: {},
            summary: { total_miles: 0, days: 0 },
          })),
      ),
    ).then((results) => {
      if (!cancelled) {
        setTrips(results);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const filtered = useMemo(() => {
    if (!query.trim()) return trips;
    const q = query.toLowerCase();
    return trips.filter((t) => {
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
  }, [trips, query]);

  return (
    <>
      <PageHeader
        eyebrow="History"
        title="Trip history"
        description="Every trip you've planned on this device."
        actions={
          ids.length > 0 ? (
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                if (window.confirm("Clear all trip history from this device?")) clear();
              }}
            >
              Clear all
            </Button>
          ) : null
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by location or trip ID"
          />
        </div>
        <span className={styles.count}>
          {loading ? "Loading…" : `${filtered.length} of ${trips.length}`}
        </span>
      </div>

      {loading ? (
        <ul className={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <div className={styles.skel}>
                <Skeleton width={70} height={14} />
                <Skeleton width="40%" height={16} />
                <Skeleton width={60} height={14} />
                <Skeleton width={60} height={14} />
                <Skeleton width={90} height={22} radius={99} />
              </div>
            </li>
          ))}
        </ul>
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
          body={`No trips match "${query}".`}
          action={<Button variant="secondary" onClick={() => setQuery("")}>Clear search</Button>}
        />
      ) : (
        <ul className={styles.list}>
          {filtered.map((trip) => (
            <li key={trip.id} className={styles.item}>
              <TripCard trip={trip} />
              {trip.__failed ? (
                <div className={styles.failRow}>
                  <Badge tone="danger" dot>Failed</Badge>
                  <span className={styles.failText}>
                    Trip {trip.id} could not be loaded.
                  </span>
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
      )}
    </>
  );
}

function RouteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 6h6a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
