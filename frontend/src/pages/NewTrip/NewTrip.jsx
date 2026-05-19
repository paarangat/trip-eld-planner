import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Badge from "../../components/Badge/Badge.jsx";
import Button from "../../components/Button/Button.jsx";
import Card from "../../components/Card/Card.jsx";
import ErrorBanner from "../../components/common/ErrorBanner.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import Slider from "../../components/Slider/Slider.jsx";
import TextField from "../../components/TextField/TextField.jsx";
import { useToast } from "../../components/Toast/useToast.js";
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
    current_cycle_hours: initialCycleHours(
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

  const cycleHoursResult = useMemo(
    () => parseCycleHours(form.current_cycle_hours),
    [form.current_cycle_hours],
  );
  const cycleHours = cycleHoursResult.ok ? cycleHoursResult.value : 0;
  const cycleLeftMinutes = useMemo(
    () => Math.max(0, (MAX_CYCLE - cycleHours) * 60),
    [cycleHours],
  );

  const cycleInvalid = !cycleHoursResult.ok;
  const allFilled =
    form.current_location.trim() &&
    form.pickup_location.trim() &&
    form.dropoff_location.trim();

  const canSubmit =
    !loading && allFilled && online && !cycleInvalid;

  // Show "continued from prior trip" only while the slider still matches the
  // value that was rolled forward; once the user adjusts it, we get out of
  // the way (and clear the source so it doesn't reappear).
  const carryover =
    !presets &&
    settings.cycleHoursSource &&
    Math.abs(cycleHours - (settings.currentCycleHours ?? 0)) < 0.01
      ? settings.cycleHoursSource
      : null;

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "current_cycle_hours" && settings.cycleHoursSource) {
      update({ cycleHoursSource: null });
    }
  }

  function dismissCarryover() {
    update({ cycleHoursSource: null });
  }

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    const payload = {
      current_location: form.current_location.trim(),
      pickup_location: form.pickup_location.trim(),
      dropoff_location: form.dropoff_location.trim(),
      current_cycle_hours: cycleHoursResult.value,
    };
    try {
      const result = await planTrip(payload);
      remember(payload.current_location, payload.pickup_location, payload.dropoff_location);
      rememberTripId(result.id);
      // Roll the cycle counter forward: next trip should start from where
      // this one *projects* to end, not from what the user just typed in.
      const projectedEnd = Number(result.summary?.projected_end_cycle_hours);
      const nextCycleHours = Number.isFinite(projectedEnd)
        ? clampCycleHours(projectedEnd)
        : payload.current_cycle_hours;
      update({
        currentCycleHours: nextCycleHours,
        cycleHoursSource: Number.isFinite(projectedEnd)
          ? {
              tripId: result.id,
              endDate: result.daily_logs?.[result.daily_logs.length - 1]?.date ?? null,
              priorCycleHours: payload.current_cycle_hours,
            }
          : null,
      });
      toast.push({
        tone: "success",
        message: `Trip ${result.id} planned — ${Math.round(result.summary?.total_miles ?? 0)} mi, ${result.summary?.days ?? "?"} day(s)`,
      });
      navigate(`/trips/${result.id}`);
    } catch {
      toast.push({ tone: "danger", message: "Could not plan trip — see error above." });
    }
  }

  return (
    <>
      <PageHeader
        title="Plan a new trip"
        description="The engine returns a compliant route with fuel and rest stops, plus FMCSA daily log sheets."
      />

      {!online ? (
        <div className={styles.offlineBanner} role="status">
          <Badge tone="warn" dot>Offline</Badge>
          <span>You're offline. Planning needs a network connection.</span>
        </div>
      ) : null}

      <form onSubmit={submit} className={styles.form} noValidate>
        <Card className={styles.formCard}>
          <Step number={1} title="Where are you going?" />

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

          <hr className={styles.divider} />

          <Step number={2} title="How much cycle time is already used?" />

          <div className={styles.sliderBox}>
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
          </div>

          <p className={styles.helperBig}>
            You have{" "}
            <strong className="mono tabular">{formatHM(cycleLeftMinutes)}</strong>{" "}
            of cycle time left before a 34-hr restart.
          </p>

          {carryover ? (
            <div className={styles.carryover} role="status">
              <Badge tone="primary" dot>Carried over</Badge>
              <span>
                Continued from trip <strong>{carryover.tripId}</strong>
                {carryover.endDate ? <> ending <strong>{carryover.endDate}</strong></> : null}
                . Adjust the slider if you've taken time off since.
              </span>
              <button
                type="button"
                className={styles.carryoverDismiss}
                onClick={dismissCarryover}
                aria-label="Dismiss continuation hint"
              >
                ×
              </button>
            </div>
          ) : null}

          {cycleInvalid ? (
            <div className={styles.blocker} role="alert">
              <Badge tone="danger" dot>Invalid hours</Badge>
              <span>Enter cycle hours between 0 and 70 before planning.</span>
            </div>
          ) : null}

          <ErrorBanner error={error} />

          <div className={styles.submitRow}>
            <Button
              type="submit"
              variant="primary"
              size="xl"
              fullWidth
              disabled={!canSubmit}
              trailingIcon={<ArrowRightIcon />}
            >
              {loading ? "Computing route…" : "Plan trip"}
            </Button>
            <p className={styles.note}>
              Routes via OpenRouteService. Logs follow FMCSA 49 CFR §395.
            </p>
          </div>
        </Card>
      </form>
    </>
  );
}

function Step({ number, title }) {
  return (
    <div className={styles.step}>
      <span className={styles.stepNumber} aria-hidden>{number}</span>
      <h2 className={styles.stepTitle}>{title}</h2>
    </div>
  );
}

function initialCycleHours(value) {
  const parsed = parseCycleHours(value);
  return parsed.ok ? parsed.value : 0;
}

function clampCycleHours(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > MAX_CYCLE) return MAX_CYCLE;
  return value;
}

function parseCycleHours(value) {
  if (value === "" || value == null) {
    return { ok: false, value: null };
  }
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0 || hours > MAX_CYCLE) {
    return { ok: false, value: null };
  }
  return { ok: true, value: hours };
}

function formatHM(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
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
      <path d="M4 2v12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M4 3h7l-1.5 2.5L11 8H4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
