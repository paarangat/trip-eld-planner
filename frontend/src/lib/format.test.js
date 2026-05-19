import assert from "node:assert/strict";
import test from "node:test";

import { csvCell, formatHM, routeLabel } from "./format.js";

test("routeLabel includes pickup when present", () => {
  assert.equal(
    routeLabel({
      current_location: "Chicago",
      pickup_location: "Dallas",
      dropoff_location: "Denver",
    }),
    "Chicago → Dallas → Denver",
  );
});

test("routeLabel handles missing pickup", () => {
  assert.equal(
    routeLabel({ current_location: "Chicago", dropoff_location: "Denver" }),
    "Chicago → Denver",
  );
});

test("formatHM clamps and pads minute values", () => {
  assert.equal(formatHM(65), "01:05");
  assert.equal(formatHM(-2), "00:00");
  assert.equal(formatHM(null), "-");
});

test("csvCell escapes commas, quotes, and newlines", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('A "quoted", value'), '"A ""quoted"", value"');
});
