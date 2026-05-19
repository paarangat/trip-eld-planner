"""Top-level URL configuration."""

from django.contrib import admin
from django.urls import include, path

from apps.trips.views import geocode_autocomplete, health


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path(
        "api/geocode/autocomplete/",
        geocode_autocomplete,
        name="geocode-autocomplete",
    ),
    path("api/", include("apps.trips.urls")),
]
