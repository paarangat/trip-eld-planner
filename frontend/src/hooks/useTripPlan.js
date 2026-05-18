// Owns the request lifecycle: loading / error / data. Every screen reads all three.
//
// Aborts any in-flight request on unmount via a ref-held AbortController, and
// guards against double-submits: re-entry while a request is in flight returns
// immediately without firing a duplicate POST.

import { useEffect, useRef, useState } from "react";

import { createTrip } from "../api/tripApi";

export function useTripPlan() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  async function planTrip(payload) {
    if (loading) return undefined;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await createTrip(payload, { signal: controller.signal });
      if (controller.signal.aborted) return undefined;
      setData(result);
      return result;
    } catch (err) {
      if (err.name === "AbortError") return undefined;
      setError(err);
      throw err;
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }

  return { data, error, loading, planTrip };
}
