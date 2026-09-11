from rest_framework import serializers
from .models import Chef, ChefPartnerProfile, UserChef

class ChefSerializer(serializers.ModelSerializer):
    distance_km = serializers.SerializerMethodField()

    def get_distance_km(self, obj):
        value = getattr(obj, "distance_km", None)
        if value is None:
            return None
        try:
            return round(float(value), 2)
        except (TypeError, ValueError):
            return None

    class Meta:
        model = Chef
        fields = [
            "id",
            "name",
            "speciality",
            "rating",
            "is_available",
            "latitude",
            "longitude",
            "distance_km",
        ]


class UserChefSerializer(serializers.ModelSerializer):
    chef = ChefSerializer()

    class Meta:
        model = UserChef
        fields = ["chef", "assigned_at"]


class ChefPartnerProfileSerializer(serializers.ModelSerializer):
    chef = ChefSerializer()

    class Meta:
        model = ChefPartnerProfile
        fields = [
            "id",
            "chef",
            "phone",
            "city",
            "is_verified",
            "is_active_partner",
            "joined_at",
        ]
