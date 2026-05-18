# CLAUDE.md

Engineering guide for the **Trip Planner & ELD Log Generator**. This document
defines how the code in this repository must be written: clean, well-organized,
production-ready, and correct against Hours-of-Service (HOS) rules. Read it
before writing or reviewing code.

See `ARCHITECTURE.md` for the system design. This file covers *how to build it well*.

---

## 1. Project Context

A full-stack app (Django + React) that takes four trip inputs — current location,
pickup, drop-off, current cycle hours — and outputs a map route with required
stops plus filled-out driver daily log sheets, all compliant with U.S. Federal
HOS regulations for a property-carrying 70-hour/8-day driver.

**Fixed assumptions:** 70/8 cycle, no adverse conditions, fuel every 1,000 miles,
1 hour each for pickup and drop-off.

The app is graded on **accuracy** (the HOS math must be right) and **UI/UX**
(clean, polished design). Both matter — write code that supports both.

**The code will be reviewed by CODEX.** Write every change so it stands up to an
automated code review: clear naming, no dead code, consistent structure, type
hints, docstrings on non-trivial logic, and the conventions and pitfall checks in
this document followed throughout. Treat this file as the standard CODEX will be
read against.

---

## 2. Tech Stack & Versions

- **Backend:** Python 3.11+, Django 5.x, Django REST Framework, `openrouteservice`
  Python client, PostgreSQL (prod) / SQLite (dev).
- **Frontend:** React 18+, Vite, `react-leaflet` + Leaflet.
- Pin every dependency in `requirements.txt` and `package.json`. No floating
  versions.

---

## 3. Repository Organization

**The code must be organized well.** A reviewer should be able to find anything
in seconds. Follow the layout in `ARCHITECTURE.md` exactly.

Rules:

- **Separate by responsibility, not by file type.** Keep routing code, HOS code,
  and ELD code in their own packages — not one giant `utils.py`.
- **The HOS engine (`apps/hos/`) has no Django and no I/O imports.** It is pure
  Python: data in, data out. If you are tempted to `import` Django or call a
  network in there, the boundary is wrong.
- **One job per module.** `client.py` only talks HTTP to ORS. `service.py` only
  assembles routes. `engine.py` only schedules. `builder.py` only slices days.
- **Frontend components are small and single-purpose.** One component, one
  folder, with its own styles. No 500-line components.
- **All backend calls on the frontend go through `src/api/`.** Components never
  call `fetch` directly.
- **No dead code, no commented-out blocks, no `console.log` / `print` left in.**

---

## 4. Clean Code Principles

- **Name things for what they mean.** `cumulative_driving_minutes`, not `t` or
  `x`. `remaining_window`, not `r`.
- **No magic numbers.** Every HOS threshold is a named constant in
  `apps/hos/constants.py` (`MAX_DRIVING_MINUTES = 11 * 60`, etc.). A literal
  `11` or `1000` buried in logic is a bug waiting to happen.
- **Small, pure functions.** Prefer functions that take inputs and return outputs
  with no side effects — especially in the HOS engine. They are easy to test and
  easy to trust.
- **Use dataclasses / typed structures**, not loose dicts, for domain objects
  (`DutySegment`, `DailyLog`, `RouteLeg`). A typo in a dict key fails silently;
  a typo in a dataclass field fails loudly.
- **Type hints on every function signature.** Docstrings on every non-trivial
  function — especially the HOS engine, where the *why* matters.
- **Fail fast and loud.** Validate inputs at the boundary; raise clear errors.
  Never let bad data flow silently into the scheduler.
- **DRY, but not prematurely.** Extract a helper when logic repeats a third time,
  not the first.
- **Keep functions short.** If a function does not fit on one screen, it is doing
  too much.

---

## 5. Backend Conventions

- **Validation lives in DRF serializers**, not in views. Views orchestrate;
  serializers validate.
- **Settings are split** (`base` / `dev` / `prod`). No environment branching with
  `if DEBUG` scattered through the code.
- **Secrets come from environment variables only.** The ORS key, database URL,
  and Django secret key are never in source. Commit a `.env.example` with empty
  placeholder values.
- **Wrap external calls.** ORS access goes through `routing/client.py` with an
  explicit timeout and a retry. If ORS fails, raise a typed exception the API
  layer can turn into a clean `502`.
- **Structured logging**, not `print`. Log the start/end of a trip computation
  and any upstream failure.
- **Migrations are committed** and kept in sync with models.

---

## 6. Frontend Conventions

- **React renders; it does not compute.** No HOS math, no day-splitting in the
  browser. Display backend output as-is.
- **Every async call has three states: loading, error, success.** The
  `useTripPlan` hook owns them; every screen handles all three. Never show a
  blank screen while waiting.
- **Wrap the app in an error boundary** so a render error shows a message instead
  of a white page.
- **The API base URL comes from an env var** (`VITE_API_BASE_URL`), never
  hard-coded.
- **Keep styling consistent.** Use a small set of shared design tokens (colors,
  spacing, fonts). Polished, consistent UI is graded.
- **Components are presentational and reusable.** Pass data via props; lift
  shared state to the nearest common parent or the hook.

---

## 7. The HOS Engine — Correctness Rules

The engine must obey these exactly. Most assessment failures are HOS logic
errors, not bugs in the plumbing.

- **11-hour limit is driving time only.** Breaks and on-duty-not-driving do not
  count against it.
- **14-hour window is wall-clock, and it does NOT pause.** Breaks, fuel stops,
  and the 30-minute break all burn the 14-hour window. Only a qualifying
  10-hour rest (or sleeper-berth pairing) resets it.
- **The 30-minute break triggers after 8 *cumulative* driving hours**, not 8
  consecutive. Track cumulative driving since the last qualifying break.
- **A 10-hour off-duty period resets the 11-hour and 14-hour clocks** — but it
  does **not** reset the 70-hour cycle. Only a 34-hour restart resets the cycle.
- **The 70-hour cycle starts partially used.** The driver's `current_cycle_hours`
  input is the starting value — the engine must begin counting from there, not
  from zero.
- **Pickup and drop-off are 1 hour each, logged on-duty (not driving).** They
  consume the 14-hour window and the 70-hour cycle, but not the 11-hour limit.
- **Fuel stops occur at least every 1,000 miles**, logged on-duty (not driving).
  Place them by cumulative route distance, not by guess.
- **When the 70-hour cycle is exhausted mid-trip**, insert a 34-hour restart and
  continue. Do not silently exceed the cycle.
- **Define which constant to apply when limits tie.** When two limits would be
  hit at the same moment, the order of insertion must be deterministic and
  documented in `engine.py`.

Encode each of these as its own small, separately tested function where possible.

---

## 8. Common Pitfalls

These are the mistakes most likely to break this specific app. Avoid them
deliberately.

### 8.1 Geocoding & routing

- **Coordinate order.** OpenRouteService expects **`longitude, latitude`** —
  the reverse of the `lat, lng` order most maps and humans use. Swapping these
  is the single most common ORS bug; routes will land in the wrong ocean. Wrap
  coordinate handling in a typed structure so the order cannot be mistaken.
- **Geocoding ambiguity.** "Springfield" matches many places. Use the
  highest-confidence ORS result and surface the resolved address back to the
  user so they can see what was chosen. Handle the **zero-results** case.
- **Rate limits.** The ORS free tier is generous but finite. Cache geocoding
  results and do not re-geocode the same string within a request.
- **Trust but verify ORS duration.** ORS returns a driving duration; use it, but
  know it is a car estimate. Keep the average-speed assumption in a named
  constant so it is easy to adjust if routes look unrealistic for a truck.

### 8.2 HOS scheduling logic

- **Forgetting the 14-hour window does not pause.** A driver who takes a long
  break still loses that wall-clock time from the 14-hour window. Do not "freeze
  the clock" during breaks.
- **Confusing cumulative vs consecutive driving** for the 30-minute break. It is
  cumulative.
- **Resetting the 70-hour cycle on a 10-hour rest.** A 10-hour rest does *not*
  reset the cycle — only a 34-hour restart does.
- **Starting the cycle at zero.** The driver arrives with `current_cycle_hours`
  already used. Begin from that value.
- **Off-by-one on stacked limits.** When the 11-hour, 14-hour, and 8-hour-break
  thresholds land close together, insert events in a fixed, documented order.
- **Floating-point hour drift.** Do not accumulate hours as floats and expect
  clean sums. Work in **integer minutes** internally, convert to hours only for
  display. `0.1 + 0.2 != 0.3` will corrupt the "totals must equal 24" check.

### 8.3 Dates, times & time zones

- **Use home-terminal time for all logs.** FMCSA log sheets are kept in the home
  terminal's time zone even when the driver crosses zones. Pick one zone, use it
  everywhere, and document it.
- **Use timezone-aware datetimes** end to end. Mixing naive and aware datetimes
  raises errors or silently shifts times.
- **Midnight-crossing splits.** A drive or rest from 22:00 to 06:00 spans two
  calendar days and must appear on **two** log sheets — clipped at midnight on
  each. Failing to split is the most common ELD rendering bug.
- **Each log sheet is exactly 24 hours.** The four duty-status totals must sum to
  exactly `24:00`. Assert this in the ELD builder before returning.

### 8.4 ELD log rendering

- **Grid alignment.** The 24-hour grid has 96 fifteen-minute cells. Compute
  segment x-positions from minutes, not from eyeballed pixels, or the step line
  will drift from the gridlines.
- **The step line must be continuous.** When duty status changes, draw the
  vertical connector between rows — the line is one unbroken path across the day.
- **Remarks must record location at every duty-status change**, per the FMCSA
  format. Do not omit them.
- **Multiple sheets for long trips.** Render one `LogSheet` per day; do not try
  to cram a multi-day trip onto one grid.

### 8.5 API & integration

- **CORS.** The Vercel frontend and the backend are on different origins.
  Configure `CORS_ALLOWED_ORIGINS` explicitly — a missing origin produces a
  silent browser failure that looks like a backend bug.
- **Never expose the ORS key client-side.** All ORS calls are server-side. If the
  key appears in any frontend bundle or network request, it is wrong.
- **Handle upstream failure.** If ORS times out or errors, return a clean `502`
  with a readable message — do not let a 500 stack trace reach the user.
- **Validate inputs server-side even if the frontend validates.** Client
  validation is UX; server validation is correctness.

### 8.6 React & frontend

- **Leaflet map lifecycle.** A Leaflet map initialized in a hidden or
  zero-size container renders gray tiles. Call `invalidateSize()` after the
  container becomes visible/sized, and give the map container an explicit height.
- **Do not recreate the map on every render.** Let `react-leaflet` manage the
  map instance; update layers via props/state, not by re-mounting.
- **No secrets or absolute backend URLs hard-coded.** Use env vars.
- **Handle the empty and error states** of the result, not just the happy path.

---

## 9. Production-Readiness Checklist

Before considering a feature done:

- [ ] Inputs validated on both client and server.
- [ ] Loading and error states implemented in the UI.
- [ ] External (ORS) failures handled gracefully with a clear message.
- [ ] No secrets in source; `.env.example` committed, real `.env` git-ignored.
- [ ] Settings split into dev/prod; `DEBUG=False` in production.
- [ ] CORS configured for the deployed frontend origin.
- [ ] Dependencies pinned in `requirements.txt` / `package.json`.
- [ ] `/api/health/` endpoint responding.
- [ ] Structured logging on trip computation and upstream errors.
- [ ] HOS engine unit tests passing, including edge cases.
- [ ] `README.md` explains setup, env vars, and how to run locally.
- [ ] No `print` / `console.log` / dead code left behind.

---

## 10. Testing Strategy

- **HOS engine: test heavily.** It is pure functions — write table-driven unit
  tests. Cover: a short same-day trip; a trip needing one 10-hour rest; a trip
  long enough to need a 34-hour restart; a driver starting with high
  `current_cycle_hours`; a fuel stop placement; a drive crossing midnight.
- **ELD builder: assert totals = 24** for every generated day, and verify
  midnight-crossing segments split correctly.
- **Routing service: mock ORS** — do not hit the real API in tests.
- **API layer: test** validation rejections and the happy-path response shape.
- **Frontend: smoke-test** the form-submit-to-render flow and the three async
  states.

---

## 11. Security

- ORS key, Django secret key, and database URL come from environment variables
  only.
- `DEBUG=False` and a correct `ALLOWED_HOSTS` in production.
- The ORS key is used server-side exclusively.
- Validate and sanitize all user input at the API boundary.
- Do not log secrets or full request payloads containing them.

---

## 12. Git & Commits

- Small, focused commits with clear messages (e.g. `hos: enforce 30-min break
  after 8 cumulative driving hours`).
- Never commit `.env`, `node_modules/`, `__pycache__/`, the SQLite db, or build
  output. Keep `.gitignore` current.
- Keep the main branch in a working, deployable state.
- **Do not add a `Co-Authored-By: Claude` line (or any AI co-author trailer) to
  commit messages.** Commit messages contain the change description only — no
  co-authorship attribution.
- **Code is reviewed by CODEX.** Keep commits small and self-contained so the
  review is easy to follow, and make sure each change already satisfies sections
  3–11 before it lands — do not rely on review to catch organization, naming, or
  pitfall issues.

---

## 13. Common Commands

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
python manage.py test

# Frontend
cd frontend
npm install
npm run dev
npm run build
```

---

## 14. Definition of Done

A change is done when: it follows the organization in `ARCHITECTURE.md`, obeys
the HOS correctness rules in section 7, avoids the pitfalls in section 8, has
tests where section 10 calls for them, passes the section 9 checklist, and leaves
the app deployable.