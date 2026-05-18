import { useId, useMemo } from "react";

import styles from "./Slider.module.css";

export default function Slider({
  value,
  onChange,
  min = 0,
  max = 70,
  step = 0.25,
  ticks = [],
  ariaLabel,
  unit = "",
  disabled = false,
  id: idProp,
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const pct = useMemo(() => {
    const range = max - min || 1;
    return Math.min(100, Math.max(0, ((value - min) / range) * 100));
  }, [value, min, max]);

  const level = useMemo(() => {
    const range = max - min || 1;
    const ratio = (value - min) / range;
    if (ratio >= 0.86) return "danger";
    if (ratio >= 0.57) return "warn";
    return "ok";
  }, [value, min, max]);

  return (
    <div className={styles.wrap} data-level={level}>
      <div className={styles.thumbPill} style={{ left: `${pct}%` }} aria-hidden>
        <span className="mono tabular">{Number(value).toFixed(2).replace(/\.00$/, "")}</span>
        {unit ? <span className={styles.thumbUnit}>{unit}</span> : null}
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
        {ticks.map((t) => {
          const tPct = ((t - min) / (max - min || 1)) * 100;
          return (
            <span
              key={t}
              className={styles.tick}
              style={{ left: `${tPct}%` }}
              aria-hidden
            >
              <span className={styles.tickLabel}>{t}</span>
            </span>
          );
        })}
      </div>
      <input
        id={id}
        type="range"
        className={styles.input}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value), e)}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
