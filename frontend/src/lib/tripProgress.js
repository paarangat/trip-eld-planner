// Derive an "in progress" snapshot for a trip - what the Dashboard needs to
// show next to the active trip map. The backend has no notion of "current
// position"; we project wall-clock now onto the trip's serialized timeline.
//
// All math is best-effort: it assumes the driver is on schedule. Anything
// that's null means "we don't have enough data" - callers should render "-".

const STOP_LABELS = {
  start: "Start",
  pickup: "Pickup",
  dropoff: "Drop-off",
  fuel: "Fuel",
  break: "30-min break",
  rest: "10-hr rest",
  restart: "34-hr restart",
};

function safeParse(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function flattenSegments(trip) {
  const out = [];
  for (const log of trip?.daily_logs ?? []) {
    for (const seg of log.segments ?? []) {
      out.push(seg);
    }
  }
  return out;
}

function fmtClock(date, timeZone) {
  if (!date) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || undefined,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

export function tripProgress(trip, { now = new Date() } = {}) {
  const empty = {
    percent: null,
    milesDone: null,
    totalMiles: null,
    driveMinutesSoFar: null,
    nearLabel: null,
    nextStop: null,
    etaNextStop: null,
  };
  if (!trip) return empty;

  const tz = trip.home_terminal_timezone ?? trip.inputs?.home_terminal_timezone;
  const segments = flattenSegments(trip);
  if (segments.length === 0) return empty;

  const tripStart =
    safeParse(trip.inputs?.start_datetime) ?? safeParse(segments[0].start);
  const tripEnd = safeParse(segments[segments.length - 1].end);
  if (!tripStart || !tripEnd) return empty;

  const totalMiles = trip.summary?.total_miles ?? sumMiles(segments);

  if (now <= tripStart) {
    return {
      ...empty,
      percent: 0,
      milesDone: 0,
      totalMiles,
      driveMinutesSoFar: 0,
      nearLabel: segments[0].location ?? null,
      nextStop: findFirstNamedStop(segments, "pickup"),
      etaNextStop: fmtClock(safeParse(segments[0].end), tz),
    };
  }
  if (now >= tripEnd) {
    return {
      ...empty,
      percent: 100,
      milesDone: totalMiles,
      totalMiles,
      driveMinutesSoFar: Math.round((trip.summary?.total_drive_hours ?? 0) * 60),
      nearLabel: segments[segments.length - 1].location ?? null,
      nextStop: null,
      etaNextStop: null,
    };
  }

  const totalElapsed = (tripEnd - tripStart) / 60000;
  const elapsed = (now - tripStart) / 60000;
  const percent = Math.max(
    0,
    Math.min(100, Math.round((elapsed / totalElapsed) * 100)),
  );

  let milesDone = 0;
  let driveMinutesSoFar = 0;
  let nearLabel = segments[0].location ?? null;
  for (const seg of segments) {
    const start = safeParse(seg.start);
    const end = safeParse(seg.end);
    if (!start || !end) continue;
    if (end <= now) {
      milesDone += seg.miles ?? 0;
      if (seg.status === "driving") {
        driveMinutesSoFar += Math.max(0, Math.round((end - start) / 60000));
      }
      nearLabel = seg.location ?? nearLabel;
      continue;
    }
    if (start <= now && now < end) {
      const segMinutes = Math.max(1, (end - start) / 60000);
      const partial = Math.max(0, (now - start) / 60000);
      const ratio = Math.min(1, partial / segMinutes);
      milesDone += (seg.miles ?? 0) * ratio;
      if (seg.status === "driving") {
        driveMinutesSoFar += Math.round(partial);
      }
      nearLabel = seg.location ?? nearLabel;
      break;
    }
    break;
  }

  const upcomingStop = (trip.stops ?? []).find((s) => {
    const start = safeParse(s.start);
    return start && start > now;
  });

  return {
    percent,
    milesDone: Math.round(milesDone),
    totalMiles: Math.round(totalMiles),
    driveMinutesSoFar,
    nearLabel,
    nextStop: upcomingStop
      ? {
          kind: upcomingStop.kind,
          kindLabel: STOP_LABELS[upcomingStop.kind] ?? upcomingStop.kind,
          label: upcomingStop.label,
          lat: upcomingStop.lat,
          lng: upcomingStop.lng,
          start: upcomingStop.start,
        }
      : null,
    etaNextStop: fmtClock(safeParse(upcomingStop?.start), tz),
  };
}

function sumMiles(segments) {
  let total = 0;
  for (const s of segments) total += s.miles ?? 0;
  return total;
}

function findFirstNamedStop(segments, kind) {
  for (const s of segments) {
    if (s.stop_kind === kind) {
      return {
        kind,
        kindLabel: STOP_LABELS[kind] ?? kind,
        label: s.location ?? "",
        start: s.start,
      };
    }
  }
  return null;
}

export function formatHM(minutes) {
  if (minutes == null) return "-";
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatDecimalHours(minutes) {
  if (minutes == null) return "-";
  return (Math.max(0, minutes) / 60).toFixed(1);
}
