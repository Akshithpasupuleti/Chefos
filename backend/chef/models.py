from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import MaxValueValidator, MinValueValidator

User = get_user_model()

class Chef(models.Model):
    name = models.CharField(max_length=100)
    speciality = models.CharField(max_length=100)
    rating = models.FloatField(default=4.5)
    is_available = models.BooleanField(default=True)
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )

    def __str__(self):
        return self.name


class UserChef(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    chef = models.ForeignKey(Chef, on_delete=models.CASCADE)
    assigned_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} → {self.chef}"


class ChefPartnerProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="chef_partner_profile")
    chef = models.OneToOneField(Chef, on_delete=models.CASCADE, related_name="partner_profile")
    phone = models.CharField(max_length=20, blank=True, default="")
    city = models.CharField(max_length=80, blank=True, default="")
    is_verified = models.BooleanField(default=False)
    is_active_partner = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-joined_at"]

    def __str__(self):
        return f"ChefPartner {self.user} -> {self.chef}"


class InstantChefRequest(models.Model):
    STATUS_SEARCHING = "searching"
    STATUS_ACCEPTED = "accepted"
    STATUS_CANCELLED = "cancelled"
    STATUS_NO_CHEF = "no_chef"

    STATUS_CHOICES = (
        (STATUS_SEARCHING, "Searching"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_NO_CHEF, "No Chef Found"),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="instant_chef_requests")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_SEARCHING)
    meal = models.CharField(max_length=20, blank=True, default="")
    wave = models.CharField(max_length=10, blank=True, default="")
    request_latitude = models.DecimalField(max_digits=9, decimal_places=6)
    request_longitude = models.DecimalField(max_digits=9, decimal_places=6)
    radius_km = models.DecimalField(max_digits=5, decimal_places=2, default=5.0)
    notes = models.CharField(max_length=255, blank=True, default="")
    accepted_chef = models.ForeignKey(
        Chef,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="accepted_instant_requests",
    )
    current_offer_expires_at = models.DateTimeField(null=True, blank=True)
    assigned_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status", "-created_at"]),
        ]

    def __str__(self):
        return f"Instant #{self.id} {self.user} ({self.status})"


class InstantChefOffer(models.Model):
    STATUS_QUEUED = "queued"
    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_DECLINED = "declined"
    STATUS_EXPIRED = "expired"
    STATUS_SKIPPED = "skipped"

    STATUS_CHOICES = (
        (STATUS_QUEUED, "Queued"),
        (STATUS_PENDING, "Pending"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_DECLINED, "Declined"),
        (STATUS_EXPIRED, "Expired"),
        (STATUS_SKIPPED, "Skipped"),
    )

    request = models.ForeignKey(InstantChefRequest, on_delete=models.CASCADE, related_name="offers")
    chef = models.ForeignKey(Chef, on_delete=models.CASCADE, related_name="instant_offers")
    rank = models.PositiveIntegerField()
    distance_km = models.FloatField(default=0.0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_QUEUED)
    offered_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["rank", "id"]
        unique_together = ("request", "chef")
        indexes = [
            models.Index(fields=["request", "status", "rank"]),
        ]

    def __str__(self):
        return f"InstantOffer #{self.id} req={self.request_id} chef={self.chef_id} ({self.status})"


class ServiceOtpSession(models.Model):
    MODE_SUBSCRIPTION = "subscription"
    MODE_INSTANT = "instant"
    MODE_CHOICES = (
        (MODE_SUBSCRIPTION, "Subscription"),
        (MODE_INSTANT, "Instant"),
    )

    STATUS_ASSIGNED = "assigned"
    STATUS_START_OTP = "start_otp_generated"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_END_OTP = "end_otp_generated"
    STATUS_COMPLETED = "completed"

    STATUS_CHOICES = (
        (STATUS_ASSIGNED, "Assigned"),
        (STATUS_START_OTP, "Start OTP Generated"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_END_OTP, "End OTP Generated"),
        (STATUS_COMPLETED, "Completed"),
    )

    mode = models.CharField(max_length=20, choices=MODE_CHOICES)
    chef = models.ForeignKey(Chef, on_delete=models.CASCADE, related_name="service_otp_sessions")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="service_otp_sessions")
    subscription = models.ForeignKey(
        "core.Subscription",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="service_otp_sessions",
    )
    instant_request = models.OneToOneField(
        InstantChefRequest,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="service_otp_session",
    )
    service_date = models.DateField(null=True, blank=True)
    meal = models.CharField(max_length=20, blank=True, default="")
    wave = models.CharField(max_length=10, blank=True, default="")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_ASSIGNED)

    start_otp = models.CharField(max_length=6, blank=True, default="")
    start_otp_generated_at = models.DateTimeField(null=True, blank=True)
    journey_started_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)

    end_otp = models.CharField(max_length=6, blank=True, default="")
    end_otp_generated_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["subscription", "service_date", "meal"],
                name="uniq_subscription_service_slot",
                condition=models.Q(subscription__isnull=False),
            ),
        ]
        indexes = [
            models.Index(fields=["user", "status", "-updated_at"]),
            models.Index(fields=["chef", "status", "-updated_at"]),
        ]

    def __str__(self):
        scope = self.mode
        if self.mode == self.MODE_SUBSCRIPTION:
            scope = f"sub:{self.subscription_id}:{self.service_date}:{self.meal}"
        if self.mode == self.MODE_INSTANT:
            scope = f"instant:{self.instant_request_id}"
        return f"ServiceOtp #{self.id} {scope} ({self.status})"


class InstantOrderHistory(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="instant_order_history")
    chef = models.ForeignKey(Chef, on_delete=models.CASCADE, related_name="instant_order_history")
    instant_request = models.OneToOneField(
        InstantChefRequest,
        on_delete=models.CASCADE,
        related_name="history_entry",
    )
    service_session = models.OneToOneField(
        ServiceOtpSession,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="instant_history_entry",
    )
    service_started_at = models.DateTimeField(null=True, blank=True)
    service_completed_at = models.DateTimeField(null=True, blank=True)
    request_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    request_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True, default="")
    rating = models.PositiveSmallIntegerField(null=True, blank=True)
    comment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["chef", "-created_at"]),
        ]

    def __str__(self):
        return f"InstantHistory #{self.id} req={self.instant_request_id} user={self.user_id}"
