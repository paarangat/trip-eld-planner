// Trip input form. Four numbered fields + a visual cycle-hours meter.
// Emits a validated payload; never validates against HOS rules — that is server work.

import { useMemo, useState } from "react";

import styles from "./TripForm.module.css";

const INITIAL = {
  current_location: "",
  pickup_location: "",
  dropoff_location: "",
  current_cycle_hours: "0",
};

const FIELDS = [
  {
    name: "current_location",
    label: "Current location",
    placeholder: "e.g. Chicago, IL",
    hint: "where the driver starts",
  },
  {
    name: "pickup_location",
    label: "Pickup",
    placeholder: "e.g. Dallas, TX",
    hint: "where the load is picked up",
  },
  {
    name: "dropoff_location",
    label: "Drop-off",
    placeholder: "e.g. Denver, CO",
    hint: "where the load is delivered",
  },
];

const MAX_CYCLE_HOURS = 70;

export default function TripForm({ onSubmit, disabled }) {
  const [values, setValues] = useState(INITIAL);

  const cycleHours = Number(values.current_cycle_hours) || 0;
  const cycleLevel = useMemo(() => {
    if (cycleHours >= 60) return "danger";
    if (cycleHours >= 40) return "warn";
    return "ok";
  }, [cycleHours]);
  const cycleRemaining = Math.max(0, MAX_CYCLE_HOURS - cycleHours);
  const cycleFillPct = Math.min(100, (cycleHours / MAX_CYCLE_HOURS) * 100);

  function update(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit({
      current_location: values.current_location.trim(),
      pickup_location: values.pickup_location.trim(),
      dropoff_location: values.dropoff_location.trim(),
      current_cycle_hours: Number(values.current_cycle_hours),
    });
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.formHead}>
        <h2>Plan a trip</h2>
        <span className="eyebrow">Manifest · 70 / 8 cycle</span>
      </div>

      <div className={styles.fields}>
        {FIELDS.map((field, idx) => (
          <label key={field.name} className={styles.field}>
            <span className={styles.fieldHead}>
              <span className={styles.fieldNum}>
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className={styles.fieldLabel}>{field.label}</span>
              <span className={styles.fieldHint}>{field.hint}</span>
            </span>
            <input
              className={styles.input}
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder={field.placeholder}
              value={values[field.name]}
              onChange={(event) => update(field.name, event.target.value)}
              disabled={disabled}
            />
          </label>
        ))}

        <div className={styles.field}>
          <span className={styles.fieldHead}>
            <span className={styles.fieldNum}>04</span>
            <span className={styles.fieldLabel}>Current cycle hours used</span>
            <span className={styles.fieldHint}>of 70 in last 8 days</span>
          </span>
          <div className={styles.cycleField}>
            <div className={styles.cycleRow}>
              <input
                className={`${styles.input} ${styles.cycleInput} mono tabular`}
                type="number"
                required
                min={0}
                max={MAX_CYCLE_HOURS}
                step={0.25}
                value={values.current_cycle_hours}
                onChange={(event) =>
                  update("current_cycle_hours", event.target.value)
                }
                disabled={disabled}
              />
              <span className={styles.cycleUnit}>hr</span>
              <span className={styles.cycleRemaining}>
                <b className="tabular">{cycleRemaining.toFixed(2)}</b> hr remaining
              </span>
            </div>
            <div className={styles.cycleBar}>
              <div
                className={styles.cycleBarFill}
                data-level={cycleLevel}
                style={{ width: `${cycleFillPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.submit}
          disabled={disabled}
        >
          {disabled ? "Computing route…" : "Plan trip"}
          <span className={styles.submitArrow} aria-hidden>→</span>
        </button>
        <span className={styles.note}>
          Computed server-side · ORS · FMCSA 49 CFR §395
        </span>
      </div>
    </form>
  );
}
