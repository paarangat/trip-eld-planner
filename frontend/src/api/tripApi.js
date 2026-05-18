// Single place that talks to the backend. Components never call fetch directly.

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body?.error?.message ?? response.statusText;
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json();
}

export function createTrip(payload) {
  return request("/api/trips/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getTrip(id) {
  return request(`/api/trips/${id}/`);
}

export function getHealth() {
  return request("/api/health/");
}
