"""Development settings: SQLite, permissive CORS, DEBUG on."""

from .base import *  # noqa: F401,F403
from .base import BASE_DIR, env


DEBUG = True

ALLOWED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in env("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
