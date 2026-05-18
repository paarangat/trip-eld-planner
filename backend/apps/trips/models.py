"""Trip persistence model.

Stores the four user inputs and the computed result JSON so that
``GET /api/trips/{id}/`` can serve shareable result links without re-calling ORS.
"""

from __future__ import annotations

import secrets

from django.db import models


def _generate_short_id() -> str:
    return secrets.token_urlsafe(6)


class Trip(models.Model):
    id = models.CharField(primary_key=True, max_length=16, default=_generate_short_id, editable=False)
    current_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    current_cycle_hours = models.DecimalField(max_digits=5, decimal_places=2)
    result = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
