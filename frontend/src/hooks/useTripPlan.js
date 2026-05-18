// Owns the request lifecycle: loading / error / data. Every screen reads all three.

import { useState } from "react";

import { createTrip } from "../api/tripApi";

export function useTripPlan() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function planTrip(payload) {
    setLoading(true);
    setError(null);
    try {
      const result = await createTrip(payload);
      setData(result);
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return { data, error, loading, planTrip };
}
