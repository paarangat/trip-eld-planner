import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./index.css";
import App from "./App.jsx";
import { ToastProvider } from "./components/Toast/Toast.jsx";
import { SimulationProvider } from "./contexts/SimulationContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SimulationProvider>
          <App />
        </SimulationProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
