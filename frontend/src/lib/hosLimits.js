// The four HOS limits, in minutes. Used by the dashboard clock dials to
// compute the ring fill ratio from the backend-supplied "remaining" value.
//
// The values are NOT recomputed on the client — the backend's per-day
// hos_clocks payload provides remaining minutes. These constants exist only
// so the UI knows what "full" means for each dial. See CLAUDE.md §6.

export const HOS_LIMITS = {
  DRIVE: 11 * 60,
  WINDOW: 14 * 60,
  BREAK: 8 * 60,
  CYCLE: 70 * 60,
};
