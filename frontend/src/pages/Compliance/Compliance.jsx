import { useEffect } from "react";

import Card from "../../components/Card/Card.jsx";
import ComplianceGauge from "../../components/ComplianceGauge/ComplianceGauge.jsx";
import PageHeader from "../../components/PageHeader/PageHeader.jsx";
import PlayBar from "../../components/PlayBar/PlayBar.jsx";
import {
  useSimulatedActivity,
  useSimulatedClocks,
  useSimulation,
} from "../../contexts/SimulationContext.jsx";
import { useActiveTrip } from "../../hooks/useActiveTrip.js";
import { useCycleHours } from "../../hooks/useCycleHours.js";
import { useSettings } from "../../hooks/useSettings.js";
import { useTripStatusOverrides } from "../../hooks/useTripStatusOverrides.js";
import { HOS_LIMITS } from "../../lib/hosLimits.js";
import { TRIP_STATUS, tripStatus } from "../../lib/tripStatus.js";
import styles from "./Compliance.module.css";

const RULES = [
  {
    icon: "drive",
    title: "11-hour drive limit",
    body: "You can drive up to 11 hours per day before a 10-hour rest is required.",
  },
  {
    icon: "window",
    title: "14-hour duty window",
    body: "Your driving day is a 14-hour window. It does NOT pause for breaks.",
  },
  {
    icon: "break",
    title: "30-minute break",
    body: "Take a 30-minute break after 8 cumulative hours of driving.",
  },
  {
    icon: "rest",
    title: "10 hours off-duty",
    body: "Get 10 consecutive hours off before your next driving day.",
  },
  {
    icon: "cycle",
    title: "70-hour / 8-day cycle",
    body: "Limited to 70 hours of on-duty work in any rolling 8-day window.",
  },
  {
    icon: "restart",
    title: "34-hour restart",
    body: "34 consecutive hours off-duty resets your weekly cycle.",
  },
  {
    icon: "fuel",
    title: "Fuel every 1,000 miles",
    body: "The planner schedules fueling at least every 1,000 miles driven.",
  },
  {
    icon: "pickup",
    title: "Pickup & drop-off = 1 hr",
    body: "Pickup and drop-off each count as 1 hour of on-duty (not driving) work.",
  },
];

export default function Compliance() {
  const { settings } = useSettings();
  const cycleHours = useCycleHours(settings);
  const { trip, todayLog } = useActiveTrip(settings.timezone);
  const { overrides: statusOverrides } = useTripStatusOverrides();
  const timeZone = settings.timezone ?? "America/Chicago";

  const status = trip
    ? tripStatus(trip, statusOverrides[trip.id] ?? null)
    : null;
  const isInProgress = status === TRIP_STATUS.IN_PROGRESS;
  const isUpcoming = status === TRIP_STATUS.UPCOMING;

  // Sync the active (or upcoming) trip into the global simulator so the
  // gauges, the activity badge, and the embedded PlayBar all read from one
  // source - and so scrubbing on this page persists across navigation.
  const {
    loadTrip: loadIntoSimulator,
    hasTrip: simulatorHasTrip,
  } = useSimulation();
  const simulatedClocks = useSimulatedClocks();
  const activity = useSimulatedActivity();
  useEffect(() => {
    if (trip && (isInProgress || isUpcoming)) {
      loadIntoSimulator(trip);
    }
  }, [trip, isInProgress, isUpcoming, loadIntoSimulator]);

  const useSimulated =
    (isInProgress || isUpcoming) && simulatorHasTrip && simulatedClocks;
  const backendClocks = (isInProgress ? todayLog : null)?.hos_clocks ?? {};
  const fallbackCycleLeft = Math.max(0, HOS_LIMITS.CYCLE - (cycleHours ?? 0) * 60);
  const clocks = useSimulated
    ? {
        driveLeft: simulatedClocks.drive_left_minutes,
        windowLeft: simulatedClocks.window_left_minutes,
        breakLeft: simulatedClocks.break_left_minutes,
        cycleLeft: simulatedClocks.cycle_left_minutes,
      }
    : {
        driveLeft: backendClocks.drive_left_minutes ?? null,
        windowLeft: backendClocks.window_left_minutes ?? null,
        breakLeft: backendClocks.break_left_minutes ?? null,
        cycleLeft: backendClocks.cycle_left_minutes ?? fallbackCycleLeft,
      };

  const compliantNow = isCompliant(clocks);
  // When simulating, derive cycle-used from the live cycle-left so the banner
  // matches the gauge. Otherwise show the stored driver-state value.
  const cycleUsedHr = useSimulated
    ? ((HOS_LIMITS.CYCLE - clocks.cycleLeft) / 60).toFixed(1)
    : (cycleHours ?? 0).toFixed(1);

  return (
    <>
      <PageHeader
        title="Compliance"
        description="The rules the engine enforces, in plain language. Reference: 49 CFR §395 (property-carrying)."
      />

      <section className={styles.section}>
        <h2 className={styles.eyebrow}>The rules</h2>
        <div className={styles.rulesGrid}>
          {RULES.map((rule) => (
            <Card key={rule.title} className={styles.rule}>
              <span className={styles.ruleIcon} aria-hidden>
                <RuleIcon kind={rule.icon} />
              </span>
              <div className={styles.ruleText}>
                <h3 className={styles.ruleTitle}>{rule.title}</h3>
                <p className={styles.ruleBody}>{rule.body}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.nowHead}>
          <h2 className={styles.eyebrow}>
            {useSimulated && !isInProgress ? "At the simulated moment" : "Right now"}
          </h2>
          {useSimulated && activity ? (
            <span
              className={styles.nowActivity}
              data-tone={activity.tone}
              title={activity.note || activity.label}
            >
              {activity.label}
            </span>
          ) : null}
        </div>
        {simulatorHasTrip ? (
          <div className={styles.nowSim}>
            <PlayBar timeZone={timeZone} variant="compact" />
          </div>
        ) : null}
        <div className={styles.gauges}>
          <ComplianceGauge
            label="Drive time left"
            remaining={clocks.driveLeft}
            limit={HOS_LIMITS.DRIVE}
            sub="of 11:00 today"
          />
          <ComplianceGauge
            label="On-duty window"
            remaining={clocks.windowLeft}
            limit={HOS_LIMITS.WINDOW}
            sub="of 14:00 today"
          />
          <ComplianceGauge
            label="Time until break"
            remaining={clocks.breakLeft}
            limit={HOS_LIMITS.BREAK}
            sub="until break 08:00"
          />
          <ComplianceGauge
            label="Cycle hours left"
            remaining={clocks.cycleLeft}
            limit={HOS_LIMITS.CYCLE}
            sub="of 70:00 today"
          />
        </div>

        <Card className={styles.banner} data-tone={compliantNow ? "ok" : "warn"}>
          <span className={styles.bannerIcon} aria-hidden>
            {compliantNow ? <CheckIcon /> : <WarnIcon />}
          </span>
          <div>
            <h3 className={styles.bannerTitle}>
              {compliantNow ? "You're compliant." : "Check your clocks."}
            </h3>
            <p className={styles.bannerBody}>
              {compliantNow
                ? `The available trip clocks are within their limits. Cycle usage is ${cycleUsedHr} hr of 70.`
                : `One of your available clocks is below the safety threshold. Cycle usage is ${cycleUsedHr} hr of 70.`}
            </p>
          </div>
        </Card>

        <p className={styles.foot}>
          Reference: U.S. Federal Motor Carrier Safety Administration, 49 CFR §395 -
          property-carrying driver, 70-hour / 8-day cycle.
        </p>
      </section>
    </>
  );
}

function isCompliant(clocks) {
  const lowRatio = (remaining, limit) =>
    remaining != null && limit > 0 && remaining / limit <= 0.2;
  if (lowRatio(clocks.driveLeft, HOS_LIMITS.DRIVE)) return false;
  if (lowRatio(clocks.windowLeft, HOS_LIMITS.WINDOW)) return false;
  if (lowRatio(clocks.breakLeft, HOS_LIMITS.BREAK)) return false;
  if (lowRatio(clocks.cycleLeft, HOS_LIMITS.CYCLE)) return false;
  return true;
}

function RuleIcon({ kind }) {
  const common = {
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
  };
  switch (kind) {
    case "drive":
      return (
        <svg viewBox="0 0 18 18" {...common}>
          <circle cx="9" cy="9" r="6.5" />
          <path d="M9 5v4l3 2" strokeLinecap="round" />
        </svg>
      );
    case "window":
      return (
        <svg viewBox="0 0 18 18" {...common}>
          <rect x="3" y="4" width="12" height="11" rx="1.5" />
          <path d="M3 8h12M6 3v3M12 3v3" strokeLinecap="round" />
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
          <rect x="2" y="9" width="14" height="5" rx="1.5" />
          <path d="M5 9V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "cycle":
      return (
        <svg viewBox="0 0 18 18" {...common}>
          <circle cx="9" cy="9" r="6.5" />
          <path d="M5 9h8M9 5v8" strokeLinecap="round" />
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

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 10l4 4 8-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 2.5 18 16H2L10 2.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 8v4M10 14v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
