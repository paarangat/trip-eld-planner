import { NavLink } from "react-router-dom";

import styles from "./Sidebar.module.css";

const NAV = [
  { to: "/", label: "Dashboard", end: true, icon: HomeIcon },
  { to: "/new", label: "New trip", icon: PlusIcon },
  { to: "/trips", label: "Trip history", icon: ClockIcon },
  { to: "/logs", label: "Daily logs", icon: CalendarIcon },
  { to: "/compliance", label: "Compliance", icon: CheckIcon },
  { to: "/settings", label: "Settings", icon: GearIcon },
];

export default function Sidebar({ open, onClose, driverName, cycleHours }) {
  return (
    <>
      {open ? (
        <div
          className={styles.scrim}
          onClick={onClose}
          role="presentation"
          aria-hidden
        />
      ) : null}
      <aside
        className={`${styles.aside} ${open ? styles.asideOpen : ""}`}
        aria-label="Primary navigation"
      >
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="6" width="11" height="8" rx="1.5" fill="currentColor" />
              <rect x="13" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.6" />
              <circle cx="6" cy="15.5" r="1.5" fill="var(--surface)" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="15" cy="15.5" r="1.5" fill="var(--surface)" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </span>
          <span className={styles.brandName}>Dispatch</span>
        </div>

        <nav className={styles.nav}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.linkActive : ""}`
              }
              onClick={onClose}
            >
              <span className={styles.linkIcon}>
                <item.icon />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.foot}>
          <div className={styles.avatar} aria-hidden>
            {(driverName?.[0] ?? "D").toUpperCase()}
          </div>
          <div className={styles.driver}>
            <span className={styles.driverName}>{driverName || "Driver"}</span>
            <span className={styles.driverSub}>
              <span className="mono tabular">{Number(cycleHours ?? 0).toFixed(1)}</span> / 70 hr cycle
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M3 8l6-5 6 5v6.5A1.5 1.5 0 0 1 13.5 16h-9A1.5 1.5 0 0 1 3 14.5V8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 5v4l2.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="4" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h12M6 3v3M12 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M3 9l4 4 8-8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 1.5V4M9 14v2.5M3 9H.5M17.5 9H15M3.7 3.7l1.8 1.8M12.5 12.5l1.8 1.8M3.7 14.3l1.8-1.8M12.5 5.5l1.8-1.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
