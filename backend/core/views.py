from datetime import date, timedelta, timezone as dt_timezone
from math import asin, cos, radians, sin, sqrt
import base64
import hashlib
import hmac
import json
import os
from urllib.parse import quote
from urllib import error, request as request_module
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from chef.models import Chef, ServiceOtpSession
from menu.models import UserPreference, WeeklyMenu

from .models import Subscription, Feedback, ChefAssignment, PaymentTransaction
from .ai_menu import generate_menu_with_ai
from .cache_utils import (
    cache_key_active_subscription,
    cache_key_chef_list,
    cache_key_menu_preference,
    cache_key_today_menu,
    cache_key_weekly_menu,
    invalidate_chef_list_cache,
    invalidate_user_api_cache,
)
from .cuisine_search import normalize_cuisine_name, search_cuisines
from .scheduling import (
    MEAL_WAVES,
    enabled_waves_for_meal,
    wave_time_label,
    WAVE_TIME_LABELS,
    evaluate_ondemand_capacity,
    evaluate_subscription_capacity,
    normalize_meal_type,
    normalize_meal_wave,
)
from .serializers import (
    ChefAssignmentSerializer,
    ChefSerializer,
    FeedbackSerializer,
    SubscriptionSerializer,
    UserPreferenceSerializer,
    UserSerializer,
    WeeklyMenuSerializer,
)

User = get_user_model()
API_CACHE_TTL_SHORT = int(getattr(settings, "API_CACHE_TTL_SHORT", 60))
API_CACHE_TTL_MEDIUM = int(getattr(settings, "API_CACHE_TTL_MEDIUM", 300))


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return r * c


def _razorpay_keys():
    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    return key_id, key_secret


def _normalize_plan_cycle(value):
    cycle = str(value or "").strip().lower()
    return "weekly" if cycle == "weekly" else "monthly"


def _effective_people_count(user, requested_people_count=None):
    try:
        requested = int(requested_people_count) if requested_people_count not in (None, "", "null") else None
    except (TypeError, ValueError):
        requested = None
    if requested and requested > 0:
        return requested
    preference = UserPreference.objects.filter(user=user).only("people_count").first()
    if preference and preference.people_count:
        return max(1, int(preference.people_count))
    return 1


def _server_subscription_price(meal_type, plan_cycle, people_count):
    # Temporary pricing override requested by user.
    return 2

    meal_count = len(normalize_meal_type(meal_type))
    meal_count = min(max(meal_count, 1), 3)
    tier = "4-6" if int(people_count) >= 3 else "1-2"

    monthly = {
        "1-2": {1: 5000, 2: 7500, 3: 9500},
        "4-6": {1: 6500, 2: 9500, 3: 13500},
    }
    weekly = {
        "1-2": {1: 1750, 2: 2400, 3: 2800},
        "4-6": {1: 2250, 2: 2800, 3: 3500},
    }
    table = weekly if _normalize_plan_cycle(plan_cycle) == "weekly" else monthly
    return int(table[tier][meal_count])


# -------------------------
# USER
# -------------------------

@api_view(['POST'])
def create_user(request):
    data = request.data
    username = data.get('username', '').strip()
    password = data.get('password', '')
    email = data.get('email', '').strip()

    if not username or not password:
        return Response(
            {"detail": "username and password are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {"detail": "username already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(
        username=username,
        email=email,
        password=password
    )

    return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


# -------------------------
# CHEF
# -------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_chefs(request):
    key = cache_key_chef_list()
    cached = cache.get(key)
    if cached is not None:
        return Response(cached)

    chefs = Chef.objects.filter(is_available=True)
    payload = ChefSerializer(chefs, many=True).data
    cache.set(key, payload, API_CACHE_TTL_MEDIUM)
    return Response(payload)

@api_view(['POST'])
def create_chef(request):
    data = request.data

    latitude = data.get("latitude")
    longitude = data.get("longitude")
    try:
        latitude = float(latitude) if latitude not in (None, "") else None
    except (TypeError, ValueError):
        latitude = None
    try:
        longitude = float(longitude) if longitude not in (None, "") else None
    except (TypeError, ValueError):
        longitude = None

    chef = Chef.objects.create(
        name=data['name'],
        speciality=data['speciality'],
        rating=data['rating'],
        latitude=latitude,
        longitude=longitude,
    )

    invalidate_chef_list_cache()
    return Response(ChefSerializer(chef).data)



@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assign_chef(request):
    serializer = ChefAssignmentSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(user=request.user)
        invalidate_user_api_cache(request.user.id)
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


# -------------------------
# SUBSCRIPTION
# -------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def payment_create_order(request):
    key_id, key_secret = _razorpay_keys()
    if not key_id or not key_secret:
        return Response({"detail": "Payment gateway is not configured"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    receipt = f"chefos_{request.user.id}_{int(timezone.now().timestamp())}"
    subscription_payload = request.data.get("subscription_payload", {})
    if not isinstance(subscription_payload, dict):
        subscription_payload = {}
    meal_type = normalize_meal_type(subscription_payload.get("meal_type"))
    if not meal_type:
        return Response({"detail": "subscription_payload.meal_type is required"}, status=status.HTTP_400_BAD_REQUEST)
    plan_cycle = _normalize_plan_cycle(subscription_payload.get("plan_cycle"))
    people_count = _effective_people_count(request.user, subscription_payload.get("people_count"))
    price_inr = _server_subscription_price(meal_type, plan_cycle, people_count)
    amount_paise = price_inr * 100

    body = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
        "notes": {
            "user_id": str(request.user.id),
            "username": str(request.user.username),
        },
    }

    auth_value = base64.b64encode(f"{key_id}:{key_secret}".encode("utf-8")).decode("utf-8")
    req = request_module.Request(
        "https://api.razorpay.com/v1/orders",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Basic {auth_value}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request_module.urlopen(req, timeout=25) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (error.URLError, json.JSONDecodeError) as exc:
        return Response({"detail": f"Unable to create payment order: {exc}"}, status=status.HTTP_502_BAD_GATEWAY)

    order_id = str(payload.get("id", "")).strip()
    if not order_id:
        return Response({"detail": "Invalid order response from payment gateway"}, status=status.HTTP_502_BAD_GATEWAY)

    PaymentTransaction.objects.create(
        user=request.user,
        provider="razorpay",
        order_id=order_id,
        receipt=receipt,
        amount=amount_paise,
        currency=str(payload.get("currency", "INR")),
        status=PaymentTransaction.STATUS_CREATED,
        subscription_payload=subscription_payload,
    )

    return Response(
        {
            "provider": "razorpay",
            "key_id": key_id,
            "order_id": order_id,
            "price_inr": price_inr,
            "people_count": people_count,
            "amount": amount_paise,
            "currency": str(payload.get("currency", "INR")),
            "name": "Chefos",
            "description": "Subscription payment",
        }
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subscription_price_preview(request):
    meal_type_raw = request.query_params.get("meal_type")
    if meal_type_raw in (None, ""):
        return Response({"detail": "meal_type is required"}, status=status.HTTP_400_BAD_REQUEST)
    meal_type = normalize_meal_type(meal_type_raw.split(",") if isinstance(meal_type_raw, str) else meal_type_raw)
    if not meal_type:
        return Response({"detail": "meal_type is required"}, status=status.HTTP_400_BAD_REQUEST)

    plan_cycle = _normalize_plan_cycle(request.query_params.get("plan_cycle"))
    people_count = _effective_people_count(request.user, request.query_params.get("people_count"))
    price_inr = _server_subscription_price(meal_type, plan_cycle, people_count)

    return Response(
        {
            "price_inr": price_inr,
            "amount_paise": price_inr * 100,
            "plan_cycle": plan_cycle,
            "people_count": people_count,
            "people_tier": "4-6" if int(people_count) >= 3 else "1-2",
            "meal_type": meal_type,
            "meal_count": len(meal_type),
        }
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def payment_verify(request):
    key_id, key_secret = _razorpay_keys()
    if not key_id or not key_secret:
        return Response({"detail": "Payment gateway is not configured"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    order_id = str(request.data.get("razorpay_order_id", "")).strip()
    payment_id = str(request.data.get("razorpay_payment_id", "")).strip()
    signature = str(request.data.get("razorpay_signature", "")).strip()

    if not order_id or not payment_id or not signature:
        return Response({"detail": "razorpay_order_id, razorpay_payment_id and razorpay_signature are required"}, status=400)

    txn = PaymentTransaction.objects.filter(user=request.user, order_id=order_id).first()
    if not txn:
        return Response({"detail": "Payment order not found"}, status=404)

    generated = hmac.new(
        key_secret.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(generated, signature):
        txn.status = PaymentTransaction.STATUS_FAILED
        txn.payment_id = payment_id
        txn.signature = signature
        txn.save(update_fields=["status", "payment_id", "signature", "updated_at"])
        return Response({"detail": "Invalid payment signature"}, status=400)

    txn.status = PaymentTransaction.STATUS_PAID
    txn.payment_id = payment_id
    txn.signature = signature
    txn.save(update_fields=["status", "payment_id", "signature", "updated_at"])
    return Response({"verified": True, "order_id": order_id, "payment_id": payment_id})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_subscription(request):
    data = request.data
    request_tz = _get_request_timezone(request)

    meal_type = normalize_meal_type(data.get("meal_type"))
    if not meal_type:
        return Response(
            {"detail": "meal_type is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    meal_wave = normalize_meal_wave(data.get("meal_wave"), meal_type)

    chef_id = data.get("chef")
    chef = None
    if chef_id:
        try:
            chef = Chef.objects.get(id=chef_id)
        except Chef.DoesNotExist:
            return Response(
                {"detail": "chef not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

    if chef is None:
        # Use assigned chef if available.
        from chef.models import UserChef
        assignment = UserChef.objects.filter(user=request.user).select_related("chef").first()
        chef = assignment.chef if assignment else None

    start_date_raw = data.get("start_date")
    end_date_raw = data.get("end_date")
    plan_cycle = _normalize_plan_cycle(data.get("plan_cycle"))
    try:
        start_date_value = date.fromisoformat(start_date_raw) if start_date_raw else _current_local_date(request_tz)
        if end_date_raw:
            end_date_value = date.fromisoformat(end_date_raw)
        elif plan_cycle == "weekly":
            end_date_value = start_date_value + timedelta(days=7)
        else:
            end_date_value = start_date_value + timedelta(days=30)
    except ValueError:
        return Response(
            {"detail": "start_date/end_date must be YYYY-MM-DD"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    delivery_latitude = data.get("delivery_latitude")
    delivery_longitude = data.get("delivery_longitude")
    try:
        delivery_latitude = float(delivery_latitude) if delivery_latitude not in (None, "") else None
    except (TypeError, ValueError):
        return Response({"detail": "delivery_latitude must be a valid number"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        delivery_longitude = float(delivery_longitude) if delivery_longitude not in (None, "") else None
    except (TypeError, ValueError):
        return Response({"detail": "delivery_longitude must be a valid number"}, status=status.HTTP_400_BAD_REQUEST)

    active_subscription = Subscription.objects.filter(user=request.user, is_active=True).first()

    # Keep existing active plan window when updating and no explicit new dates are sent.
    if active_subscription and not start_date_raw and not end_date_raw:
        start_date_value = active_subscription.start_date
        end_date_value = active_subscription.end_date

    if end_date_value < start_date_value:
        return Response(
            {"detail": "end_date must be after start_date"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    people_count = _effective_people_count(request.user, data.get("people_count"))
    server_price = _server_subscription_price(meal_type, plan_cycle, people_count)
    client_price = data.get("price")
    if client_price not in (None, ""):
        try:
            client_price = int(client_price)
        except (TypeError, ValueError):
            return Response(
                {"detail": "price must be a number"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if client_price != server_price:
            return Response(
                {
                    "detail": "Submitted price does not match server pricing rule",
                    "client_price": client_price,
                    "server_price": server_price,
                    "people_count": people_count,
                    "plan_cycle": plan_cycle,
                    "meal_count": len(meal_type),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
    exclude_subscription_id = active_subscription.id if active_subscription else None

    # Subscriber-first capacity: enforce base subscription capacity per wave.
    for meal in meal_type:
        wave = meal_wave.get(meal)
        if not wave:
            continue
        cap = evaluate_subscription_capacity(
            chef=chef,
            meal=meal,
            wave=wave,
            start_date=start_date_value,
            end_date=end_date_value,
            exclude_subscription_id=exclude_subscription_id,
        )
        if not cap.get("can_accept"):
            alternatives = []
            for candidate_wave in enabled_waves_for_meal(chef, meal):
                candidate_cap = evaluate_subscription_capacity(
                    chef=chef,
                    meal=meal,
                    wave=candidate_wave,
                    start_date=start_date_value,
                    end_date=end_date_value,
                    exclude_subscription_id=exclude_subscription_id,
                )
                alternatives.append(
                    {
                        "wave": candidate_wave,
                        "time": wave_time_label(meal, candidate_wave, chef),
                        "can_accept": candidate_cap.get("can_accept"),
                        "current_load": candidate_cap.get("current_load"),
                        "allowed_capacity": candidate_cap.get("allowed_capacity"),
                    }
                )
            alternatives.sort(key=lambda item: (not item["can_accept"], item["current_load"]))
            selected_time = wave_time_label(meal, wave, chef)
            return Response(
                {
                    "detail": f"Selected time slot is full for {meal} ({selected_time}). Please choose another time.",
                    "meal": meal,
                    "wave": wave,
                    "time": selected_time,
                    "current_load": cap.get("current_load"),
                    "allowed_capacity": cap.get("allowed_capacity"),
                    "alternatives": alternatives,
                },
                status=status.HTTP_409_CONFLICT,
            )

    if active_subscription:
        previous_meals = _normalize_selected_meals(active_subscription.meal_type)
        if set(previous_meals) != set(meal_type):
            return Response(
                {
                    "detail": "Meal type cannot be changed for an active subscription. You can change chef or menu items only.",
                    "active_meal_type": previous_meals,
                    "submitted_meal_type": meal_type,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        previous_waves = active_subscription.meal_wave if isinstance(active_subscription.meal_wave, dict) else {}
        should_refresh_menu = (
            previous_meals != meal_type
            or any(str(previous_waves.get(meal, "")).upper() != str(meal_wave.get(meal, "")).upper() for meal in meal_type)
        )
        active_subscription.chef = chef
        active_subscription.meal_type = meal_type
        active_subscription.meal_wave = meal_wave
        active_subscription.delivery_latitude = delivery_latitude
        active_subscription.delivery_longitude = delivery_longitude
        active_subscription.start_date = start_date_value
        active_subscription.end_date = end_date_value
        active_subscription.price = server_price
        active_subscription.is_active = True
        active_subscription.save()
        menu_refresh_error = None
        if should_refresh_menu:
            try:
                _create_ai_menu_for_user(request.user, selected_meals_override=meal_type)
            except Exception as exc:
                menu_refresh_error = str(exc)
                _align_latest_menu_to_selected_meals(request.user, meal_type)
        invalidate_user_api_cache(request.user.id)
        response_payload = SubscriptionSerializer(active_subscription).data
        response_payload["menu_refreshed"] = should_refresh_menu and menu_refresh_error is None
        if menu_refresh_error:
            response_payload["menu_refresh_error"] = menu_refresh_error
        return Response(response_payload, status=status.HTTP_200_OK)

    subscription = Subscription.objects.create(
        user=request.user,
        chef=chef,
        meal_type=meal_type,
        meal_wave=meal_wave,
        delivery_latitude=delivery_latitude,
        delivery_longitude=delivery_longitude,
        start_date=start_date_value,
        end_date=end_date_value,
        price=server_price,
        is_active=True,
    )
    menu_refresh_error = None
    try:
        _create_ai_menu_for_user(request.user, selected_meals_override=meal_type)
    except Exception as exc:
        menu_refresh_error = str(exc)
        _align_latest_menu_to_selected_meals(request.user, meal_type)
    invalidate_user_api_cache(request.user.id)
    response_payload = SubscriptionSerializer(subscription).data
    response_payload["menu_refreshed"] = menu_refresh_error is None
    if menu_refresh_error:
        response_payload["menu_refresh_error"] = menu_refresh_error
    return Response(response_payload, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def scheduling_capacity_check(request):
    data = request.data
    chef_id = data.get("chef_id")
    meal = str(data.get("meal", "")).strip().lower()
    wave = str(data.get("wave", "")).strip().upper()
    mode = str(data.get("mode", "subscription")).strip().lower()
    date_raw = data.get("date")

    if not chef_id or meal not in {"breakfast", "lunch", "dinner"} or not wave:
        return Response(
            {"detail": "chef_id, meal, and wave are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        chef = Chef.objects.get(id=chef_id)
    except Chef.DoesNotExist:
        return Response({"detail": "chef not found"}, status=status.HTTP_404_NOT_FOUND)

    try:
        schedule_date = date.fromisoformat(str(date_raw)) if date_raw else _current_local_date(_get_request_timezone(request))
    except ValueError:
        return Response({"detail": "date must be YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)

    if mode == "ondemand":
        candidate_lat = data.get("candidate_latitude")
        candidate_lng = data.get("candidate_longitude")
        try:
            candidate_lat = float(candidate_lat) if candidate_lat not in (None, "") else None
            candidate_lng = float(candidate_lng) if candidate_lng not in (None, "") else None
        except (TypeError, ValueError):
            return Response(
                {"detail": "candidate_latitude/candidate_longitude must be valid numbers"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        result = evaluate_ondemand_capacity(
            chef=chef,
            meal=meal,
            wave=wave,
            schedule_date=schedule_date,
            candidate_lat=candidate_lat,
            candidate_lng=candidate_lng,
        )
    else:
        result = evaluate_subscription_capacity(
            chef=chef,
            meal=meal,
            wave=wave,
            start_date=schedule_date,
            end_date=schedule_date,
        )

    return Response(
        {
            "chef_id": chef.id,
            "chef_name": chef.name,
            "meal": meal,
            "wave": wave,
            "mode": mode,
            "date": str(schedule_date),
            "result": result,
        }
    )


# -------------------------
# FEEDBACK
# -------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_feedback(request):
    serializer = FeedbackSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(user=request.user)
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


# -------------------------
# MENU
# -------------------------

MENU_KEYS = ("breakfast", "lunch", "dinner")
SLOT_ACTIVE_DURATION_MINUTES = 60
MEAL_WINDOWS = (
    # Keep these aligned with frontend display times (8:30 AM, 1:00 PM, 8:00 PM)
    ("breakfast", 8 * 60 + 30, 10 * 60 + 59),
    ("lunch", 13 * 60, 15 * 60 + 59),
    ("dinner", 20 * 60, 22 * 60 + 59),
)


def _parse_window_minutes(label):
    if not isinstance(label, str) or "-" not in label:
        return None
    try:
        start_raw, end_raw = [part.strip() for part in label.split("-", 1)]
        start_h, start_m = [int(x) for x in start_raw.split(":", 1)]
        end_h, end_m = [int(x) for x in end_raw.split(":", 1)]
        return start_h * 60 + start_m, end_h * 60 + end_m
    except (TypeError, ValueError):
        return None


def _format_minutes_12h(total_minutes):
    total_minutes = int(total_minutes) % (24 * 60)
    hour = total_minutes // 60
    minute = total_minutes % 60
    suffix = "AM" if hour < 12 else "PM"
    hour12 = hour % 12
    if hour12 == 0:
        hour12 = 12
    return f"{hour12}:{minute:02d} {suffix}"


def _as_string_list(value):
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _get_request_timezone(request):
    tz_name = (request.headers.get("X-User-Timezone") or "").strip()
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            pass

    offset_raw = (request.headers.get("X-User-UTC-Offset-Minutes") or "").strip()
    if offset_raw:
        try:
            # Browser getTimezoneOffset(): UTC - local (IST = -330).
            browser_offset = int(offset_raw)
            return dt_timezone(timedelta(minutes=-browser_offset))
        except (TypeError, ValueError):
            pass
    return timezone.get_current_timezone()


def _current_local_date(tzinfo):
    return timezone.now().astimezone(tzinfo).date()


def _weekday_index(local_date):
    # Weekly menu arrays are treated as Monday -> Sunday.
    return int(local_date.weekday())


def _ensure_week_slots(menu_obj):
    updated = False
    for key in MENU_KEYS:
        items = _as_string_list(getattr(menu_obj, key, []))
        if len(items) < 7:
            items.extend([""] * (7 - len(items)))
            updated = True
        elif len(items) > 7:
            items = items[:7]
            updated = True
        setattr(menu_obj, key, items)
    if updated:
        menu_obj.save(update_fields=list(MENU_KEYS))
    return menu_obj


def _extract_meal_keywords(*items):
    words = []
    for raw in items:
        text = str(raw or "").lower().replace("/", " ").replace(",", " ").replace("-", " ")
        for token in text.split():
            cleaned = "".join(ch for ch in token if ch.isalnum())
            if len(cleaned) >= 4:
                words.append(cleaned)
    deduped = []
    for word in words:
        if word not in deduped:
            deduped.append(word)
        if len(deduped) >= 5:
            break
    return deduped


def _today_menu_image(day_iso: str, breakfast: str, lunch: str, dinner: str, next_slot: str | None = None) -> dict:
    meal_map = {
        "breakfast": str(breakfast or "").strip(),
        "lunch": str(lunch or "").strip(),
        "dinner": str(dinner or "").strip(),
    }
    next_key = str(next_slot or "").strip().lower()
    if next_key in meal_map and meal_map[next_key]:
        primary_text = meal_map[next_key]
        # Prefer upcoming meal image (e.g., dinner when next slot is dinner).
        tags = [primary_text, "indian food", "plated meal"]
        tags += _extract_meal_keywords(primary_text)
    else:
        tags = ["indian food", "healthy meal"] + _extract_meal_keywords(breakfast, lunch, dinner)

    query = " ".join(str(tag).strip() for tag in tags if str(tag).strip())[:220]
    if not query:
        query = "indian food healthy meal"
    signature = day_iso.replace("-", "")

    # Preferred path: Google Images first result via SerpAPI.
    serpapi_key = os.getenv("SERPAPI_API_KEY", "").strip()
    if serpapi_key:
        try:
            url = (
                "https://serpapi.com/search.json?engine=google_images"
                f"&q={quote(query)}&hl=en&gl=in&safe=active&api_key={quote(serpapi_key)}"
            )
            req = request_module.Request(url, method="GET")
            with request_module.urlopen(req, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if payload.get("error"):
                raise ValueError(f"serpapi_error: {payload.get('error')}")
            images = payload.get("images_results") or []

            def _is_image_candidate_live(url_value: str) -> bool:
                if not isinstance(url_value, str) or not url_value.startswith("http"):
                    return False
                try:
                    req = request_module.Request(
                        url_value,
                        method="GET",
                        headers={
                            # Keep transfer tiny while validating link health.
                            "Range": "bytes=0-1023",
                            "User-Agent": "Mozilla/5.0",
                        },
                    )
                    with request_module.urlopen(req, timeout=4) as probe:
                        status_code = getattr(probe, "status", 200)
                        if status_code and int(status_code) >= 400:
                            return False
                    return True
                except Exception:
                    return False

            # Try first, second, and third search results before fallback.
            for idx, item in enumerate(images[:3]):
                candidate = item.get("original") or item.get("thumbnail")
                if _is_image_candidate_live(candidate):
                    return {
                        "url": candidate,
                        "source": "serpapi_google_images",
                        "query": query,
                        "fallback_reason": None,
                        "serpapi_image_rank": idx + 1,
                    }
            raise ValueError("serpapi_empty_results")
        except (ValueError, KeyError, json.JSONDecodeError, error.URLError, TimeoutError) as exc:
            fallback_reason = str(exc)
    else:
        fallback_reason = "SERPAPI_API_KEY_missing"

    # Fallback path: food-focused Unsplash source query.
    return {
        "url": f"https://source.unsplash.com/1600x1000/?{quote(query)}&sig={signature}",
        "source": "unsplash_fallback",
        "query": query,
        "fallback_reason": fallback_reason,
    }


def _today_time_context(tzinfo, selected_meals=None, meal_wave=None) -> dict:
    now = timezone.now().astimezone(tzinfo)
    now_min = now.hour * 60 + now.minute

    selected_set = set(selected_meals or [])
    default_windows = {meal: (start_min, end_min) for meal, start_min, end_min in MEAL_WINDOWS}
    windows = []
    slot_start_times = {}
    meal_windows = {}
    for meal in MENU_KEYS:
        if selected_set and meal not in selected_set:
            continue

        start_min, end_min = default_windows.get(meal, (None, None))
        selected_wave = str((meal_wave or {}).get(meal, "")).upper()
        selected_wave_window = WAVE_TIME_LABELS.get(meal, {}).get(selected_wave)
        parsed = _parse_window_minutes(selected_wave_window)
        if parsed:
            start_min = parsed[0]
            end_min = min((24 * 60) - 1, start_min + SLOT_ACTIVE_DURATION_MINUTES - 1)
        if start_min is None or end_min is None:
            continue
        slot_start_times[meal] = _format_minutes_12h(start_min)
        meal_windows[meal] = {"start_min": int(start_min), "end_min": int(end_min)}
        windows.append((meal, start_min, end_min))

    if not windows:
        windows = list(MEAL_WINDOWS)
    windows.sort(key=lambda item: item[1])

    current_slot = None
    next_slot = None
    next_start = None
    next_day_offset = 0

    for idx, (slot, start_min, end_min) in enumerate(windows):
        if start_min <= now_min <= end_min:
            current_slot = slot
            if idx + 1 < len(windows):
                next_slot = windows[idx + 1][0]
                next_start = windows[idx + 1][1]
                next_day_offset = 0
            else:
                next_slot = windows[0][0]
                next_start = windows[0][1] + 24 * 60
                next_day_offset = 1
            break
        if now_min < start_min:
            next_slot = slot
            next_start = start_min
            next_day_offset = 0
            break

    if next_slot is None:
        next_slot = windows[0][0]
        next_start = windows[0][1] + 24 * 60
        next_day_offset = 1

    if next_start is None:
        next_in_minutes = None
    elif next_start >= now_min:
        next_in_minutes = next_start - now_min
    else:
        next_in_minutes = (24 * 60 - now_min) + next_start

    slot_order = {name: idx for idx, (name, _, _) in enumerate(windows)}
    meal_phase = {}
    for slot_name in MENU_KEYS:
        if selected_set and slot_name not in selected_set:
            meal_phase[slot_name] = "later"
            continue
        if current_slot == slot_name:
            meal_phase[slot_name] = "now"
            continue
        if next_slot == slot_name:
            meal_phase[slot_name] = "next"
            continue
        if current_slot and slot_order.get(slot_name, 99) < slot_order.get(current_slot, 99):
            meal_phase[slot_name] = "completed"
            continue
        meal_phase[slot_name] = "later"

    return {
        "current_slot": current_slot,
        "next_slot": next_slot,
        "next_day_offset": next_day_offset,
        "next_in_minutes": next_in_minutes,
        "meal_phase": meal_phase,
        "slot_start_times": slot_start_times,
        "meal_windows": meal_windows,
    }


def _profile_from_preference(preference):
    return {
        "goal": preference.goal,
        "food_type": preference.food_type,
        "cuisine_style": preference.cuisine_style,
        "allergies": preference.allergies,
        "age": preference.age,
        "gender": preference.gender,
        "height_cm": preference.height_cm,
        "weight_kg": preference.weight_kg,
        "activity_level": preference.activity_level,
        "target_weight_kg": preference.target_weight_kg,
        "medical_conditions": preference.medical_conditions,
        "people_count": preference.people_count,
    }


def _selected_meals_from_subscription(active_sub):
    if not active_sub:
        return []
    meal_type = active_sub.meal_type
    if isinstance(meal_type, list):
        raw = meal_type
    elif isinstance(meal_type, str):
        raw = [meal_type]
    else:
        raw = []
    return [str(item).strip().lower() for item in raw if str(item).strip()]


def _selected_meals_for_user(user):
    active_sub = Subscription.objects.filter(user=user, is_active=True).first()
    return _selected_meals_from_subscription(active_sub)


def _normalize_selected_meals(raw_value):
    meals = normalize_meal_type(raw_value)
    seen = set()
    normalized = []
    for meal in meals:
        if meal not in MENU_KEYS:
            continue
        if meal in seen:
            continue
        seen.add(meal)
        normalized.append(meal)
    return normalized


def _enforce_selected_meals(menu_obj, selected_meals):
    if not selected_meals:
        return menu_obj, False

    selected = set(selected_meals)
    changed = False
    for key in MENU_KEYS:
        if key in selected:
            continue
        current = _as_string_list(getattr(menu_obj, key, []))
        if current:
            setattr(menu_obj, key, [])
            changed = True

    if changed:
        menu_obj = _ensure_week_slots(menu_obj)
    return menu_obj, changed


def _menu_generation_context(user, tzinfo):
    current_local = _current_local_date(tzinfo)
    iso_year, iso_week, _ = current_local.isocalendar()
    previous_menu = WeeklyMenu.objects.filter(user=user).order_by("-created_at").first()

    context = {
        "week_number": iso_week,
        "week_label": f"ISO week {iso_week}, {iso_year}",
    }
    if previous_menu:
        previous_menu = _ensure_week_slots(previous_menu)
        context["previous_menu"] = {
            "breakfast": _as_string_list(previous_menu.breakfast),
            "lunch": _as_string_list(previous_menu.lunch),
            "dinner": _as_string_list(previous_menu.dinner),
        }
    return context


def _create_ai_menu_for_user(user, selected_meals_override=None, tzinfo=None):
    preference = UserPreference.objects.filter(user=user).first()
    if not preference:
        raise ValueError("Please save menu preferences first")

    profile = _profile_from_preference(preference)
    generation_context = _menu_generation_context(user, tzinfo or timezone.get_current_timezone())
    selected_meals = (
        _normalize_selected_meals(selected_meals_override)
        if selected_meals_override is not None
        else _selected_meals_for_user(user)
    )
    generation = generate_menu_with_ai(profile, context=generation_context)
    menu = generation.get("menu", {})

    if selected_meals:
        for key in MENU_KEYS:
            if key not in selected_meals:
                menu[key] = []

    weekly_menu_obj = WeeklyMenu.objects.create(
        user=user,
        breakfast=menu.get("breakfast", []),
        lunch=menu.get("lunch", []),
        dinner=menu.get("dinner", []),
    )
    weekly_menu_obj = _ensure_week_slots(weekly_menu_obj)
    invalidate_user_api_cache(user.id)
    return weekly_menu_obj, generation


def _align_latest_menu_to_selected_meals(user, selected_meals):
    latest = WeeklyMenu.objects.filter(user=user).order_by("-created_at").first()
    if not latest:
        return None
    latest = _ensure_week_slots(latest)
    latest, _ = _enforce_selected_meals(latest, selected_meals)
    return latest


def _get_or_refresh_week_menu(user, tzinfo):
    menu = WeeklyMenu.objects.filter(user=user).order_by('-created_at').first()
    preference = UserPreference.objects.filter(user=user).only("updated_at").first()
    generation = None
    auto_refreshed = False

    if menu:
        menu = _ensure_week_slots(menu)
        menu_created_local = timezone.localtime(menu.created_at, tzinfo).date()
        current_local = _current_local_date(tzinfo)
        created_week = menu_created_local.isocalendar()[:2]
        current_week = current_local.isocalendar()[:2]
        same_calendar_week = created_week == current_week
        preference_is_newer = bool(preference and preference.updated_at and preference.updated_at > menu.created_at)
    else:
        same_calendar_week = False
        preference_is_newer = False

    if not menu or not same_calendar_week or preference_is_newer:
        menu, generation = _create_ai_menu_for_user(user, tzinfo=tzinfo)
        auto_refreshed = True
    else:
        selected_meals = _selected_meals_for_user(user)
        menu, changed = _enforce_selected_meals(menu, selected_meals)
        if changed:
            invalidate_user_api_cache(user.id)

    day_index = _weekday_index(_current_local_date(tzinfo))
    return menu, generation, auto_refreshed, day_index

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def menu_preference(request):
    if request.method == 'GET':
        key = cache_key_menu_preference(request.user.id)
        cached = cache.get(key)
        if cached is not None:
            return Response(cached)

        preference = UserPreference.objects.filter(user=request.user).first()
        if not preference:
            return Response({"detail": "No preferences found"}, status=status.HTTP_404_NOT_FOUND)
        payload = UserPreferenceSerializer(preference).data
        cache.set(key, payload, API_CACHE_TTL_MEDIUM)
        return Response(payload)

    data = request.data
    food_type = data.get('food_type')
    cuisine_style = data.get('cuisine_style', '')
    goal = data.get('goal')
    allergies = data.get('allergies', '')
    age = data.get('age')
    gender = data.get('gender', '')
    height_cm = data.get('height_cm')
    weight_kg = data.get('weight_kg')
    activity_level = data.get('activity_level', '')
    target_weight_kg = data.get('target_weight_kg')
    medical_conditions = data.get('medical_conditions', '')
    people_count = data.get('people_count')

    if not food_type or not goal:
        return Response(
            {"detail": "food_type and goal are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def _to_int(value):
        if value in ("", None):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _to_float(value):
        if value in ("", None):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    preference, _ = UserPreference.objects.update_or_create(
        user=request.user,
        defaults={
            "food_type": food_type,
            "cuisine_style": normalize_cuisine_name(cuisine_style),
            "goal": goal,
            "allergies": allergies,
            "age": _to_int(age),
            "gender": gender,
            "height_cm": _to_int(height_cm),
            "weight_kg": _to_float(weight_kg),
            "activity_level": activity_level,
            "target_weight_kg": _to_float(target_weight_kg),
            "medical_conditions": medical_conditions,
            "people_count": max(1, _to_int(people_count) or 1),
        }
    )
    payload = UserPreferenceSerializer(preference).data
    invalidate_user_api_cache(request.user.id)
    cache.set(cache_key_menu_preference(request.user.id), payload, API_CACHE_TTL_MEDIUM)
    return Response(payload)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cuisine_search(request):
    query = request.query_params.get("q", "")
    results = search_cuisines(query, limit=12)
    return Response({"results": results, "query": query})



@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def weekly_menu(request):
    if request.method == 'GET':
        key = cache_key_weekly_menu(request.user.id)
        cached = cache.get(key)
        if cached is not None:
            return Response(cached)

        request_tz = _get_request_timezone(request)
        try:
            menu, generation, auto_refreshed, day_index = _get_or_refresh_week_menu(request.user, request_tz)
        except Exception as exc:
            message = str(exc)
            code = status.HTTP_400_BAD_REQUEST if message == "Please save menu preferences first" else status.HTTP_502_BAD_GATEWAY
            return Response({"detail": message}, status=code)

        payload = WeeklyMenuSerializer(menu).data
        payload["day_index"] = day_index
        payload["auto_refreshed"] = auto_refreshed
        if generation:
            payload["generation"] = {
                "provider": generation.get("provider"),
                "used_fallback": generation.get("used_fallback"),
                "error": generation.get("error"),
                "attempts": generation.get("attempts", []),
            }
        cache.set(key, payload, API_CACHE_TTL_SHORT)
        return Response(payload)

    data = request.data

    breakfast = data.get('breakfast')
    lunch = data.get('lunch')
    dinner = data.get('dinner')

    if breakfast is None or lunch is None:
        return Response(
            {"detail": "breakfast and lunch are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    weekly_menu_obj = WeeklyMenu.objects.create(
        user=request.user,
        breakfast=breakfast,
        lunch=lunch,
        dinner=dinner if dinner is not None else []
    )
    payload = WeeklyMenuSerializer(weekly_menu_obj).data
    invalidate_user_api_cache(request.user.id)
    cache.set(cache_key_weekly_menu(request.user.id), payload, API_CACHE_TTL_SHORT)
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_ai_weekly_menu(request):
    try:
        active_sub = Subscription.objects.filter(user=request.user, is_active=True).first()
        if active_sub:
            selected_meals = _normalize_selected_meals(active_sub.meal_type)
        else:
            selected_meals = _normalize_selected_meals(request.data.get("selected_meals"))
        weekly_menu_obj, generation = _create_ai_menu_for_user(
            request.user,
            selected_meals_override=selected_meals if selected_meals else None,
            tzinfo=_get_request_timezone(request),
        )
    except Exception as exc:
        message = str(exc)
        if message == "Please save menu preferences first":
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "detail": "AI generation failed in strict mode",
                "provider": os.getenv("AI_PROVIDER", "openrouter"),
                "error": message,
                "attempts": getattr(exc, "attempts", None),
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    response_payload = WeeklyMenuSerializer(weekly_menu_obj).data
    response_payload["generation"] = {
        "provider": generation.get("provider"),
        "used_fallback": generation.get("used_fallback"),
        "error": generation.get("error"),
        "attempts": generation.get("attempts", []),
    }
    cache.set(cache_key_weekly_menu(request.user.id), response_payload, API_CACHE_TTL_SHORT)
    return Response(response_payload, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def today_meal_schedule(request):
    request_tz = _get_request_timezone(request)
    day_iso = _current_local_date(request_tz).isoformat()
    cache_key = cache_key_today_menu(request.user.id, day_iso)

    try:
        menu, generation, auto_refreshed, day_index = _get_or_refresh_week_menu(request.user, request_tz)
    except Exception as exc:
        message = str(exc)
        code = status.HTTP_400_BAD_REQUEST if message == "Please save menu preferences first" else status.HTTP_502_BAD_GATEWAY
        return Response({"detail": message}, status=code)

    active_sub = Subscription.objects.filter(user=request.user, is_active=True).first()
    meal_wave = active_sub.meal_wave if active_sub and isinstance(active_sub.meal_wave, dict) else {}
    selected_meals = _selected_meals_from_subscription(active_sub)
    allowed_patch_meals = set(selected_meals) if selected_meals else set(MENU_KEYS)

    if request.method == 'PATCH':
        for meal_key in MENU_KEYS:
            if meal_key not in allowed_patch_meals:
                continue
            if meal_key in request.data:
                current = _as_string_list(getattr(menu, meal_key, []))
                if len(current) < 7:
                    current.extend([""] * (7 - len(current)))
                current[day_index] = str(request.data.get(meal_key, "")).strip()
                setattr(menu, meal_key, current)
        menu.save(update_fields=list(MENU_KEYS))
        invalidate_user_api_cache(request.user.id)

    breakfast = _as_string_list(menu.breakfast)
    lunch = _as_string_list(menu.lunch)
    dinner = _as_string_list(menu.dinner)
    breakfast_item = breakfast[day_index] if day_index < len(breakfast) else ""
    lunch_item = lunch[day_index] if day_index < len(lunch) else ""
    dinner_item = dinner[day_index] if day_index < len(dinner) else ""
    time_context = _today_time_context(request_tz, selected_meals=selected_meals, meal_wave=meal_wave)
    image_data = _today_menu_image(
        day_iso,
        breakfast_item,
        lunch_item,
        dinner_item,
        next_slot=(time_context or {}).get("next_slot"),
    )
    service_otps = []
    all_service_sessions = []
    doorstep_alerts = []
    if active_sub:
        local_day = _current_local_date(request_tz)
        all_service_qs = (
            ServiceOtpSession.objects.filter(
                user=request.user,
                mode=ServiceOtpSession.MODE_SUBSCRIPTION,
                subscription=active_sub,
                service_date__range=(local_day - timedelta(days=1), local_day + timedelta(days=1)),
            )
            .select_related("chef")
            .order_by("meal", "-updated_at")
        )
        if selected_meals:
            all_service_qs = all_service_qs.filter(meal__in=selected_meals)

        all_service_sessions = list(all_service_qs)
        latest_by_meal = {}
        for session in all_service_sessions:
            key = str(session.meal or "").strip().lower()
            if not key or key in latest_by_meal:
                continue
            latest_by_meal[key] = session

        service_qs = [s for s in all_service_sessions if s.status != ServiceOtpSession.STATUS_COMPLETED]
        for session in service_qs:
            chef_distance_km = None
            chef_near_doorstep = False
            if (
                session.chef_id
                and session.chef.latitude is not None
                and session.chef.longitude is not None
                and active_sub.delivery_latitude is not None
                and active_sub.delivery_longitude is not None
            ):
                chef_distance_km = _haversine_km(
                    float(session.chef.latitude),
                    float(session.chef.longitude),
                    float(active_sub.delivery_latitude),
                    float(active_sub.delivery_longitude),
                )
                chef_near_doorstep = chef_distance_km <= 0.2
                if chef_near_doorstep:
                    doorstep_alerts.append(
                        {
                            "meal": session.meal,
                            "message": f"{session.chef.name} is near your doorstep.",
                            "distance_km": round(chef_distance_km, 2),
                        }
                    )
            service_otps.append(
                {
                    "service_session_id": session.id,
                    "meal": session.meal,
                    "wave": session.wave,
                    "status": session.status,
                    "chef_id": session.chef_id,
                    "chef_name": session.chef.name if session.chef_id else "",
                    "start_otp": session.start_otp if session.status == ServiceOtpSession.STATUS_START_OTP else None,
                    "end_otp": session.end_otp if session.status == ServiceOtpSession.STATUS_END_OTP else None,
                    "journey_started": session.journey_started_at is not None,
                    "journey_started_at": session.journey_started_at.isoformat() if session.journey_started_at else None,
                    "started_at": session.started_at.isoformat() if session.started_at else None,
                    "completed_at": session.completed_at.isoformat() if session.completed_at else None,
                    "chef_distance_km": round(chef_distance_km, 2) if chef_distance_km is not None else None,
                    "chef_near_doorstep": chef_near_doorstep,
                    "chef_latitude": float(session.chef.latitude) if session.chef_id and session.chef.latitude is not None else None,
                    "chef_longitude": float(session.chef.longitude) if session.chef_id and session.chef.longitude is not None else None,
                    "delivery_latitude": float(active_sub.delivery_latitude) if active_sub.delivery_latitude is not None else None,
                    "delivery_longitude": float(active_sub.delivery_longitude) if active_sub.delivery_longitude is not None else None,
                }
            )

        # Past slots should not remain "later": mark as completed or not_captured using OTP lifecycle.
        phase_map = dict((time_context.get("meal_phase") or {}))
        meal_windows = time_context.get("meal_windows") or {}
        now_local = timezone.now().astimezone(request_tz)
        now_min = now_local.hour * 60 + now_local.minute
        meals_to_check = selected_meals if selected_meals else list(MENU_KEYS)
        for meal in meals_to_check:
            slot = meal_windows.get(meal)
            if not slot:
                continue
            end_min = int(slot.get("end_min", -1))
            if end_min < 0 or now_min <= end_min:
                continue
            latest = latest_by_meal.get(meal)
            if latest and latest.status == ServiceOtpSession.STATUS_COMPLETED:
                phase_map[meal] = "completed"
            else:
                phase_map[meal] = "not_captured"
        time_context["meal_phase"] = phase_map
    today_payload = {
        "date": str(_current_local_date(request_tz)),
        "timezone_used": str(request_tz),
        "day_index": day_index,
        "breakfast": breakfast_item,
        "lunch": lunch_item,
        "dinner": dinner_item,
        "weekly_menu_id": menu.id,
        "auto_refreshed": auto_refreshed,
        "menu_image_url": image_data.get("url"),
        "menu_image_source": image_data.get("source"),
        "menu_image_query": image_data.get("query"),
        "menu_image_fallback_reason": image_data.get("fallback_reason"),
        "time_context": time_context,
        "selected_meals": selected_meals,
        "service_otps": service_otps,
        "doorstep_alerts": doorstep_alerts,
    }
    next_slot_key = str((time_context or {}).get("next_slot") or "").strip().lower()
    if next_slot_key in MENU_KEYS:
        next_slot_session = None
        for session in service_otps:
            if str(session.get("meal", "")).strip().lower() == next_slot_key:
                next_slot_session = session
                break
        next_day_offset = int((time_context or {}).get("next_day_offset") or 0)
        next_order_date = _current_local_date(request_tz) + timedelta(days=max(0, next_day_offset))
        next_order_index = _weekday_index(next_order_date)
        next_order_dish = {
            "breakfast": breakfast,
            "lunch": lunch,
            "dinner": dinner,
        }.get(next_slot_key, [])
        next_order_dish = next_order_dish[next_order_index] if next_order_index < len(next_order_dish) else ""
        today_payload["upcoming_order"] = {
            "meal": next_slot_key,
            "date": next_order_date.isoformat(),
            "time": (time_context.get("slot_start_times") or {}).get(next_slot_key),
            "dish": next_order_dish,
            "service_session": next_slot_session,
        }
    if generation:
        today_payload["generation"] = {
            "provider": generation.get("provider"),
            "used_fallback": generation.get("used_fallback"),
            "error": generation.get("error"),
            "attempts": generation.get("attempts", []),
        }
    # Avoid caching the full "today" payload because upcoming_order and meal phase
    # are time-sensitive within the same day and must update as slots pass.
    if request.method != 'GET':
        cache.set(cache_key, today_payload, API_CACHE_TTL_SHORT)
    return Response(today_payload)


class ActiveSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        key = cache_key_active_subscription(request.user.id)
        cached = cache.get(key)
        if cached is not None:
            return Response(cached)

        try:
            sub = Subscription.objects.get(user=request.user, is_active=True)
            payload = SubscriptionSerializer(sub).data
            today = timezone.localdate()
            service_qs = (
                ServiceOtpSession.objects.filter(
                    user=request.user,
                    mode=ServiceOtpSession.MODE_SUBSCRIPTION,
                    subscription=sub,
                    service_date=today,
                )
                .exclude(status=ServiceOtpSession.STATUS_COMPLETED)
                .select_related("chef")
                .order_by("meal", "-updated_at")
            )
            payload["service_otps_today"] = [
                {
                    "service_session_id": session.id,
                    "meal": session.meal,
                    "wave": session.wave,
                    "status": session.status,
                    "chef_id": session.chef_id,
                    "chef_name": session.chef.name if session.chef_id else "",
                    "start_otp": session.start_otp if session.status == ServiceOtpSession.STATUS_START_OTP else None,
                    "end_otp": session.end_otp if session.status == ServiceOtpSession.STATUS_END_OTP else None,
                }
                for session in service_qs
            ]
            cache.set(key, payload, API_CACHE_TTL_SHORT)
            return Response(payload)
        except Subscription.DoesNotExist:
            return Response(
                {"detail": "No active subscription"},
                status=404
            )


@api_view(['GET'])
def health_check(request):
    return Response({"status": "ok"})
