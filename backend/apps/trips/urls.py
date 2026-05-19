from django.urls import path

from .views import TripCollectionView, TripDetailView


urlpatterns = [
    path("trips/", TripCollectionView.as_view(), name="trip-collection"),
    path("trips/<str:pk>/", TripDetailView.as_view(), name="trip-detail"),
]
