// Derive a coarse status for a planned trip - used by the Dashboard and the
// Trip History filter. The backend has no concept of "in progress" vs
// "compliant"; we compute it from the daily logs and current wall-clock date
// in the trip's home-terminal timezone.
//
//   in_progress - today falls inside the trip's date range.
//   upcoming    - the first log date is still in the future.
//   compliant   - the last log date is in the past (trip finished cleanly).
//   failed      - fetch failed, daily logs are empty, or the result is incomplete.
//
// A driver may also pin a status manually (e.g. mark a planned trip as
// "in progress" before the start date). When an override is present it wins;
// passing ``null`` falls back to the derived value.

const STATUSES = {
  UPCOMING: "upcoming",
  IN_PROGRESS: "in_progress",
  COMPLIANT: "compliant",
  FAILED: "failed",
};

const STATUS_LABEL = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  compliant: "Compliant",
  failed: "Failed",
};

export const MANUAL_STATUS_OPTIONS = [
  { value: STATUSES.UPCOMING, label: "Upcoming" },
  { value: STATUSES.IN_PROGRESS, label: "In progress" },
  { value: STATUSES.COMPLIANT, label: "Compliant" },
  { value: STATUSES.FAILED, label: "Failed" },
];

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

function derivedTripStatus(trip) {
  if (!trip || trip.__failed) return STATUSES.FAILED;
  const dates =
    Array.isArray(trip.daily_log_dates) && trip.daily_log_dates.length > 0
      ? trip.daily_log_dates
      : (trip.daily_logs ?? []).map((log) => log.date).filter(Boolean);
  if (dates.length === 0) return STATUSES.FAILED;

  const tz = trip.home_terminal_timezone ?? trip.inputs?.home_terminal_timezone;
  const today = todayIsoInTimezone(tz);
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  if (today < firstDate) return STATUSES.UPCOMING;
  if (today <= lastDate) return STATUSES.IN_PROGRESS;
  return STATUSES.COMPLIANT;
}

export function tripStatus(trip, override = null) {
  if (override && Object.values(STATUSES).includes(override)) {
    return override;
  }
  return derivedTripStatus(trip);
}

export function tripStatusLabel(status) {
  return STATUS_LABEL[status] ?? status;
}

export const TRIP_STATUS = STATUSES;
