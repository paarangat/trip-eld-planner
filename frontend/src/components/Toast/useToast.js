import { useContext } from "react";

import { ToastContext } from "./ToastContext.js";

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { push: () => {}, remove: () => {} };
  }
  return ctx;
}
