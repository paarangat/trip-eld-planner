"""Thin HTTP wrapper around the OpenRouteService API.

Knows nothing about trips. Owns auth, timeouts, retries, and ORS error
translation. Implementations land in subsequent commits.
"""


class ORSClientError(Exception):
    """Raised when the ORS upstream fails or returns an unusable response."""
