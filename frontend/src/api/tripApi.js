// Single place that talks to the backend. Components never call fetch directly.
//
// Each exported call accepts an optional `{ signal }` so callers (hooks, pages)
// can cancel in-flight requests via AbortController. If the request is aborted,
// the native DOMException (`err.name === "AbortError"`) propagates as-is so
// callers can silently swallow it. All other failures - non-2xx responses and
// malformed success bodies - surface as `ApiError` with the HTTP `status`
// attached so callers can tailor recovery (e.g. 404 vs 502).

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request(path, options = {}) {
  const { signal, ...rest } = options;
  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) },
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch((err) => {
      if (err.name === "AbortError") throw err;
      return {};
    });
    const message = body?.error?.message ?? response.statusText;
    throw new ApiError(message || `Request failed: ${response.status}`, {
      status: response.status,
      body,
    });
  }
  try {
    return await response.json();
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Malformed response from server", {
      status: response.status,
      body: {},
    });
  }
}

export function createTrip(payload, { signal } = {}) {
  return request("/api/trips/", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
}

export function getTrip(id, { signal } = {}) {
  return request(`/api/trips/${id}/`, { signal });
}

export function getTrips({ ids = [], includeLogs = false, signal } = {}) {
  const params = new URLSearchParams();
  if (includeLogs) params.set("include", "logs");
  if (ids.length > 0) params.set("ids", ids.join(","));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(`/api/trips/${query}`, { signal });
}

export function fetchLocationSuggestions(query, { signal } = {}) {
  const params = new URLSearchParams({ q: query });
  return request(`/api/geocode/autocomplete/?${params.toString()}`, { signal });
}
