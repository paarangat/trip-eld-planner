export const STOP_LABELS = {
  start: "Start",
  pickup: "Pickup",
  dropoff: "Drop-off",
  fuel: "Fuel",
  break: "Break",
  rest: "10-hr rest",
  restart: "34-hr restart",
};

export const STOP_GLYPHS = {
  start: "S",
  pickup: "P",
  dropoff: "D",
  fuel: "F",
  break: "B",
  rest: "R",
  restart: "X",
  current: "*",
};

export const MAP_LEGEND_STOPS = [
  "start",
  "pickup",
  "fuel",
  "break",
  "rest",
  "dropoff",
];

export function stopLabel(kind) {
  return STOP_LABELS[kind] ?? kind ?? "Stop";
}

export function stopTone(kind) {
  switch (kind) {
    case "pickup":
      return "success";
    case "dropoff":
      return "danger";
    case "fuel":
      return "warn";
    case "rest":
    case "restart":
      return "primary";
    default:
      return "neutral";
  }
}

export function stopColor(kind) {
  switch (kind) {
    case "start":
      return "#0f172a";
    case "pickup":
      return "var(--success)";
    case "dropoff":
      return "var(--danger)";
    case "fuel":
      return "var(--warn)";
    case "break":
      return "var(--status-off)";
    case "rest":
      return "var(--status-sleeper)";
    case "restart":
      return "var(--primary)";
    default:
      return "var(--text-muted)";
  }
}
