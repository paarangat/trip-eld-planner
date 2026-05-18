import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import ErrorBanner from "./components/common/ErrorBanner.jsx";
import Spinner from "./components/common/Spinner.jsx";
import LogSheetList from "./components/LogSheetList/LogSheetList.jsx";
import RouteMap from "./components/RouteMap/RouteMap.jsx";
import TripForm from "./components/TripForm/TripForm.jsx";
import { useTripPlan } from "./hooks/useTripPlan.js";
import "./styles/tokens.css";

export default function App() {
  const { data, error, loading, planTrip } = useTripPlan();

  return (
    <ErrorBoundary>
      <main style={{ padding: "1.5rem", maxWidth: "1100px", margin: "0 auto" }}>
        <h1>Trip Planner &amp; ELD Log Generator</h1>
        <TripForm onSubmit={planTrip} disabled={loading} />
        {loading && <Spinner label="Planning trip…" />}
        <ErrorBanner error={error} />
        {data && (
          <>
            <RouteMap route={data.route} stops={data.stops} />
            <LogSheetList logs={data.daily_logs} />
          </>
        )}
      </main>
    </ErrorBoundary>
  );
}
