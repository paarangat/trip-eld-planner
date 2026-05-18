// Exposes the driver's current cycle hours from settings as a number.
// Kept as a hook so a future implementation can integrate live trip data.

export function useCycleHours(settings) {
  const raw = settings?.currentCycleHours;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 70) return 70;
  return n;
}
