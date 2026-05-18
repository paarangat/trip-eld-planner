from django.urls import path

from .views import TripCreateView, TripDetailView


urlpatterns = [
    path("trips/", TripCreateView.as_view(), name="trip-create"),
    path("trips/<str:pk>/", TripDetailView.as_view(), name="trip-detail"),
]
