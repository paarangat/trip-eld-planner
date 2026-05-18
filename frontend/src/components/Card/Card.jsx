import styles from "./Card.module.css";

export default function Card({
  as: Tag = "section",
  padded = true,
  interactive = false,
  className = "",
  children,
  ...rest
}) {
  const classes = [
    styles.card,
    padded ? styles.padded : "",
    interactive ? styles.interactive : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
