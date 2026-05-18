// Front-end HOS clock derivations.
//
// IMPORTANT: This file does NOT run the HOS engine. The backend remains the
// source of truth for compliance. These helpers only display the same data
// the backend returned — sliced for the dashboard's four clock widgets.

const DRIVE_LIMIT_MINUTES = 11 * 60;
const WINDOW_LIMIT_MINUTES = 14 * 60;
const BREAK_THRESHOLD_MINUTES = 8 * 60;
const CYCLE_LIMIT_MINUTES = 70 * 60;

/**
 * Given a trip's daily log for "today", compute the four HOS clocks.
 * Returns minutes-remaining for each. null = no data, render as "—".
 *
 * cycleStartHours is the driver's pre-trip cycle hours (settings.currentCycleHours).
 * The trip's on-duty + drive time on previous logs counts against the cycle.
 */
export function computeClocks({ trip, todayLog, cycleStartHours }) {
  if (!trip || !todayLog) {
    return {
      driveLeft: null,
      windowLeft: null,
      breakLeft: null,
      cycleLeft: minutesRemaining(CYCLE_LIMIT_MINUTES, (cycleStartHours ?? 0) * 60),
    };
  }

  const driveUsed = todayLog.totals?.driving_minutes ?? 0;
  const onDutyUsed = todayLog.totals?.on_duty_minutes ?? 0;
  const totalOnDuty = driveUsed + onDutyUsed;

  // 14-hour on-duty window is measured from the start of today's first
  // driving or on-duty segment. We approximate "window used" as the elapsed
  // wall-clock between that start and the end of today's last on-duty
  // segment — the engine has already enforced the constraint, so this is
  // just a visualization.
  const windowUsed = computeWindowUsed(todayLog);

  // 30-min break trigger: 8 cumulative driving hours since last 30+min
  // off-duty / sleeper segment.
  const driveSinceBreak = computeDriveSinceBreak(todayLog);

  // Cycle: starting hours + on-duty time across all log days completed so far
  const cycleUsed =
    (cycleStartHours ?? 0) * 60 + sumOnDutyAndDriveAcrossLogs(trip, todayLog.date);

  return {
    driveLeft: minutesRemaining(DRIVE_LIMIT_MINUTES, driveUsed),
    windowLeft: minutesRemaining(WINDOW_LIMIT_MINUTES, windowUsed),
    breakLeft: minutesRemaining(BREAK_THRESHOLD_MINUTES, driveSinceBreak),
    cycleLeft: minutesRemaining(CYCLE_LIMIT_MINUTES, cycleUsed),
  };

  // unreachable but linted: ensure totalOnDuty referenced
  void totalOnDuty;
}

function minutesRemaining(limit, used) {
  return Math.max(0, limit - used);
}

function computeWindowUsed(log) {
  const segs = log.segments ?? [];
  const onDuty = segs.filter(
    (s) => s.status === "driving" || s.status === "on_duty",
  );
  if (onDuty.length === 0) return 0;
  const start = onDuty[0].start_minute_of_day;
  const lastEnd = onDuty[onDuty.length - 1].end_minute_of_day;
  return Math.max(0, lastEnd - start);
}

function computeDriveSinceBreak(log) {
  const segs = log.segments ?? [];
  let driveSince = 0;
  for (const seg of segs) {
    const minutes = seg.end_minute_of_day - seg.start_minute_of_day;
    const isQualifyingBreak =
      (seg.status === "off_duty" || seg.status === "sleeper_berth") && minutes >= 30;
    if (isQualifyingBreak) {
      driveSince = 0;
      continue;
    }
    if (seg.status === "driving") {
      driveSince += minutes;
    }
  }
  return driveSince;
}

function sumOnDutyAndDriveAcrossLogs(trip, throughDate) {
  let total = 0;
  for (const log of trip.daily_logs ?? []) {
    if (log.date > throughDate) break;
    total += (log.totals?.driving_minutes ?? 0) + (log.totals?.on_duty_minutes ?? 0);
  }
  return total;
}

export const HOS_LIMITS = {
  DRIVE: DRIVE_LIMIT_MINUTES,
  WINDOW: WINDOW_LIMIT_MINUTES,
  BREAK: BREAK_THRESHOLD_MINUTES,
  CYCLE: CYCLE_LIMIT_MINUTES,
};
