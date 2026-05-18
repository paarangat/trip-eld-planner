// Derive a coarse status for a planned trip — used by the Dashboard and the
// Trip History filter. The backend has no concept of "in progress" vs
// "compliant"; we compute it from the daily logs and current wall-clock date
// in the trip's home-terminal timezone.
//
//   in_progress — today falls inside the trip's date range.
//   compliant   — the last log date is in the past (trip finished cleanly).
//   failed      — fetch failed, daily logs are empty, or the result is incomplete.

const STATUSES = {
  IN_PROGRESS: "in_progress",
  COMPLIANT: "compliant",
  FAILED: "failed",
};

const STATUS_LABEL = {
  in_progress: "In progress",
  compliant: "Compliant",
  failed: "Failed",
};

function todayIsoInTimezone(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

export function tripStatus(trip) {
  if (!trip || trip.__failed) return STATUSES.FAILED;
  const logs = trip.daily_logs ?? [];
  if (logs.length === 0) return STATUSES.FAILED;

  const tz = trip.home_terminal_timezone ?? trip.inputs?.home_terminal_timezone;
  const today = todayIsoInTimezone(tz);
  const firstDate = logs[0].date;
  const lastDate = logs[logs.length - 1].date;

  if (today < firstDate) return STATUSES.IN_PROGRESS;
  if (today <= lastDate) return STATUSES.IN_PROGRESS;
  return STATUSES.COMPLIANT;
}

export function tripStatusLabel(status) {
  return STATUS_LABEL[status] ?? status;
}

export const TRIP_STATUS = STATUSES;
