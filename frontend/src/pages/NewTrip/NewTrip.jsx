import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Badge from "../../components/Badge/Badge.jsx";
import Button from "../../components/Button/Button.jsx";
import Card from "../../components/Card/Card.jsx";
import ErrorBanner from "../../components/common/ErrorBanner.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import Slider from "../../components/Slider/Slider.jsx";
import TextField from "../../components/TextField/TextField.jsx";
import { useToast } from "../../components/Toast/Toast.jsx";
import { useLocationHistory } from "../../hooks/useLocationHistory.js";
import { useRecentTrips } from "../../hooks/useRecentTrips.js";
import { useSettings } from "../../hooks/useSettings.js";
import { useTripPlan } from "../../hooks/useTripPlan.js";
import styles from "./NewTrip.module.css";

const MAX_CYCLE = 70;
const TICKS = [0, 35, 60, 70];

export default function NewTrip() {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, update } = useSettings();
  const { items: history, remember } = useLocationHistory();
  const { remember: rememberTripId } = useRecentTrips();
  const { planTrip, loading, error } = useTripPlan();
  const toast = useToast();

  const presets = location.state?.replay ?? null;

  const [form, setForm] = useState(() => ({
    current_location: presets?.current_location ?? "",
    pickup_location: presets?.pickup_location ?? "",
    dropoff_location: presets?.dropoff_location ?? "",
    current_cycle_hours: Number(
      presets?.current_cycle_hours ?? settings.currentCycleHours ?? 0,
    ),
  }));

  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const cycleLeft = useMemo(
    () => Math.max(0, MAX_CYCLE - form.current_cycle_hours),
    [form.current_cycle_hours],
  );

  const cycleBlocked = form.current_cycle_hours >= MAX_CYCLE;

  const allFilled =
    form.current_location.trim() &&
    form.pickup_location.trim() &&
    form.dropoff_location.trim();

  const canSubmit = !loading && allFilled && online && !cycleBlocked;

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    const payload = {
      current_location: form.current_location.trim(),
      pickup_location: form.pickup_location.trim(),
      dropoff_location: form.dropoff_location.trim(),
      current_cycle_hours: Number(form.current_cycle_hours) || 0,
    };
    try {
      const result = await planTrip(payload);
      remember(payload.current_location, payload.pickup_location, payload.dropoff_location);
      rememberTripId(result.id);
      update({ currentCycleHours: payload.current_cycle_hours });
      toast.push({
        tone: "success",
        message: `Trip ${result.id} planned — ${Math.round(result.summary?.total_miles ?? 0)} mi, ${result.summary?.days ?? "?"} day(s)`,
      });
      navigate(`/trips/${result.id}`);
    } catch {
      // ErrorBanner shows it; toast as backup
      toast.push({ tone: "danger", message: "Could not plan trip — see error above." });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Plan a trip"
        title="Where are you going?"
        description="Four inputs. Dispatch returns a routed map plus FMCSA daily logs."
      />

      {!online ? (
        <div className={styles.offlineBanner} role="status">
          <Badge tone="warn" dot>Offline</Badge>
          <span>You're offline. Planning needs a network connection.</span>
        </div>
      ) : null}

      <form onSubmit={submit} className={styles.form} noValidate>
        <Card>
          <h2 className={styles.section}>Locations</h2>
          <div className={styles.fields}>
            <TextField
              label="Current location"
              placeholder="e.g. Chicago, IL"
              value={form.current_location}
              onChange={(v) => set("current_location", v)}
              required
              list="loc-history"
              leadingIcon={<PinIcon />}
              disabled={loading}
            />
            <TextField
              label="Pickup"
              placeholder="e.g. Dallas, TX"
              value={form.pickup_location}
              onChange={(v) => set("pickup_location", v)}
              required
              list="loc-history"
              leadingIcon={<BoxIcon />}
              disabled={loading}
            />
            <TextField
              label="Drop-off"
              placeholder="e.g. Denver, CO"
              value={form.dropoff_location}
              onChange={(v) => set("dropoff_location", v)}
              required
              list="loc-history"
              leadingIcon={<FlagIcon />}
              disabled={loading}
            />
          </div>
          <datalist id="loc-history">
            {history.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </Card>

        <Card>
          <h2 className={styles.section}>How much have you driven this week?</h2>
          <p className={styles.helper}>
            Hours already on duty in the last 8 days. The 70-hour cycle starts
            from here.
          </p>

          <Slider
            value={form.current_cycle_hours}
            onChange={(v) => set("current_cycle_hours", v)}
            min={0}
            max={MAX_CYCLE}
            step={0.25}
            ticks={TICKS}
            unit="hr"
            ariaLabel="Current cycle hours used"
            disabled={loading}
          />

          <p className={styles.helperBig}>
            You have{" "}
            <strong className="mono tabular">{cycleLeft.toFixed(2)}</strong>{" "}
            hours of cycle time left before a 34-hour restart.
          </p>

          {cycleBlocked ? (
            <div className={styles.blocker} role="alert">
              <Badge tone="danger" dot>Cycle exhausted</Badge>
              <span>
                Take a 34-hour restart before planning a new trip.
              </span>
            </div>
          ) : null}
        </Card>

        <ErrorBanner error={error} />

        <div className={styles.submitRow}>
          <Button
            type="submit"
            variant="primary"
            size="xl"
            fullWidth
            disabled={!canSubmit}
          >
            {loading ? "Computing route…" : "Plan trip"}
          </Button>
          <p className={styles.note}>
            Routes via OpenRouteService. Logs follow FMCSA 49 CFR §395.
          </p>
        </div>
      </form>
    </>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 14c3-3 4.5-5 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9 5 11 8 14z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="m2.5 4.5 5.5-2 5.5 2v7l-5.5 2-5.5-2v-7z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M2.5 4.5 8 6.5l5.5-2M8 6.5v8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 2v12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M4 3h7l-1.5 2.5L11 8H4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
