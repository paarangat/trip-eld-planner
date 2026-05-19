import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell/AppShell.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";

const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard.jsx"));
const NewTrip = lazy(() => import("./pages/NewTrip/NewTrip.jsx"));
const TripHistory = lazy(() => import("./pages/TripHistory/TripHistory.jsx"));
const TripDetail = lazy(() => import("./pages/TripDetail/TripDetail.jsx"));
const DailyLogs = lazy(() => import("./pages/DailyLogs/DailyLogs.jsx"));
const Compliance = lazy(() => import("./pages/Compliance/Compliance.jsx"));
const Settings = lazy(() => import("./pages/Settings/Settings.jsx"));
const NotFound = lazy(() => import("./pages/NotFound/NotFound.jsx"));

function lazyPage(element) {
  return (
    <Suspense fallback={<PageFallback />}>
      {element}
    </Suspense>
  );
}

function PageFallback() {
  return <div aria-busy="true" aria-label="Loading page" />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={lazyPage(<Dashboard />)} />
          <Route path="new" element={lazyPage(<NewTrip />)} />
          <Route path="trips" element={lazyPage(<TripHistory />)} />
          <Route path="trips/:id" element={lazyPage(<TripDetail />)} />
          <Route path="logs" element={lazyPage(<DailyLogs />)} />
          <Route path="compliance" element={lazyPage(<Compliance />)} />
          <Route path="settings" element={lazyPage(<Settings />)} />
          <Route path="*" element={lazyPage(<NotFound />)} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
