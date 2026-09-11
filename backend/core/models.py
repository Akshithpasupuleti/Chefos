from django.db import models
from django.conf import settings
from chef.models import Chef

# class Chef(models.Model):
#     name = models.CharField(max_length=100)
#     phone = models.CharField(max_length=15)
#     is_active = models.BooleanField(default=True)
#     joined_on = models.DateField(auto_now_add=True)
#     speciality = models.CharField(max_length=200)

#     def __str__(self):
#         return self.name


class Subscription(models.Model):
    MEAL_CHOICES = (
        ('breakfast', 'Breakfast'),
        ('lunch', 'Lunch'),
        ('dinner', 'Dinner'),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscriptions"
    )
    chef = models.ForeignKey(
        Chef,
        on_delete=models.CASCADE,
        related_name="subscriptions",
        null=True,
        blank=True
     
    )
    meal_type = models.JSONField()
    meal_wave = models.JSONField(default=dict, blank=True)
    delivery_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    delivery_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    price = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.username} - {self.meal_type}"


class ChefAssignment(models.Model):
    chef = models.ForeignKey(Chef, on_delete=models.CASCADE)
    subscription = models.OneToOneField(Subscription, on_delete=models.CASCADE)
    assigned_on = models.DateField(auto_now_add=True)

    def __str__(self):
        return f"{self.chef} → {self.subscription}"


class Feedback(models.Model):
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE)
    rating = models.IntegerField()  # 1 to 5
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.rating}★"


class ChefWavePolicy(models.Model):
    chef = models.OneToOneField(
        Chef,
        on_delete=models.CASCADE,
        related_name="wave_policy",
    )
    base_subscription_capacity = models.PositiveSmallIntegerField(default=3)
    max_wave_capacity = models.PositiveSmallIntegerField(default=5)
    allow_ondemand_extra = models.BooleanField(default=True)
    available_waves = models.JSONField(default=dict, blank=True)
    custom_wave_labels = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"{self.chef} wave policy"


class PaymentTransaction(models.Model):
    STATUS_CREATED = "created"
    STATUS_PAID = "paid"
    STATUS_FAILED = "failed"

    STATUS_CHOICES = (
        (STATUS_CREATED, "Created"),
        (STATUS_PAID, "Paid"),
        (STATUS_FAILED, "Failed"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payment_transactions",
    )
    provider = models.CharField(max_length=30, default="razorpay")
    order_id = models.CharField(max_length=120, unique=True)
    receipt = models.CharField(max_length=120, blank=True, default="")
    amount = models.PositiveIntegerField(help_text="Amount in paise")
    currency = models.CharField(max_length=10, default="INR")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_CREATED)
    payment_id = models.CharField(max_length=120, blank=True, default="")
    signature = models.CharField(max_length=255, blank=True, default="")
    subscription_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} {self.provider} {self.order_id} ({self.status})"
