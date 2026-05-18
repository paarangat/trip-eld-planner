"""Hours-of-Service thresholds for a property-carrying 70/8 driver.

Every HOS number lives here as a named constant. Never hard-code a literal
``11``, ``14``, ``8``, ``70``, ``34``, or ``1000`` elsewhere in the engine.

All durations are in **integer minutes** to avoid floating-point drift; see
CLAUDE.md §8.2.
"""

MAX_DRIVING_MINUTES = 11 * 60
MAX_ON_DUTY_WINDOW_MINUTES = 14 * 60
CUMULATIVE_DRIVING_BEFORE_BREAK_MINUTES = 8 * 60
REQUIRED_BREAK_MINUTES = 30
REQUIRED_OFF_DUTY_RESET_MINUTES = 10 * 60
CYCLE_LIMIT_MINUTES = 70 * 60
CYCLE_RESTART_MINUTES = 34 * 60

FUEL_INTERVAL_MILES = 1000
PICKUP_ON_DUTY_MINUTES = 60
DROPOFF_ON_DUTY_MINUTES = 60
