import { useEffect, useMemo, useState } from "react";

import Badge from "../../components/Badge/Badge.jsx";
import Button from "../../components/Button/Button.jsx";
import CalendarMonth from "../../components/CalendarMonth/CalendarMonth.jsx";
import Card from "../../components/Card/Card.jsx";
import EmptyState from "../../components/EmptyState/EmptyState.jsx";
import LogSheet from "../../components/LogSheet/LogSheet.jsx";
import Modal from "../../components/Modal/Modal.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import Skeleton from "../../components/Skeleton/Skeleton.jsx";
import { getTrip } from "../../api/tripApi.js";
import { useRecentTrips } from "../../hooks/useRecentTrips.js";
import styles from "./DailyLogs.module.css";

export default function DailyLogs() {
  const { ids } = useRecentTrips();
  const [trips, setTrips] = useState([]);
  const [failedIds, setFailedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openLog, setOpenLog] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const hasTripIds = ids.length > 0;

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  useEffect(() => {
    if (!hasTripIds) {
      return undefined;
    }
    const controller = new AbortController();
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return [];
        setLoading(true);
        return Promise.all(
          ids.map((id) =>
            getTrip(id, { signal: controller.signal }).catch((err) => {
              if (err.name === "AbortError") throw err;
              return { id, __failed: true };
            }),
          ),
        );
      })
      .then((results) => {
        if (controller.signal.aborted) return;
        const loaded = results.filter((r) => !r.__failed);
        const failed = results.filter((r) => r.__failed === true);
        setTrips(loaded);
        setFailedIds(failed.map((f) => f.id));
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [ids, reloadKey, hasTripIds]);

  const logsByDate = useMemo(() => {
    const m = new Map();
    for (const trip of hasTripIds ? trips : []) {
      for (const log of trip.daily_logs ?? []) {
        // Last-write-wins is fine — logs per date should be unique per driver.
        m.set(log.date, {
          ...log,
          home_terminal_timezone:
            log.home_terminal_timezone ??
            trip.home_terminal_timezone ??
            trip.inputs?.home_terminal_timezone,
        });
      }
    }
    return m;
  }, [trips, hasTripIds]);

  const monthLabel = useMemo(
    () =>
      new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [cursor],
  );

  function shift(delta) {
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const effectiveLoading = hasTripIds ? loading : false;
  const effectiveFailedIds = hasTripIds ? failedIds : [];
  const noLogs = !effectiveLoading && logsByDate.size === 0;

  return (
    <>
      <PageHeader
        eyebrow="Logs"
        title="Daily logs"
        description="Every FMCSA daily log generated from your trips."
        actions={
          <span data-print-hide>
            <Button
              variant="secondary"
              size="md"
              onClick={() => window.print()}
              disabled={noLogs}
            >
              Print month
            </Button>
          </span>
        }
      />

      {effectiveFailedIds.length > 0 ? (
        <Card data-print-hide>
          <div className={styles.failBanner}>
            <Badge tone="warn" dot>
              Some trips failed to load
            </Badge>
            <span className={styles.failMessage}>
              {effectiveFailedIds.length} of your recent trips couldn't be loaded — their
              logs are missing from this calendar. Check your connection and
              refresh.
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Retry
            </Button>
          </div>
        </Card>
      ) : null}

      <div className={styles.toolbar} data-print-hide>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => shift(-1)}
          aria-label="Previous month"
        >
          ←
        </button>
        <span className={styles.month}>{monthLabel}</span>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => shift(1)}
          aria-label="Next month"
        >
          →
        </button>
        <span className={styles.todayBtn}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const d = new Date();
              setCursor({ year: d.getFullYear(), month: d.getMonth() });
            }}
          >
            Today
          </Button>
        </span>
      </div>

      {effectiveLoading ? (
        <Card>
          <Skeleton width="100%" height={420} radius={8} />
        </Card>
      ) : noLogs ? (
        <EmptyState
          icon={<CalendarIcon />}
          title="No logs yet"
          body="Plan a trip and the daily logs will appear on this calendar."
        />
      ) : (
        <CalendarMonth
          year={cursor.year}
          month={cursor.month}
          logsByDate={logsByDate}
          today={today}
          onSelect={setOpenLog}
        />
      )}

      <Modal
        open={Boolean(openLog)}
        onClose={() => setOpenLog(null)}
        title={openLog ? formatLong(openLog.date) : ""}
      >
        {openLog ? <LogSheet log={openLog} /> : null}
      </Modal>
    </>
  );
}

function formatLong(iso) {
  if (!iso) return "";
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="4" y="6" width="14" height="13" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 10h14M8 4v4M14 4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
