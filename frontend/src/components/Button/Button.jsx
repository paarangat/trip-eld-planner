import styles from "./Button.module.css";

export default function Button({
  as: Tag = "button",
  variant = "primary",
  size = "md",
  type,
  fullWidth = false,
  leadingIcon = null,
  trailingIcon = null,
  children,
  className = "",
  ...rest
}) {
  const classes = [
    styles.btn,
    styles[`v_${variant}`],
    styles[`s_${size}`],
    fullWidth ? styles.full : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const isButton = Tag === "button";
  const buttonProps = isButton ? { type: type ?? "button" } : {};

  return (
    <Tag className={classes} {...buttonProps} {...rest}>
      {leadingIcon ? <span className={styles.icon}>{leadingIcon}</span> : null}
      <span className={styles.label}>{children}</span>
      {trailingIcon ? <span className={styles.icon}>{trailingIcon}</span> : null}
    </Tag>
  );
}
