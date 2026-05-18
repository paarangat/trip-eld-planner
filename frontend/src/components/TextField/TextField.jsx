import { useId } from "react";

import styles from "./TextField.module.css";

export default function TextField({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  helper = "",
  error = "",
  required = false,
  disabled = false,
  leadingIcon = null,
  list = null,
  inputMode,
  autoComplete = "off",
  min,
  max,
  step,
  id: idProp,
  ...rest
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const describedBy = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  return (
    <div className={styles.field}>
      {label ? (
        <label htmlFor={id} className={styles.label}>
          {label}
          {required ? <span aria-hidden className={styles.req}>*</span> : null}
        </label>
      ) : null}
      <div className={`${styles.shell} ${error ? styles.shellError : ""}`}>
        {leadingIcon ? <span className={styles.lead}>{leadingIcon}</span> : null}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value, e)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          list={list ?? undefined}
          inputMode={inputMode}
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error) || undefined}
          min={min}
          max={max}
          step={step}
          className={styles.input}
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className={styles.helper}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}
