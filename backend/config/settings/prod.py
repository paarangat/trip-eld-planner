"""Production settings: Postgres via DATABASE_URL, strict hosts/CORS."""

import dj_database_url

from .base import *  # noqa: F401,F403
from .base import env


DEBUG = False

SECRET_KEY = env("DJANGO_SECRET_KEY", required=True)

ALLOWED_HOSTS = [host.strip() for host in env("ALLOWED_HOSTS", "").split(",") if host.strip()]

DATABASES = {
    "default": dj_database_url.config(
        default=env("DATABASE_URL", required=True),
        conn_max_age=600,
        ssl_require=True,
    )
}

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in env("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = int(env("SECURE_HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = (
    env("SECURE_HSTS_INCLUDE_SUBDOMAINS", "true").lower() == "true"
)
SECURE_HSTS_PRELOAD = env("SECURE_HSTS_PRELOAD", "true").lower() == "true"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
