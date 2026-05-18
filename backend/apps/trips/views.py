"""HTTP layer. Views orchestrate; serializers validate."""

from rest_framework import generics
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Trip
from .serializers import TripCreateSerializer, TripReadSerializer


@api_view(["GET"])
def health(_request):
    return Response({"status": "ok"})


class TripCreateView(generics.CreateAPIView):
    queryset = Trip.objects.all()
    serializer_class = TripCreateSerializer


class TripDetailView(generics.RetrieveAPIView):
    queryset = Trip.objects.all()
    serializer_class = TripReadSerializer
