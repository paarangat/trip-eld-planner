import assert from "node:assert/strict";
import test from "node:test";

import { TRIP_STATUS, tripStatus } from "./tripStatus.js";

test("tripStatus uses daily_log_dates from list endpoint summaries", () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  assert.equal(
    tripStatus({
      daily_log_dates: [tomorrow],
      home_terminal_timezone: "UTC",
    }),
    TRIP_STATUS.UPCOMING,
  );
});

test("tripStatus treats missing logs as failed", () => {
  assert.equal(tripStatus({ daily_log_dates: [] }), TRIP_STATUS.FAILED);
});

test("tripStatus lets manual override win", () => {
  assert.equal(
    tripStatus({ daily_log_dates: [] }, TRIP_STATUS.COMPLIANT),
    TRIP_STATUS.COMPLIANT,
  );
});
