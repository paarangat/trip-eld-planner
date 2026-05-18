import { useState } from "react";
import { Outlet, useLocation, useMatch } from "react-router-dom";

import Sidebar from "../Sidebar/Sidebar.jsx";
import TopBar from "../TopBar/TopBar.jsx";
import { useSettings } from "../../hooks/useSettings.js";
import { useCycleHours } from "../../hooks/useCycleHours.js";
import styles from "./AppShell.module.css";

const TITLE_MAP = {
  "/": "Dashboard",
  "/new": "New trip",
  "/trips": "Trip history",
  "/logs": "Daily logs",
  "/compliance": "Compliance",
  "/settings": "Settings",
};

export default function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const { settings } = useSettings();
  const cycleHours = useCycleHours(settings);
  const location = useLocation();
  const tripDetailMatch = useMatch("/trips/:id");

  const title = tripDetailMatch
    ? "Trip detail"
    : TITLE_MAP[location.pathname] ?? "Dispatch";

  return (
    <div className={styles.shell}>
      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        driverName={settings.driverName}
        cycleHours={cycleHours}
      />
      <div className={styles.main}>
        <TopBar
          title={title}
          breadcrumb={tripDetailMatch ? "Trip history" : null}
          onMenuClick={() => setNavOpen(true)}
        />
        <main className={styles.content}>
          <div className={styles.container}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
