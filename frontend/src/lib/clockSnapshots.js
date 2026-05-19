// Pure lookup over the backend-computed `clock_snapshots[]` payload. The
// backend already encodes resets as two snapshots at the same timestamp, so
// linear interpolation between adjacent snapshots gives the right values
// at any moment — no HOS math runs in the browser. CLAUDE.md §6.

export function parseSnapshots(rawSnapshots) {
  if (!Array.isArray(rawSnapshots) || rawSnapshots.length === 0) return [];
  return rawSnapshots.map((snap) => ({
    at: new Date(snap.at).getTime(),
    drive_left_minutes: snap.drive_left_minutes,
    window_left_minutes: snap.window_left_minutes,
    break_left_minutes: snap.break_left_minutes,
    cycle_left_minutes: snap.cycle_left_minutes,
  }));
}

export function clampToRange(snapshots, time) {
  if (!snapshots.length) return null;
  const t = typeof time === "number" ? time : new Date(time).getTime();
  if (t <= snapshots[0].at) return snapshots[0].at;
  if (t >= snapshots[snapshots.length - 1].at) {
    return snapshots[snapshots.length - 1].at;
  }
  return t;
}

// Return interpolated clocks at `time` (ms epoch or Date). For same-timestamp
// snapshot pairs (reset boundaries), the *later* snapshot wins — that's what
// makes a reset appear as a step instead of a smear.
export function clocksAt(snapshots, time) {
  if (!snapshots.length) return null;
  const t = typeof time === "number" ? time : new Date(time).getTime();

  if (t <= snapshots[0].at) return snapshotValues(snapshots[0]);
  const last = snapshots[snapshots.length - 1];
  if (t >= last.at) return snapshotValues(last);

  // Binary search for the largest i with snapshots[i].at <= t.
  let lo = 0;
  let hi = snapshots.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (snapshots[mid].at <= t) lo = mid;
    else hi = mid;
  }
  // Advance through any same-timestamp duplicates so we land on the latest
  // snapshot at or before `t` (post-reset values).
  while (lo + 1 < snapshots.length && snapshots[lo + 1].at <= t) {
    lo += 1;
  }

  const a = snapshots[lo];
  const b = snapshots[lo + 1] ?? a;
  if (b.at <= a.at) return snapshotValues(a);

  const frac = (t - a.at) / (b.at - a.at);
  return {
    drive_left_minutes: lerp(a.drive_left_minutes, b.drive_left_minutes, frac),
    window_left_minutes: lerp(a.window_left_minutes, b.window_left_minutes, frac),
    break_left_minutes: lerp(a.break_left_minutes, b.break_left_minutes, frac),
    cycle_left_minutes: lerp(a.cycle_left_minutes, b.cycle_left_minutes, frac),
  };
}

function snapshotValues(snap) {
  return {
    drive_left_minutes: snap.drive_left_minutes,
    window_left_minutes: snap.window_left_minutes,
    break_left_minutes: snap.break_left_minutes,
    cycle_left_minutes: snap.cycle_left_minutes,
  };
}

function lerp(a, b, frac) {
  return Math.round(a + (b - a) * frac);
}
