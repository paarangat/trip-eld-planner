import Card from "../../components/Card/Card.jsx";
import HOSClock from "../../components/HOSClock/HOSClock.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import { useActiveTrip } from "../../hooks/useActiveTrip.js";
import { useCycleHours } from "../../hooks/useCycleHours.js";
import { useSettings } from "../../hooks/useSettings.js";
import { HOS_LIMITS } from "../../lib/hosLimits.js";
import styles from "./Compliance.module.css";

const RULES = [
  {
    icon: "drive",
    title: "11 hours of driving per day",
    body: "After 11 hours of driving in a workday, you must stop driving until you complete a 10-hour off-duty period.",
  },
  {
    icon: "window",
    title: "14-hour on-duty window",
    body: "Once you start driving, you have a 14-hour wall-clock window to finish. Breaks do NOT pause this clock — only a 10-hour off-duty period resets it.",
  },
  {
    icon: "break",
    title: "30-minute break after 8 cumulative hours",
    body: "You must take a 30-minute off-duty (or sleeper) break before driving any more after 8 cumulative hours of driving since your last 30+ minute break.",
  },
  {
    icon: "rest",
    title: "10-hour rest before the next driving day",
    body: "A qualifying 10-hour off-duty period resets the 11-hour and 14-hour clocks. It does NOT reset the 70-hour cycle.",
  },
  {
    icon: "cycle",
    title: "70 hours of on-duty time in 8 days",
    body: "You can't drive after accumulating 70 on-duty hours in any rolling 8-day window. Both driving and on-duty-not-driving count.",
  },
  {
    icon: "restart",
    title: "34-hour restart resets the cycle",
    body: "A continuous 34-hour off-duty period resets your 70-hour cycle to zero.",
  },
  {
    icon: "fuel",
    title: "Fuel every 1,000 miles",
    body: "Plan a fuel stop at least every 1,000 miles. Fuel time is on-duty (not driving) — it consumes the 14-hour window and the 70-hour cycle, but not the 11-hour driving limit.",
  },
  {
    icon: "pickup",
    title: "1 hour each for pickup and drop-off",
    body: "Pickup and drop-off are logged as on-duty (not driving) — 1 hour each, by convention.",
  },
];

export default function Compliance() {
  const { settings } = useSettings();
  const cycleHours = useCycleHours(settings);
  const { isActive, todayLog } = useActiveTrip(settings.timezone);

  // Backend supplies the four remaining-time clocks on the active log. When
  // there is no active trip, the three log-dependent clocks render idle and
  // the cycle clock falls back to the driver's starting state from settings.
  const activeLog = isActive ? todayLog : null;
  const backendClocks = activeLog?.hos_clocks ?? {};
  const fallbackCycleLeft = Math.max(0, HOS_LIMITS.CYCLE - (cycleHours ?? 0) * 60);
  const clocks = {
    driveLeft: backendClocks.drive_left_minutes ?? null,
    windowLeft: backendClocks.window_left_minutes ?? null,
    breakLeft: backendClocks.break_left_minutes ?? null,
    cycleLeft: backendClocks.cycle_left_minutes ?? fallbackCycleLeft,
  };

  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Compliance"
        description="The Hours-of-Service rules this app enforces, in plain language."
      />

      <section className={styles.right}>
        <h2 className={styles.h2}>Right now</h2>
        <p className={styles.sub}>
          Your live status against each of the four big clocks.
        </p>
        <div className={styles.clockRow}>
          <HOSClock
            label="Drive time"
            remaining={clocks.driveLeft}
            limit={HOS_LIMITS.DRIVE}
            sub="of 11:00"
            size="md"
          />
          <HOSClock
            label="14-hr window"
            remaining={clocks.windowLeft}
            limit={HOS_LIMITS.WINDOW}
            sub="of 14:00"
            size="md"
          />
          <HOSClock
            label="Until 30-min break"
            remaining={clocks.breakLeft}
            limit={HOS_LIMITS.BREAK}
            sub="after 8 hr"
            size="md"
          />
          <HOSClock
            label="70-hr cycle"
            remaining={clocks.cycleLeft}
            limit={HOS_LIMITS.CYCLE}
            sub="of 70:00"
            size="md"
          />
        </div>
      </section>

      <section className={styles.rules}>
        <h2 className={styles.h2}>The rules</h2>
        <div className={styles.grid}>
          {RULES.map((rule) => (
            <Card key={rule.title} className={styles.rule}>
              <span className={styles.ruleIcon} aria-hidden>
                <RuleIcon kind={rule.icon} />
              </span>
              <h3 className={styles.ruleTitle}>{rule.title}</h3>
              <p className={styles.ruleBody}>{rule.body}</p>
            </Card>
          ))}
        </div>
        <p className={styles.foot}>
          Reference: U.S. Federal Motor Carrier Safety Administration, 49 CFR §395 —
          property-carrying driver, 70-hour / 8-day cycle.
        </p>
      </section>
    </>
  );
}

function RuleIcon({ kind }) {
  const common = { width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.6 };
  switch (kind) {
    case "drive":
      return (
        <svg viewBox="0 0 18 18" {...common}>
          <rect x="2" y="6" width="11" height="6" rx="1" />
          <rect x="13" y="8" width="3" height="4" rx="0.5" />
          <circle cx="5" cy="13" r="1.2" />
          <circle cx="13" cy="13" r="1.2" />
        </svg>
      );
    case "window":
      return (
        <svg viewBox="0 0 18 18" {...common}>
          <circle cx="9" cy="9" r="6.5" />
          <path d="M9 5v4l3 2" strokeLinecap="round" />
        </svg>
      );
    case "break":
      return (
        <svg viewBox="0 0 18 18" {...common}>
          <path d="M3 8h9v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
          <path d="M12 9h2a2 2 0 0 1 0 4h-2" />
          <path d="M5 5v-2M8 5v-2" strokeLinecap="round" />
        </svg>
      );
    case "rest":
      return (
        <svg viewBox="0 0 18 18" {...common}>
          <path d="M14 10a5 5 0 1 1-6.5-6.5A5.5 5.5 0 0 0 14 10z" />
        </svg>
      );
    case "cycle":
      return (
        <svg viewBox="0 0 18 18" {...common}>
          <rect x="3" y="4" width="12" height="11" rx="1.5" />
          <path d="M3 8h12M6 3v3M12 3v3" strokeLinecap="round" />
        </svg>
      );
    case "restart":
      return (
        <svg viewBox="0 0 18 18" {...common}>
          <path d="M14 5.5A6 6 0 1 0 15 9.5" strokeLinecap="round" />
          <path d="M14 2v4h-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "fuel":
      return (
        <svg viewBox="0 0 18 18" {...common}>
          <rect x="3" y="3" width="7" height="12" rx="1" />
          <path d="M10 8h2a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1" strokeLinecap="round" />
          <path d="M14 4v4" strokeLinecap="round" />
        </svg>
      );
    case "pickup":
      return (
        <svg viewBox="0 0 18 18" {...common}>
          <path d="m3 5 6-2 6 2v8l-6 2-6-2z" strokeLinejoin="round" />
          <path d="M3 5l6 2 6-2M9 7v8" />
        </svg>
      );
    default:
      return null;
  }
}
