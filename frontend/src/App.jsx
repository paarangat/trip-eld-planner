import { Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell/AppShell.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import Dashboard from "./pages/Dashboard/Dashboard.jsx";
import NewTrip from "./pages/NewTrip/NewTrip.jsx";
import TripHistory from "./pages/TripHistory/TripHistory.jsx";
import TripDetail from "./pages/TripDetail/TripDetail.jsx";
import DailyLogs from "./pages/DailyLogs/DailyLogs.jsx";
import Compliance from "./pages/Compliance/Compliance.jsx";
import Settings from "./pages/Settings/Settings.jsx";
import NotFound from "./pages/NotFound/NotFound.jsx";

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="new" element={<NewTrip />} />
          <Route path="trips" element={<TripHistory />} />
          <Route path="trips/:id" element={<TripDetail />} />
          <Route path="logs" element={<DailyLogs />} />
          <Route path="compliance" element={<Compliance />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
