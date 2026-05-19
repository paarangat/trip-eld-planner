"""DRF serializers - all input validation lives here."""

from rest_framework import serializers

from .models import Trip


class TripCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = (
            "current_location",
            "pickup_location",
            "dropoff_location",
            "current_cycle_hours",
        )

    def validate_current_cycle_hours(self, value):
        if value < 0 or value > 70:
            raise serializers.ValidationError(
                "current_cycle_hours must be between 0 and 70."
            )
        return value

    def validate(self, attrs):
        for field in ("current_location", "pickup_location", "dropoff_location"):
            attrs[field] = attrs[field].strip()
            if not attrs[field]:
                raise serializers.ValidationError(
                    {field: "This field is required and cannot be blank."}
                )
        return attrs
