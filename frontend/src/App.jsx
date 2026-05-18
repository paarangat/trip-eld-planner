import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import ErrorBanner from "./components/common/ErrorBanner.jsx";
import Spinner from "./components/common/Spinner.jsx";
import LogSheetList from "./components/LogSheetList/LogSheetList.jsx";
import RouteMap from "./components/RouteMap/RouteMap.jsx";
import TripForm from "./components/TripForm/TripForm.jsx";
import TripSummary from "./components/TripSummary/TripSummary.jsx";
import { useTripPlan } from "./hooks/useTripPlan.js";

import styles from "./App.module.css";

export default function App() {
  const { data, error, loading, planTrip } = useTripPlan();

  return (
    <ErrorBoundary>
      <main className={styles.page}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden />
            <span>Dispatch</span>
            <span className={styles.brandSub}>· trip &amp; eld</span>
          </div>
          <div className={styles.headerMeta}>
            <div>
              <b>70 / 8</b> property-carrying · home-terminal <b>America/Chicago</b>
            </div>
            <div>Computed against FMCSA 49 CFR §395</div>
          </div>
        </header>

        <section className={styles.hero}>
          <div>
            <div className={styles.heroEyebrow}>Trip planner · ELD log generator</div>
            <h1 className={styles.heroTitle}>
              A compliant route
              <br />
              and <span className={styles.heroTitleAccent}>daily logs,</span>
              <br />
              in one request.
            </h1>
          </div>
          <div>
            <p className={styles.heroLead}>
              Enter four trip details. Dispatch returns the routed map plus
              filled-out FMCSA daily log sheets — <b>11&#8209;hour driving</b>,{" "}
              <b>14&#8209;hour window</b>, <b>30&#8209;min break</b>, fuel stops
              every <b>1,000 miles</b>, and the <b>70&#8209;hour cycle</b> all
              honored.
            </p>
            <div className={styles.heroSpecs} style={{ marginTop: "1.25rem" }}>
              <div className={styles.spec}>
                <span className={styles.specLabel}>Cycle</span>
                <span className={styles.specValue}>70 hr / 8 day</span>
              </div>
              <div className={styles.spec}>
                <span className={styles.specLabel}>Pickup · Drop-off</span>
                <span className={styles.specValue}>1 hr each, on-duty</span>
              </div>
              <div className={styles.spec}>
                <span className={styles.specLabel}>Fuel</span>
                <span className={styles.specValue}>every 1,000 mi</span>
              </div>
            </div>
          </div>
        </section>

        <TripForm onSubmit={planTrip} disabled={loading} />

        {loading && <Spinner label="Routing · scheduling · slicing logs" />}
        <ErrorBanner error={error} />

        {data ? (
          <div className={styles.results}>
            <TripSummary trip={data} />
            <RouteMap
              route={data.route}
              stops={data.stops ?? []}
              places={data.route?.places ?? []}
            />
            <LogSheetList logs={data.daily_logs ?? []} />
          </div>
        ) : (
          !loading &&
          !error && (
            <div className={styles.empty}>
              No trip planned yet — submit the form above to compute a route and log sheets.
            </div>
          )
        )}

        <footer className={styles.footer}>
          <span>Django · DRF · OpenRouteService · React · Leaflet</span>
          <span>Pure HOS engine — no math in the browser</span>
        </footer>
      </main>
    </ErrorBoundary>
  );
}
