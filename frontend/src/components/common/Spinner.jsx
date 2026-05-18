export default function Spinner({ label = "Loading…" }) {
  return <div className="spinner" aria-live="polite">{label}</div>;
}
