import { useState } from "react";

import Button from "../../components/Button/Button.jsx";
import Card from "../../components/Card/Card.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import TextField from "../../components/TextField/TextField.jsx";
import { useToast } from "../../components/Toast/useToast.js";
import { useRecentTrips } from "../../hooks/useRecentTrips.js";
import { useSettings } from "../../hooks/useSettings.js";
import styles from "./Settings.module.css";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Phoenix",
  "Pacific/Honolulu",
];

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match system" },
];

export default function Settings() {
  const { settings, update } = useSettings();
  const { ids, clear } = useRecentTrips();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Stored on this device. Nothing here is sent to the server."
      />

      <div className={styles.form}>
        <Card>
          <h2 className={styles.section}>Driver</h2>
          <div className={styles.fields}>
            <TextField
              label="Driver name"
              placeholder="Your name"
              value={settings.driverName}
              onChange={(v) => update({ driverName: v })}
              helper="Shown in the sidebar."
            />
            <div>
              <label className={styles.fieldLabel} htmlFor="tz">Home-terminal timezone</label>
              <select
                id="tz"
                className={styles.select}
                value={settings.timezone}
                onChange={(e) => update({ timezone: e.target.value })}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className={styles.helper}>
                FMCSA logs are kept in home-terminal time even when you cross zones.
              </p>
            </div>
            <TextField
              label="Default trip start time"
              type="time"
              value={settings.defaultStartTime}
              onChange={(v) => update({ defaultStartTime: v })}
              helper="Used when planning a trip without an explicit start time."
            />
          </div>
        </Card>

        <Card>
          <h2 className={styles.section}>Theme</h2>
          <div className={styles.themeRow}>
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`${styles.themeBtn} ${settings.theme === t.value ? styles.themeBtnActive : ""}`}
                onClick={() => update({ theme: t.value })}
                aria-pressed={settings.theme === t.value}
              >
                <span className={styles.themeSwatch} data-theme={t.value} aria-hidden>
                  <span className={styles.swatchBg} />
                  <span className={styles.swatchBar} />
                </span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className={styles.section}>Local history</h2>
          <p className={styles.helper}>
            {ids.length === 0
              ? "No trips on this device yet."
              : `${ids.length} trip${ids.length === 1 ? "" : "s"} saved locally.`}
          </p>
          {confirming ? (
            <div className={styles.confirmRow}>
              <span>Clear all trip history? This can't be undone.</span>
              <div className={styles.confirmActions}>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    clear();
                    setConfirming(false);
                    toast.push({ tone: "success", message: "Local history cleared" });
                  }}
                >
                  Clear all
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setConfirming(true)}
              disabled={ids.length === 0}
            >
              Clear local history
            </Button>
          )}
        </Card>
      </div>
    </>
  );
}
