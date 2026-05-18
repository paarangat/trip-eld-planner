// Four inputs + submit. Owns its own state; emits the validated payload.

import { useState } from "react";

const INITIAL = {
  current_location: "",
  pickup_location: "",
  dropoff_location: "",
  current_cycle_hours: "",
};

export default function TripForm({ onSubmit, disabled }) {
  const [values, setValues] = useState(INITIAL);

  function update(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit({
      ...values,
      current_cycle_hours: Number(values.current_cycle_hours),
    });
  }

  return (
    <form onSubmit={submit}>
      <label>
        Current location
        <input
          required
          value={values.current_location}
          onChange={(e) => update("current_location", e.target.value)}
        />
      </label>
      <label>
        Pickup location
        <input
          required
          value={values.pickup_location}
          onChange={(e) => update("pickup_location", e.target.value)}
        />
      </label>
      <label>
        Drop-off location
        <input
          required
          value={values.dropoff_location}
          onChange={(e) => update("dropoff_location", e.target.value)}
        />
      </label>
      <label>
        Current cycle hours used
        <input
          required
          type="number"
          min="0"
          max="70"
          step="0.25"
          value={values.current_cycle_hours}
          onChange={(e) => update("current_cycle_hours", e.target.value)}
        />
      </label>
      <button type="submit" disabled={disabled}>
        Plan trip
      </button>
    </form>
  );
}
