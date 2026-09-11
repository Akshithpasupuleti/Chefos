from django.contrib import admin
from .models import  Subscription, ChefAssignment, Feedback, PaymentTransaction
from chef.models import Chef, InstantChefOffer, InstantChefRequest, InstantOrderHistory, ServiceOtpSession, UserChef
from django.contrib.auth import get_user_model
from menu.models import UserPreference,WeeklyMenu
User = get_user_model()

@admin.register(Chef)
class ChefAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "speciality", "rating", "is_available", "latitude", "longitude")
    list_filter = ("is_available", "speciality")
    search_fields = ("name", "speciality")


@admin.register(UserChef)
class UserChefAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "chef", "assigned_at")
    search_fields = ("user__username", "chef__name")


@admin.register(InstantChefRequest)
class InstantChefRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "status", "meal", "wave", "accepted_chef", "created_at")
    list_filter = ("status", "meal", "wave")
    search_fields = ("user__username", "accepted_chef__name")


@admin.register(InstantChefOffer)
class InstantChefOfferAdmin(admin.ModelAdmin):
    list_display = ("id", "request", "chef", "rank", "status", "distance_km", "expires_at")
    list_filter = ("status",)
    search_fields = ("request__user__username", "chef__name")


@admin.register(ServiceOtpSession)
class ServiceOtpSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "mode", "status", "chef", "user", "subscription", "instant_request", "service_date", "meal", "updated_at")
    list_filter = ("mode", "status", "meal")
    search_fields = ("user__username", "chef__name")


@admin.register(InstantOrderHistory)
class InstantOrderHistoryAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "chef", "instant_request", "rating", "service_completed_at", "created_at")
    list_filter = ("rating",)
    search_fields = ("user__username", "chef__name")


admin.site.register(Subscription)
admin.site.register(ChefAssignment)
admin.site.register(User)
admin.site.register(Feedback)
admin.site.register(UserPreference)
admin.site.register(WeeklyMenu)
admin.site.register(PaymentTransaction)
