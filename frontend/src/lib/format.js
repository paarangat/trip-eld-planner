const DEFAULT_TIMEZONE = "America/Chicago";

export function routeLabel(inputs = {}) {
  const current = inputs.current_location || "-";
  const pickup = inputs.pickup_location;
  const dropoff = inputs.dropoff_location || "-";
  return pickup ? `${current} → ${pickup} → ${dropoff}` : `${current} → ${dropoff}`;
}

export function formatHM(minutes, { padHours = true } = {}) {
  if (minutes == null) return "-";
  const value = Math.max(0, Math.round(minutes));
  const hours = Math.floor(value / 60);
  const remainder = value % 60;
  const hourText = padHours ? String(hours).padStart(2, "0") : String(hours);
  return `${hourText}:${String(remainder).padStart(2, "0")}`;
}

export function formatMiles(value, { unit = true, decimalsUnderTen = true } = {}) {
  const miles = Number(value);
  if (!Number.isFinite(miles)) return unit ? "0 mi" : "0";
  const text = miles.toLocaleString(undefined, {
    maximumFractionDigits: decimalsUnderTen && miles < 10 ? 1 : 0,
  });
  return unit ? `${text} mi` : text;
}

export function formatShortDate(iso, timeZone) {
  if (!iso) return "-";
  try {
    return new Date(iso)
      .toLocaleDateString("en-US", {
        timeZone,
        month: "short",
        day: "numeric",
        year: "2-digit",
      })
      .replace(/(\d+),? (\d+)$/, (_match, day, year) => `${day} '${year}`);
  } catch {
    return iso;
  }
}

export function formatLogDate(iso) {
  if (!iso) return "";
  try {
    return new Date(`${iso.slice(0, 10)}T12:00:00`)
      .toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "2-digit",
      })
      .replace(/(\d+),? (\d+)$/, (_match, day, year) => `${day} '${year}`);
  } catch {
    return iso;
  }
}

export function formatClock(date, timeZone = DEFAULT_TIMEZONE) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

export function formatDateTimeShort(value, timeZone = DEFAULT_TIMEZONE) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString(undefined, {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

export function shortTimeZone(timeZone = DEFAULT_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

export function todayIso(timeZone = DEFAULT_TIMEZONE) {
  return isoDateInZone(Date.now(), timeZone);
}

export function isoDateInZone(ms, timeZone = DEFAULT_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function minuteOfDayInZone(ms, timeZone = DEFAULT_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(ms));
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Number(byType.hour) * 60 + Number(byType.minute);
  } catch {
    const date = new Date(ms);
    return date.getHours() * 60 + date.getMinutes();
  }
}

export function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
