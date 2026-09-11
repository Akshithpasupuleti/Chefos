from math import asin, cos, radians, sin, sqrt
from datetime import date, timedelta
import secrets
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework.generics import ListAPIView
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Chef, ChefPartnerProfile, InstantChefOffer, InstantChefRequest, InstantOrderHistory, ServiceOtpSession, UserChef
from .serializers import ChefPartnerProfileSerializer, ChefSerializer, UserChefSerializer
from core.models import ChefWavePolicy, Feedback, Subscription
from menu.models import WeeklyMenu
from core.cache_utils import (
    cache_key_assigned_chef,
    cache_key_chef_list,
    invalidate_user_api_cache,
)
from core.scheduling import (
    MEAL_WAVES,
    default_custom_wave_labels,
    default_available_waves,
    enabled_waves_for_meal,
    evaluate_subscription_capacity,
    normalize_available_waves,
    normalize_custom_wave_labels,
    wave_time_label,
)

User = get_user_model()

API_CACHE_TTL_SHORT = int(getattr(settings, "API_CACHE_TTL_SHORT", 60))
API_CACHE_TTL_MEDIUM = int(getattr(settings, "API_CACHE_TTL_MEDIUM", 300))
MAX_NEARBY_RADIUS_KM = 5.0
INSTANT_OFFER_TTL_SECONDS = 60


def _chef_partner_for_user(user):
    return ChefPartnerProfile.objects.filter(user=user, is_active_partner=True).select_related("chef").first()


def _parse_float(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return r * c


def _generate_otp() -> str:
    return f"{secrets.randbelow(1000000):06d}"


def _get_request_timezone(request):
    tz_name = str(request.headers.get("X-User-Timezone", "")).strip()
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            pass
    # Default to IST for partner operations when header is unavailable/invalid.
    return ZoneInfo("Asia/Kolkata")


def _service_session_payload(session: ServiceOtpSession, include_user_otp: bool = False) -> dict:
    payload = {
        "id": session.id,
        "mode": session.mode,
        "status": session.status,
        "chef_id": session.chef_id,
        "user_id": session.user_id,
        "subscription_id": session.subscription_id,
        "instant_request_id": session.instant_request_id,
        "service_date": session.service_date.isoformat() if session.service_date else None,
        "meal": session.meal,
        "wave": session.wave,
        "start_otp_pending": session.status == ServiceOtpSession.STATUS_START_OTP,
        "end_otp_pending": session.status == ServiceOtpSession.STATUS_END_OTP,
        "journey_started": session.journey_started_at is not None,
        "journey_started_at": session.journey_started_at.isoformat() if session.journey_started_at else None,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
    }
    if include_user_otp:
        payload["start_otp"] = session.start_otp if session.status == ServiceOtpSession.STATUS_START_OTP else None
        payload["end_otp"] = session.end_otp if session.status == ServiceOtpSession.STATUS_END_OTP else None
    return payload


def _parse_time_to_minutes(raw: str):
    text = str(raw or "").strip().lower()
    if not text:
        return None
    is_pm = "pm" in text
    is_am = "am" in text
    clean = text.replace("am", "").replace("pm", "").strip()
    parts = clean.split(":")
    if not parts:
        return None
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
    except (TypeError, ValueError):
        return None
    if not is_am and not is_pm:
        if hour < 0 or hour > 23:
            return None
    else:
        if hour < 1 or hour > 12:
            return None
        if is_pm and hour != 12:
            hour += 12
        if is_am and hour == 12:
            hour = 0
    if minute < 0 or minute > 59:
        return None
    return hour * 60 + minute


def _slot_window_minutes(label: str):
    raw = str(label or "")
    if "-" not in raw:
        return None
    start_raw, end_raw = [part.strip() for part in raw.split("-", 1)]
    start_min = _parse_time_to_minutes(start_raw)
    end_min = _parse_time_to_minutes(end_raw)
    if start_min is None or end_min is None:
        return None
    if end_min < start_min:
        end_min += 24 * 60
    return start_min, end_min


def _day_menu_item(user, target_date, meal):
    latest_menu = WeeklyMenu.objects.filter(user=user).order_by("-created_at").first()
    if not latest_menu:
        return ""
    # Weekly menu arrays are treated as Monday -> Sunday.
    idx = int(target_date.weekday())
    values = getattr(latest_menu, meal, [])
    if not isinstance(values, list):
        return ""
    if idx >= len(values):
        return ""
    return str(values[idx] or "").strip()


def _instant_response_payload(req: InstantChefRequest, include_user_otp: bool = False) -> dict:
    now = timezone.now()
    offers_payload = []
    pending_offer = None
    accepted_offer = None
    for offer in req.offers.select_related("chef").all().order_by("rank", "id"):
        seconds_left = None
        if offer.status == InstantChefOffer.STATUS_PENDING and offer.expires_at:
            seconds_left = max(0, int((offer.expires_at - now).total_seconds()))
            pending_offer = offer
        if offer.status == InstantChefOffer.STATUS_ACCEPTED:
            accepted_offer = offer
        offers_payload.append(
            {
                "id": offer.id,
                "chef_id": offer.chef_id,
                "chef_name": offer.chef.name,
                "status": offer.status,
                "rank": offer.rank,
                "distance_km": round(float(offer.distance_km), 2),
                "offered_at": offer.offered_at.isoformat() if offer.offered_at else None,
                "expires_at": offer.expires_at.isoformat() if offer.expires_at else None,
                "responded_at": offer.responded_at.isoformat() if offer.responded_at else None,
                "seconds_left": seconds_left,
            }
        )

    current_offer = None
    if pending_offer:
        current_offer = {
            "offer_id": pending_offer.id,
            "chef_id": pending_offer.chef_id,
            "chef_name": pending_offer.chef.name,
            "expires_at": pending_offer.expires_at.isoformat() if pending_offer.expires_at else None,
            "seconds_left": max(0, int((pending_offer.expires_at - now).total_seconds())) if pending_offer.expires_at else None,
        }

    accepted_chef = None
    if accepted_offer:
        chef_lat = float(accepted_offer.chef.latitude) if accepted_offer.chef.latitude is not None else None
        chef_lng = float(accepted_offer.chef.longitude) if accepted_offer.chef.longitude is not None else None
        accepted_chef = {
            "chef_id": accepted_offer.chef_id,
            "chef_name": accepted_offer.chef.name,
            "distance_km": round(float(accepted_offer.distance_km), 2),
            "latitude": chef_lat,
            "longitude": chef_lng,
        }

    status_message = {
        InstantChefRequest.STATUS_SEARCHING: "Finding the nearest available chef right now.",
        InstantChefRequest.STATUS_ACCEPTED: "Chef accepted your instant request.",
        InstantChefRequest.STATUS_CANCELLED: "Instant request was cancelled.",
        InstantChefRequest.STATUS_NO_CHEF: "Sorry, currently chefs are on demand and unavailable nearby.",
    }.get(req.status, "Request updated.")

    payload = {
        "id": req.id,
        "status": req.status,
        "meal": req.meal,
        "wave": req.wave,
        "status_message": status_message,
        "radius_km": float(req.radius_km),
        "request_latitude": float(req.request_latitude),
        "request_longitude": float(req.request_longitude),
        "notes": req.notes,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
        "current_offer": current_offer,
        "accepted_chef": accepted_chef,
        "offers": offers_payload,
    }
    if include_user_otp:
        session = (
            ServiceOtpSession.objects.filter(instant_request=req)
            .select_related("chef", "user")
            .first()
        )
        payload["service_session"] = _service_session_payload(session, include_user_otp=True) if session else None
    return payload


def _advance_instant_request(req: InstantChefRequest):
    now = timezone.now()
    pending = req.offers.filter(status=InstantChefOffer.STATUS_PENDING).order_by("rank", "id").first()
    if pending and pending.expires_at and pending.expires_at <= now:
        pending.status = InstantChefOffer.STATUS_EXPIRED
        pending.responded_at = now
        pending.save(update_fields=["status", "responded_at"])
        pending = None

    if pending:
        if req.status != InstantChefRequest.STATUS_SEARCHING:
            req.status = InstantChefRequest.STATUS_SEARCHING
            req.current_offer_expires_at = pending.expires_at
            req.save(update_fields=["status", "current_offer_expires_at", "updated_at"])
        return pending

    while True:
        candidate = req.offers.filter(status=InstantChefOffer.STATUS_QUEUED).select_related("chef").order_by("rank", "id").first()
        if not candidate:
            req.status = InstantChefRequest.STATUS_NO_CHEF
            req.current_offer_expires_at = None
            req.save(update_fields=["status", "current_offer_expires_at", "updated_at"])
            return None

        if not candidate.chef.is_available:
            candidate.status = InstantChefOffer.STATUS_SKIPPED
            candidate.responded_at = now
            candidate.save(update_fields=["status", "responded_at"])
            continue

        candidate.status = InstantChefOffer.STATUS_PENDING
        candidate.offered_at = now
        candidate.expires_at = now + timedelta(seconds=INSTANT_OFFER_TTL_SECONDS)
        candidate.save(update_fields=["status", "offered_at", "expires_at"])
        req.status = InstantChefRequest.STATUS_SEARCHING
        req.current_offer_expires_at = candidate.expires_at
        req.save(update_fields=["status", "current_offer_expires_at", "updated_at"])
        return candidate


def _normalize_meal_list(raw):
    if isinstance(raw, list):
        meals = raw
    elif isinstance(raw, str):
        meals = [raw]
    else:
        meals = []
    allowed = {"breakfast", "lunch", "dinner"}
    normalized = []
    seen = set()
    for item in meals:
        meal = str(item).strip().lower()
        if not meal or meal not in allowed or meal in seen:
            continue
        normalized.append(meal)
        seen.add(meal)
    return normalized


def _service_target_for_chef(chef, mode, subscription_id, request_id, meal, service_date):
    if mode == ServiceOtpSession.MODE_SUBSCRIPTION:
        if not subscription_id:
            return None, Response({"detail": "subscription_id is required for subscription mode"}, status=400)
        sub = Subscription.objects.filter(id=subscription_id, chef=chef, is_active=True).select_related("user").first()
        if not sub:
            return None, Response({"detail": "Subscription not found for this chef"}, status=404)
        selected_meals = _normalize_meal_list(sub.meal_type)
        if not selected_meals:
            return None, Response({"detail": "Subscription has no selected meals"}, status=400)
        meal_normalized = str(meal or "").strip().lower()
        if meal_normalized not in selected_meals:
            return None, Response({"detail": f"meal must be one of: {', '.join(selected_meals)}"}, status=400)
        service_day = service_date or timezone.localdate()
        wave_map = sub.meal_wave if isinstance(sub.meal_wave, dict) else {}
        wave = str(wave_map.get(meal_normalized, "")).strip()
        return {
            "mode": ServiceOtpSession.MODE_SUBSCRIPTION,
            "chef": chef,
            "user": sub.user,
            "subscription": sub,
            "instant_request": None,
            "service_date": service_day,
            "meal": meal_normalized,
            "wave": wave,
        }, None

    if mode == ServiceOtpSession.MODE_INSTANT:
        if not request_id:
            return None, Response({"detail": "request_id is required for instant mode"}, status=400)
        req = (
            InstantChefRequest.objects.filter(
                id=request_id,
                status=InstantChefRequest.STATUS_ACCEPTED,
                accepted_chef=chef,
            )
            .select_related("user")
            .first()
        )
        if not req:
            return None, Response({"detail": "Accepted instant request not found for this chef"}, status=404)
        return {
            "mode": ServiceOtpSession.MODE_INSTANT,
            "chef": chef,
            "user": req.user,
            "subscription": None,
            "instant_request": req,
            "service_date": timezone.localdate(),
            "meal": "",
            "wave": "",
        }, None

    return None, Response({"detail": "mode must be subscription or instant"}, status=400)


def _get_or_create_service_session(target):
    if target["mode"] == ServiceOtpSession.MODE_SUBSCRIPTION:
        session, _ = ServiceOtpSession.objects.get_or_create(
            subscription=target["subscription"],
            service_date=target["service_date"],
            meal=target["meal"],
            defaults={
                "mode": ServiceOtpSession.MODE_SUBSCRIPTION,
                "chef": target["chef"],
                "user": target["user"],
                "wave": target["wave"],
                "status": ServiceOtpSession.STATUS_ASSIGNED,
            },
        )
        updated_fields = []
        if session.chef_id != target["chef"].id:
            session.chef = target["chef"]
            updated_fields.append("chef")
        if session.user_id != target["user"].id:
            session.user = target["user"]
            updated_fields.append("user")
        if session.subscription_id != target["subscription"].id:
            session.subscription = target["subscription"]
            updated_fields.append("subscription")
        if session.wave != target["wave"]:
            session.wave = target["wave"]
            updated_fields.append("wave")
        if updated_fields:
            updated_fields.append("updated_at")
            session.save(update_fields=updated_fields)
        return session

    session, _ = ServiceOtpSession.objects.get_or_create(
        instant_request=target["instant_request"],
        defaults={
            "mode": ServiceOtpSession.MODE_INSTANT,
            "chef": target["chef"],
            "user": target["user"],
            "service_date": target["service_date"],
            "status": ServiceOtpSession.STATUS_ASSIGNED,
        },
    )
    updated_fields = []
    if session.chef_id != target["chef"].id:
        session.chef = target["chef"]
        updated_fields.append("chef")
    if session.user_id != target["user"].id:
        session.user = target["user"]
        updated_fields.append("user")
    if updated_fields:
        updated_fields.append("updated_at")
        session.save(update_fields=updated_fields)
    return session

class AssignedChefView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        key = cache_key_assigned_chef(request.user.id)
        cached = cache.get(key)
        if cached is not None:
            return Response(cached)

        try:
            assignment = UserChef.objects.get(user=request.user)
            payload = UserChefSerializer(assignment).data
            cache.set(key, payload, API_CACHE_TTL_SHORT)
            return Response(payload)
        except UserChef.DoesNotExist:
            return Response({"detail": "No chef assigned"}, status=404)


class AssignChefView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        chef_id = request.data.get("chef_id")

        if not chef_id:
            return Response({"error": "chef_id required"}, status=400)

        try:
            chef = Chef.objects.get(id=chef_id, is_available=True)
        except Chef.DoesNotExist:
            return Response({"error": "Chef not available"}, status=404)

        UserChef.objects.update_or_create(
            user=request.user,
            defaults={"chef": chef}
        )
        invalidate_user_api_cache(request.user.id)
        return Response({"success": True})



class ChefListView(ListAPIView):
    queryset = Chef.objects.filter(is_available=True)
    serializer_class = ChefSerializer
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        user_lat = _parse_float(request.query_params.get("lat"))
        user_lng = _parse_float(request.query_params.get("lng"))
        radius_km = _parse_float(request.query_params.get("radius_km"))
        if radius_km is None:
            radius_km = MAX_NEARBY_RADIUS_KM
        radius_km = max(0.5, min(radius_km, MAX_NEARBY_RADIUS_KM))

        if user_lat is not None and user_lng is not None:
            suffix = f"near:{round(user_lat, 3)}:{round(user_lng, 3)}:{round(radius_km, 1)}"
        else:
            suffix = "all"

        selected_meals_raw = (request.query_params.get("selected_meals") or "").strip()
        selected_meals = [m.strip().lower() for m in selected_meals_raw.split(",") if m.strip()]
        selected_meals = [m for m in selected_meals if m in {"breakfast", "lunch", "dinner"}]
        plan_cycle = str(request.query_params.get("plan_cycle", "monthly")).strip().lower()
        selected_suffix = ",".join(selected_meals) if selected_meals else "none"
        suffix = f"{suffix}:meals:{selected_suffix}:cycle:{plan_cycle}"

        key = cache_key_chef_list(suffix)
        cached = cache.get(key)
        if cached is not None:
            return Response(cached)

        queryset = Chef.objects.filter(is_available=True)
        if user_lat is not None and user_lng is not None:
            with_coords = queryset.exclude(latitude__isnull=True).exclude(longitude__isnull=True)
            nearby = []
            for chef in with_coords:
                distance = _haversine_km(user_lat, user_lng, float(chef.latitude), float(chef.longitude))
                if distance <= radius_km:
                    setattr(chef, "distance_km", distance)
                    nearby.append(chef)
            nearby.sort(key=lambda c: getattr(c, "distance_km", 9999))
            chefs_list = nearby
        else:
            chefs_list = list(queryset)

        serializer_data = self.get_serializer(chefs_list, many=True).data
        start_date = timezone.localdate()
        end_date = start_date + timedelta(days=7 if plan_cycle == "weekly" else 30)

        enriched = []
        for item in serializer_data:
            chef_obj = next((c for c in chefs_list if c.id == item["id"]), None)
            available_slots = {}
            if selected_meals and chef_obj:
                for meal in selected_meals:
                    meal_slots = []
                    for wave in enabled_waves_for_meal(chef_obj, meal):
                        cap = evaluate_subscription_capacity(
                            chef=chef_obj,
                            meal=meal,
                            wave=wave,
                            start_date=start_date,
                            end_date=end_date,
                        )
                        if cap.get("can_accept"):
                            meal_slots.append(
                                {
                                    "wave": wave,
                                    "time": wave_time_label(meal, wave, chef_obj),
                                    "current_load": cap.get("current_load"),
                                    "allowed_capacity": cap.get("allowed_capacity"),
                                }
                            )
                    available_slots[meal] = meal_slots
                has_all = all(available_slots.get(meal) for meal in selected_meals)
                item["available_slots"] = available_slots
                item["has_available_slots"] = has_all
                if not has_all:
                    continue
            else:
                item["available_slots"] = {}
                item["has_available_slots"] = True
            enriched.append(item)

        payload = enriched

        cache.set(key, payload, API_CACHE_TTL_MEDIUM)
        return Response(payload)


class InstantChefRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        lat = _parse_float(request.data.get("latitude"))
        lng = _parse_float(request.data.get("longitude"))
        if lat is None or lng is None:
            return Response({"detail": "latitude and longitude are required"}, status=400)

        radius_km = _parse_float(request.data.get("radius_km"))
        if radius_km is None:
            radius_km = MAX_NEARBY_RADIUS_KM
        radius_km = max(0.5, min(radius_km, MAX_NEARBY_RADIUS_KM))

        notes = str(request.data.get("notes", "")).strip()[:255]

        with_coords = Chef.objects.filter(is_available=True).exclude(latitude__isnull=True).exclude(longitude__isnull=True)
        ranked = []
        for chef in with_coords:
            distance = _haversine_km(lat, lng, float(chef.latitude), float(chef.longitude))
            if distance <= radius_km:
                ranked.append((chef, distance))
        ranked.sort(key=lambda item: item[1])
        if not ranked:
            return Response({"detail": "No nearby chefs found within 5 km", "offers": []}, status=404)

        with transaction.atomic():
            req = InstantChefRequest.objects.create(
                user=request.user,
                status=InstantChefRequest.STATUS_SEARCHING,
                meal="",
                wave="",
                request_latitude=lat,
                request_longitude=lng,
                radius_km=radius_km,
                notes=notes,
            )
            offers = []
            for idx, (chef_obj, distance) in enumerate(ranked, start=1):
                offers.append(
                    InstantChefOffer(
                        request=req,
                        chef=chef_obj,
                        rank=idx,
                        distance_km=distance,
                        status=InstantChefOffer.STATUS_QUEUED,
                    )
                )
            InstantChefOffer.objects.bulk_create(offers)
            _advance_instant_request(req)
            req.refresh_from_db()

        payload = _instant_response_payload(req, include_user_otp=True)
        return Response(payload, status=201)


class InstantChefLatestView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        req = InstantChefRequest.objects.filter(user=request.user).first()
        if not req:
            return Response({"detail": "No instant request found"}, status=404)
        if req.status == InstantChefRequest.STATUS_SEARCHING:
            with transaction.atomic():
                locked = InstantChefRequest.objects.select_for_update().get(id=req.id)
                _advance_instant_request(locked)
                locked.refresh_from_db()
                req = locked
        return Response(_instant_response_payload(req, include_user_otp=True))


class InstantChefRequestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, request_id: int):
        req = InstantChefRequest.objects.filter(id=request_id, user=request.user).first()
        if not req:
            return Response({"detail": "Instant request not found"}, status=404)

        if req.status == InstantChefRequest.STATUS_SEARCHING:
            with transaction.atomic():
                locked = InstantChefRequest.objects.select_for_update().get(id=req.id)
                _advance_instant_request(locked)
                locked.refresh_from_db()
                req = locked

        return Response(_instant_response_payload(req, include_user_otp=True))

    def delete(self, request, request_id: int):
        req = InstantChefRequest.objects.filter(id=request_id, user=request.user).first()
        if not req:
            return Response({"detail": "Instant request not found"}, status=404)

        with transaction.atomic():
            locked = InstantChefRequest.objects.select_for_update().get(id=req.id)
            if locked.status in {InstantChefRequest.STATUS_ACCEPTED, InstantChefRequest.STATUS_NO_CHEF}:
                return Response({"detail": f"Cannot cancel a {locked.status} request"}, status=409)
            locked.status = InstantChefRequest.STATUS_CANCELLED
            locked.current_offer_expires_at = None
            locked.save(update_fields=["status", "current_offer_expires_at", "updated_at"])
            locked.offers.filter(status=InstantChefOffer.STATUS_PENDING).update(
                status=InstantChefOffer.STATUS_EXPIRED,
                responded_at=timezone.now(),
            )
            req = locked

        return Response(_instant_response_payload(req, include_user_otp=True))


class InstantChefRespondView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id: int):
        chef_id = request.data.get("chef_id")
        action = str(request.data.get("action", "")).strip().lower()
        if not chef_id or action not in {"accept", "decline"}:
            return Response({"detail": "chef_id and action(accept/decline) are required"}, status=400)

        with transaction.atomic():
            req = InstantChefRequest.objects.select_for_update().filter(id=request_id).first()
            if not req:
                return Response({"detail": "Instant request not found"}, status=404)
            if req.status != InstantChefRequest.STATUS_SEARCHING:
                return Response({"detail": f"Request is {req.status}"}, status=409)

            pending = req.offers.select_for_update().filter(status=InstantChefOffer.STATUS_PENDING).order_by("rank", "id").first()
            if not pending:
                _advance_instant_request(req)
                req.refresh_from_db()
                return Response(_instant_response_payload(req, include_user_otp=True))
            if str(pending.chef_id) != str(chef_id):
                return Response({"detail": "This chef is not the current offered chef"}, status=409)

            now = timezone.now()
            if pending.expires_at and pending.expires_at <= now:
                pending.status = InstantChefOffer.STATUS_EXPIRED
                pending.responded_at = now
                pending.save(update_fields=["status", "responded_at"])
                _advance_instant_request(req)
                req.refresh_from_db()
                return Response(_instant_response_payload(req, include_user_otp=True))

            if action == "accept":
                pending.status = InstantChefOffer.STATUS_ACCEPTED
                pending.responded_at = now
                pending.save(update_fields=["status", "responded_at"])

                req.status = InstantChefRequest.STATUS_ACCEPTED
                req.accepted_chef = pending.chef
                req.current_offer_expires_at = None
                req.assigned_at = now
                req.save(
                    update_fields=[
                        "status",
                        "accepted_chef",
                        "current_offer_expires_at",
                        "assigned_at",
                        "updated_at",
                    ]
                )
                req.offers.filter(status=InstantChefOffer.STATUS_QUEUED).update(
                    status=InstantChefOffer.STATUS_SKIPPED,
                    responded_at=now,
                )
                UserChef.objects.update_or_create(user=req.user, defaults={"chef": pending.chef})
                invalidate_user_api_cache(req.user.id)
            else:
                pending.status = InstantChefOffer.STATUS_DECLINED
                pending.responded_at = now
                pending.save(update_fields=["status", "responded_at"])
                _advance_instant_request(req)

            req.refresh_from_db()

        return Response(_instant_response_payload(req, include_user_otp=True))


class ChefPartnerRegisterView(APIView):
    def post(self, request):
        data = request.data
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", "")).strip()
        email = str(data.get("email", "")).strip()
        name = str(data.get("name", "")).strip()
        speciality = str(data.get("speciality", "")).strip()
        phone = str(data.get("phone", "")).strip()
        city = str(data.get("city", "")).strip()
        latitude = _parse_float(data.get("latitude"))
        longitude = _parse_float(data.get("longitude"))

        if not username or not password or not name or not speciality:
            return Response(
                {"detail": "username, password, name, and speciality are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username=username).exists():
            return Response({"detail": "username already exists"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            user = User.objects.create_user(username=username, email=email, password=password)
            chef = Chef.objects.create(
                name=name,
                speciality=speciality,
                rating=4.5,
                is_available=True,
                latitude=latitude,
                longitude=longitude,
            )
            partner = ChefPartnerProfile.objects.create(
                user=user,
                chef=chef,
                phone=phone,
                city=city,
                is_verified=False,
                is_active_partner=True,
            )

        return Response(
            {
                "detail": "Chef partner account created",
                "user_id": user.id,
                "chef_id": chef.id,
                "partner_profile": ChefPartnerProfileSerializer(partner).data,
            },
            status=status.HTTP_201_CREATED,
        )


class ChefPartnerMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        partner = _chef_partner_for_user(request.user)
        if not partner:
            return Response({"detail": "Chef partner profile not found"}, status=status.HTTP_404_NOT_FOUND)

        chef = partner.chef
        subscriptions = (
            Subscription.objects.filter(chef=chef, is_active=True).select_related("user").order_by("end_date", "id")
        )
        subscriptions_payload = [
            {
                "id": sub.id,
                "user_id": sub.user_id,
                "username": sub.user.username,
                "meal_type": sub.meal_type,
                "meal_wave": sub.meal_wave if isinstance(sub.meal_wave, dict) else {},
                "start_date": str(sub.start_date),
                "end_date": str(sub.end_date),
                "price": int(sub.price or 0),
                "delivery_latitude": float(sub.delivery_latitude) if sub.delivery_latitude is not None else None,
                "delivery_longitude": float(sub.delivery_longitude) if sub.delivery_longitude is not None else None,
            }
            for sub in subscriptions
        ]

        now = timezone.now()
        pending_offers = (
            InstantChefOffer.objects.filter(
                chef=chef,
                status=InstantChefOffer.STATUS_PENDING,
                request__status=InstantChefRequest.STATUS_SEARCHING,
            )
            .select_related("request", "request__user")
            .order_by("expires_at", "id")
        )
        pending_payload = []
        for offer in pending_offers:
            pending_payload.append(
                {
                    "offer_id": offer.id,
                    "request_id": offer.request_id,
                    "username": offer.request.user.username,
                    "distance_km": round(float(offer.distance_km), 2),
                    "seconds_left": max(0, int((offer.expires_at - now).total_seconds())) if offer.expires_at else None,
                    "request_latitude": float(offer.request.request_latitude),
                    "request_longitude": float(offer.request.request_longitude),
                    "notes": offer.request.notes,
                    "offered_at": offer.offered_at.isoformat() if offer.offered_at else None,
                    "expires_at": offer.expires_at.isoformat() if offer.expires_at else None,
                }
            )

        accepted_requests = (
            InstantChefRequest.objects.filter(
                status=InstantChefRequest.STATUS_ACCEPTED,
                accepted_chef=chef,
            )
            .select_related("user")
            .order_by("-assigned_at", "-updated_at", "-id")[:10]
        )
        accepted_payload = []
        for req in accepted_requests:
            accepted_payload.append(
                {
                    "request_id": req.id,
                    "username": req.user.username,
                    "request_latitude": float(req.request_latitude),
                    "request_longitude": float(req.request_longitude),
                    "assigned_at": req.assigned_at.isoformat() if req.assigned_at else None,
                    "notes": req.notes,
                }
            )

        service_sessions = (
            ServiceOtpSession.objects.filter(chef=chef)
            .exclude(status=ServiceOtpSession.STATUS_COMPLETED)
            .select_related("user", "subscription", "instant_request")
            .order_by("-updated_at", "-id")[:20]
        )
        service_payload = []
        for session in service_sessions:
            item = _service_session_payload(session, include_user_otp=False)
            item["username"] = session.user.username
            service_payload.append(item)

        request_tz = _get_request_timezone(request)
        now_local = timezone.localtime(timezone.now(), request_tz)
        now_minutes = now_local.hour * 60 + now_local.minute
        today = now_local.date()
        active_sub_sessions = {
            f"{s.subscription_id}:{s.service_date}:{s.meal}": s
            for s in service_sessions
            if s.mode == ServiceOtpSession.MODE_SUBSCRIPTION and s.subscription_id and s.service_date and s.meal
        }
        active_instant_sessions = {
            s.instant_request_id: s
            for s in service_sessions
            if s.mode == ServiceOtpSession.MODE_INSTANT and s.instant_request_id
        }

        subscription_targets = []
        for sub in subscriptions:
            meal_type = sub.meal_type if isinstance(sub.meal_type, list) else []
            wave_map = sub.meal_wave if isinstance(sub.meal_wave, dict) else {}
            for meal_raw in meal_type:
                meal = str(meal_raw or "").strip().lower()
                if meal not in {"breakfast", "lunch", "dinner"}:
                    continue
                wave = str(wave_map.get(meal, "")).strip().upper()
                if not wave:
                    continue
                slot_label = wave_time_label(meal, wave, chef)
                slot_window = _slot_window_minutes(slot_label)
                if not slot_window:
                    continue
                start_min, end_min = slot_window

                starts_in = start_min - now_minutes
                can_start_now = (start_min - 30) <= now_minutes <= end_min
                session_key = f"{sub.id}:{today.isoformat()}:{meal}"
                session = active_sub_sessions.get(session_key)
                session_status = session.status if session else "none"
                journey_started = bool(session and session.journey_started_at)
                journey_started_at = session.journey_started_at.isoformat() if session and session.journey_started_at else None
                chef_distance_to_user_km = None
                if (
                    chef.latitude is not None
                    and chef.longitude is not None
                    and sub.delivery_latitude is not None
                    and sub.delivery_longitude is not None
                ):
                    chef_distance_to_user_km = _haversine_km(
                        float(chef.latitude),
                        float(chef.longitude),
                        float(sub.delivery_latitude),
                        float(sub.delivery_longitude),
                    )

                # Start OTP should only be available for the current actionable booking.
                can_start_otp_now = (
                    can_start_now
                    and not session
                    and chef_distance_to_user_km is not None
                    and chef_distance_to_user_km <= 0.2
                )

                subscription_targets.append(
                    {
                        "mode": "subscription",
                        "subscription_id": sub.id,
                        "user_id": sub.user_id,
                        "username": sub.user.username,
                        "meal": meal,
                        "wave": wave,
                        "slot_label": slot_label,
                        "start_minutes": start_min,
                        "end_minutes": end_min,
                        "starts_in_minutes": starts_in,
                        "is_today_upcoming_slot": starts_in > 0,
                        "service_date": today.isoformat(),
                        "menu_item": _day_menu_item(sub.user, today, meal),
                        "delivery_latitude": float(sub.delivery_latitude) if sub.delivery_latitude is not None else None,
                        "delivery_longitude": float(sub.delivery_longitude) if sub.delivery_longitude is not None else None,
                        "chef_latitude": float(chef.latitude) if chef.latitude is not None else None,
                        "chef_longitude": float(chef.longitude) if chef.longitude is not None else None,
                        "service_session_id": session.id if session else None,
                        "service_status": session_status,
                        "journey_started": journey_started,
                        "journey_started_at": journey_started_at,
                        "can_start_now": can_start_now,
                        "can_start_otp_now": can_start_otp_now,
                        "can_start_journey_now": not journey_started,
                        "chef_distance_to_user_km": round(chef_distance_to_user_km, 2) if chef_distance_to_user_km is not None else None,
                    }
                )

        instant_targets = []
        for req in accepted_requests:
            session = active_instant_sessions.get(req.id)
            if session and session.status == ServiceOtpSession.STATUS_COMPLETED:
                continue
            instant_targets.append(
                {
                    "mode": "instant",
                    "request_id": req.id,
                    "user_id": req.user_id,
                    "username": req.user.username,
                    "assigned_at": req.assigned_at.isoformat() if req.assigned_at else None,
                    "notes": req.notes,
                    "menu_item": "Instant request",
                    "request_latitude": float(req.request_latitude),
                    "request_longitude": float(req.request_longitude),
                    "service_session_id": session.id if session else None,
                    "service_status": session.status if session else "none",
                    "journey_started": bool(session and session.journey_started_at),
                    "journey_started_at": session.journey_started_at.isoformat() if session and session.journey_started_at else None,
                    "can_start_now": True,
                    "can_start_otp_now": session is None,
                }
            )

        subscription_targets.sort(key=lambda item: (0 if item["can_start_now"] else 1, abs(item["starts_in_minutes"])))
        current_booking = None
        for target in subscription_targets:
            if target["can_start_now"]:
                current_booking = target
                break
        if current_booking is None and instant_targets:
            current_booking = instant_targets[0]

        upcoming_order = None
        future_sub = [item for item in subscription_targets if item["starts_in_minutes"] > 0]
        if future_sub:
            future_sub.sort(key=lambda item: item["starts_in_minutes"])
            upcoming_order = future_sub[0]

        policy = ChefWavePolicy.objects.filter(chef=chef).first()
        if not policy:
            policy = ChefWavePolicy.objects.create(
                chef=chef,
                base_subscription_capacity=3,
                max_wave_capacity=5,
                allow_ondemand_extra=True,
                available_waves=default_available_waves(),
                custom_wave_labels=default_custom_wave_labels(),
            )

        return Response(
            {
                "partner_profile": ChefPartnerProfileSerializer(partner).data,
                "slot_settings": {
                    "waves_catalog": {meal: list(waves) for meal, waves in MEAL_WAVES.items()},
                    "available_waves": normalize_available_waves(policy.available_waves),
                    "custom_wave_labels": normalize_custom_wave_labels(policy.custom_wave_labels),
                    "base_subscription_capacity": policy.base_subscription_capacity,
                    "max_wave_capacity": policy.max_wave_capacity,
                    "allow_ondemand_extra": policy.allow_ondemand_extra,
                },
                "stats": {
                    "active_subscriptions": len(subscriptions_payload),
                    "pending_instant_requests": len(pending_payload),
                },
                "timezone_used": str(request_tz),
                "subscriptions": subscriptions_payload,
                "pending_instant_offers": pending_payload,
                "accepted_instant_orders": accepted_payload,
                "service_sessions": service_payload,
                "current_booking": current_booking,
                "upcoming_order": upcoming_order,
            }
        )


class ChefPartnerAvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        partner = _chef_partner_for_user(request.user)
        if not partner:
            return Response({"detail": "Chef partner profile not found"}, status=status.HTTP_404_NOT_FOUND)

        raw_value = request.data.get("is_available")
        if raw_value in (None, ""):
            return Response({"detail": "is_available is required"}, status=status.HTTP_400_BAD_REQUEST)
        if isinstance(raw_value, str):
            is_available = raw_value.strip().lower() in {"1", "true", "yes", "on"}
        else:
            is_available = bool(raw_value)

        partner.chef.is_available = is_available
        partner.chef.save(update_fields=["is_available"])
        return Response({"success": True, "is_available": partner.chef.is_available})


class ChefPartnerLocationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        partner = _chef_partner_for_user(request.user)
        if not partner:
            return Response({"detail": "Chef partner profile not found"}, status=status.HTTP_404_NOT_FOUND)

        latitude = _parse_float(request.data.get("latitude"))
        longitude = _parse_float(request.data.get("longitude"))
        if latitude is None or longitude is None:
            return Response({"detail": "latitude and longitude are required"}, status=status.HTTP_400_BAD_REQUEST)
        if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
            return Response({"detail": "Invalid latitude/longitude range"}, status=status.HTTP_400_BAD_REQUEST)

        partner.chef.latitude = latitude
        partner.chef.longitude = longitude
        partner.chef.save(update_fields=["latitude", "longitude"])
        return Response({"success": True, "latitude": float(latitude), "longitude": float(longitude)})


class ChefPartnerSlotSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        partner = _chef_partner_for_user(request.user)
        if not partner:
            return Response({"detail": "Chef partner profile not found"}, status=status.HTTP_404_NOT_FOUND)

        raw_available = request.data.get("available_waves")
        available = normalize_available_waves(raw_available)
        raw_labels = request.data.get("custom_wave_labels")
        custom_labels = normalize_custom_wave_labels(raw_labels)
        for meal, waves in available.items():
            if not waves:
                return Response(
                    {"detail": f"At least one slot must be enabled for {meal}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        for meal, wave_labels in custom_labels.items():
            for wave, label in wave_labels.items():
                if len(str(label).strip()) > 40:
                    return Response(
                        {"detail": f"Slot label too long for {meal} {wave}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        policy, _ = ChefWavePolicy.objects.get_or_create(
            chef=partner.chef,
            defaults={
                "base_subscription_capacity": 3,
                "max_wave_capacity": 5,
                "allow_ondemand_extra": True,
                "available_waves": default_available_waves(),
                "custom_wave_labels": default_custom_wave_labels(),
            },
        )
        policy.available_waves = available
        policy.custom_wave_labels = custom_labels
        policy.save(update_fields=["available_waves", "custom_wave_labels"])

        return Response(
            {
                "success": True,
                "available_waves": normalize_available_waves(policy.available_waves),
                "custom_wave_labels": normalize_custom_wave_labels(policy.custom_wave_labels),
            }
        )


class ChefPartnerInstantRespondView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        partner = _chef_partner_for_user(request.user)
        if not partner:
            return Response({"detail": "Chef partner profile not found"}, status=status.HTTP_404_NOT_FOUND)

        request_id = request.data.get("request_id")
        action = str(request.data.get("action", "")).strip().lower()
        if not request_id or action not in {"accept", "decline"}:
            return Response({"detail": "request_id and action(accept/decline) are required"}, status=400)

        with transaction.atomic():
            req = InstantChefRequest.objects.select_for_update().filter(id=request_id).first()
            if not req:
                return Response({"detail": "Instant request not found"}, status=404)
            if req.status != InstantChefRequest.STATUS_SEARCHING:
                return Response({"detail": f"Request is {req.status}"}, status=409)

            pending = req.offers.select_for_update().filter(status=InstantChefOffer.STATUS_PENDING).order_by("rank", "id").first()
            if not pending:
                _advance_instant_request(req)
                req.refresh_from_db()
                return Response(_instant_response_payload(req))
            if str(pending.chef_id) != str(partner.chef_id):
                return Response({"detail": "This chef is not the current offered chef"}, status=409)

            now = timezone.now()
            if pending.expires_at and pending.expires_at <= now:
                pending.status = InstantChefOffer.STATUS_EXPIRED
                pending.responded_at = now
                pending.save(update_fields=["status", "responded_at"])
                _advance_instant_request(req)
                req.refresh_from_db()
                return Response(_instant_response_payload(req))

            if action == "accept":
                pending.status = InstantChefOffer.STATUS_ACCEPTED
                pending.responded_at = now
                pending.save(update_fields=["status", "responded_at"])

                req.status = InstantChefRequest.STATUS_ACCEPTED
                req.accepted_chef = pending.chef
                req.current_offer_expires_at = None
                req.assigned_at = now
                req.save(
                    update_fields=[
                        "status",
                        "accepted_chef",
                        "current_offer_expires_at",
                        "assigned_at",
                        "updated_at",
                    ]
                )
                req.offers.filter(status=InstantChefOffer.STATUS_QUEUED).update(
                    status=InstantChefOffer.STATUS_SKIPPED,
                    responded_at=now,
                )
                UserChef.objects.update_or_create(user=req.user, defaults={"chef": pending.chef})
                invalidate_user_api_cache(req.user.id)
            else:
                pending.status = InstantChefOffer.STATUS_DECLINED
                pending.responded_at = now
                pending.save(update_fields=["status", "responded_at"])
                _advance_instant_request(req)

            req.refresh_from_db()

        return Response(_instant_response_payload(req))


class ChefPartnerServiceStartRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        partner = _chef_partner_for_user(request.user)
        if not partner:
            return Response({"detail": "Chef partner profile not found"}, status=404)

        mode = str(request.data.get("mode", ServiceOtpSession.MODE_SUBSCRIPTION)).strip().lower()
        subscription_id = request.data.get("subscription_id")
        request_id = request.data.get("request_id")
        meal = request.data.get("meal")
        service_date_raw = str(request.data.get("service_date", "")).strip()
        service_date = None
        if service_date_raw:
            try:
                service_date = date.fromisoformat(service_date_raw)
            except ValueError:
                return Response({"detail": "service_date must be YYYY-MM-DD"}, status=400)

        target, error_response = _service_target_for_chef(
            chef=partner.chef,
            mode=mode,
            subscription_id=subscription_id,
            request_id=request_id,
            meal=meal,
            service_date=service_date,
        )
        if error_response:
            return error_response

        with transaction.atomic():
            session = _get_or_create_service_session(target)
            if session.status in {ServiceOtpSession.STATUS_END_OTP, ServiceOtpSession.STATUS_COMPLETED}:
                return Response({"detail": f"Cannot start service in status {session.status}"}, status=409)
            session.start_otp = _generate_otp()
            session.start_otp_generated_at = timezone.now()
            session.status = ServiceOtpSession.STATUS_START_OTP
            session.save(update_fields=["start_otp", "start_otp_generated_at", "status", "updated_at"])
            invalidate_user_api_cache(session.user_id)

        return Response(
            {
                "detail": "Start OTP generated. Ask the user for OTP and verify to begin service.",
                "service_session": _service_session_payload(session, include_user_otp=False),
            }
        )


class ChefPartnerServiceStartVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        partner = _chef_partner_for_user(request.user)
        if not partner:
            return Response({"detail": "Chef partner profile not found"}, status=404)

        session_id = request.data.get("service_session_id")
        otp = str(request.data.get("otp", "")).strip()
        if not session_id or len(otp) != 6:
            return Response({"detail": "service_session_id and 6-digit otp are required"}, status=400)

        with transaction.atomic():
            session = ServiceOtpSession.objects.select_for_update().filter(id=session_id, chef=partner.chef).first()
            if not session:
                return Response({"detail": "Service session not found"}, status=404)
            if session.status != ServiceOtpSession.STATUS_START_OTP:
                return Response({"detail": f"Start OTP is not pending. Current status is {session.status}"}, status=409)
            if session.start_otp != otp:
                return Response({"detail": "Invalid OTP"}, status=400)
            session.status = ServiceOtpSession.STATUS_IN_PROGRESS
            session.started_at = timezone.now()
            session.start_otp = ""
            session.save(update_fields=["status", "started_at", "start_otp", "updated_at"])
            invalidate_user_api_cache(session.user_id)

        return Response(
            {
                "detail": "Service started successfully.",
                "service_session": _service_session_payload(session, include_user_otp=False),
            }
        )


class ChefPartnerServiceJourneyStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        partner = _chef_partner_for_user(request.user)
        if not partner:
            return Response({"detail": "Chef partner profile not found"}, status=404)

        mode = str(request.data.get("mode", ServiceOtpSession.MODE_SUBSCRIPTION)).strip().lower()
        if mode != ServiceOtpSession.MODE_SUBSCRIPTION:
            return Response({"detail": "Journey start is supported only for subscription orders"}, status=400)

        subscription_id = request.data.get("subscription_id")
        meal = request.data.get("meal")
        service_date_raw = str(request.data.get("service_date", "")).strip()
        service_date = None
        if service_date_raw:
            try:
                service_date = date.fromisoformat(service_date_raw)
            except ValueError:
                return Response({"detail": "service_date must be YYYY-MM-DD"}, status=400)

        target, error_response = _service_target_for_chef(
            chef=partner.chef,
            mode=mode,
            subscription_id=subscription_id,
            request_id=None,
            meal=meal,
            service_date=service_date,
        )
        if error_response:
            return error_response

        with transaction.atomic():
            session = _get_or_create_service_session(target)
            if session.status == ServiceOtpSession.STATUS_COMPLETED:
                return Response({"detail": "Service is already completed"}, status=409)
            if not session.journey_started_at:
                session.journey_started_at = timezone.now()
                session.save(update_fields=["journey_started_at", "updated_at"])
                invalidate_user_api_cache(session.user_id)

        return Response(
            {
                "detail": "Journey started. User can now track your live location.",
                "service_session": _service_session_payload(session, include_user_otp=False),
            }
        )


class ChefPartnerServiceEndRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        partner = _chef_partner_for_user(request.user)
        if not partner:
            return Response({"detail": "Chef partner profile not found"}, status=404)

        session_id = request.data.get("service_session_id")
        if not session_id:
            return Response({"detail": "service_session_id is required"}, status=400)

        with transaction.atomic():
            session = ServiceOtpSession.objects.select_for_update().filter(id=session_id, chef=partner.chef).first()
            if not session:
                return Response({"detail": "Service session not found"}, status=404)
            if session.status != ServiceOtpSession.STATUS_IN_PROGRESS:
                return Response({"detail": f"Cannot complete service in status {session.status}"}, status=409)
            session.end_otp = _generate_otp()
            session.end_otp_generated_at = timezone.now()
            session.status = ServiceOtpSession.STATUS_END_OTP
            session.save(update_fields=["end_otp", "end_otp_generated_at", "status", "updated_at"])
            invalidate_user_api_cache(session.user_id)

        return Response(
            {
                "detail": "End OTP generated. Ask the user for OTP to complete service.",
                "service_session": _service_session_payload(session, include_user_otp=False),
            }
        )


class ChefPartnerServiceEndVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        partner = _chef_partner_for_user(request.user)
        if not partner:
            return Response({"detail": "Chef partner profile not found"}, status=404)

        session_id = request.data.get("service_session_id")
        otp = str(request.data.get("otp", "")).strip()
        if not session_id or len(otp) != 6:
            return Response({"detail": "service_session_id and 6-digit otp are required"}, status=400)

        with transaction.atomic():
            session = ServiceOtpSession.objects.select_for_update().filter(id=session_id, chef=partner.chef).first()
            if not session:
                return Response({"detail": "Service session not found"}, status=404)
            if session.status != ServiceOtpSession.STATUS_END_OTP:
                return Response({"detail": f"End OTP is not pending. Current status is {session.status}"}, status=409)
            if session.end_otp != otp:
                return Response({"detail": "Invalid OTP"}, status=400)
            session.status = ServiceOtpSession.STATUS_COMPLETED
            session.completed_at = timezone.now()
            session.end_otp = ""
            session.save(update_fields=["status", "completed_at", "end_otp", "updated_at"])
            invalidate_user_api_cache(session.user_id)

            if session.mode == ServiceOtpSession.MODE_INSTANT and session.instant_request_id:
                req = session.instant_request
                if req and req.accepted_chef_id:
                    InstantOrderHistory.objects.update_or_create(
                        instant_request=req,
                        defaults={
                            "user": req.user,
                            "chef": req.accepted_chef,
                            "service_session": session,
                            "service_started_at": session.started_at,
                            "service_completed_at": session.completed_at,
                            "request_latitude": req.request_latitude,
                            "request_longitude": req.request_longitude,
                            "notes": req.notes,
                        },
                    )

        return Response(
            {
                "detail": "Service completed successfully.",
                "service_session": _service_session_payload(session, include_user_otp=False),
            }
        )


class UserServiceOtpView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        active_sessions = (
            ServiceOtpSession.objects.filter(user=request.user)
            .exclude(status=ServiceOtpSession.STATUS_COMPLETED)
            .select_related("chef", "subscription", "instant_request")
            .order_by("-updated_at", "-id")[:20]
        )
        payload = []
        for session in active_sessions:
            item = _service_session_payload(session, include_user_otp=True)
            item["chef_name"] = session.chef.name
            payload.append(item)
        return Response({"service_sessions": payload})


class UserInstantOrderHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (
            InstantOrderHistory.objects.filter(user=request.user)
            .select_related("chef", "instant_request")
            .order_by("-service_completed_at", "-created_at")
        )
        payload = [
            {
                "id": item.id,
                "request_id": item.instant_request_id,
                "chef_id": item.chef_id,
                "chef_name": item.chef.name,
                "service_started_at": item.service_started_at.isoformat() if item.service_started_at else None,
                "service_completed_at": item.service_completed_at.isoformat() if item.service_completed_at else None,
                "request_latitude": float(item.request_latitude) if item.request_latitude is not None else None,
                "request_longitude": float(item.request_longitude) if item.request_longitude is not None else None,
                "notes": item.notes,
                "rating": item.rating,
                "comment": item.comment,
                "feedback_submitted": item.rating is not None,
            }
            for item in qs
        ]
        return Response({"history": payload})


class UserInstantOrderFeedbackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, history_id: int):
        entry = InstantOrderHistory.objects.filter(id=history_id, user=request.user).first()
        if not entry:
            return Response({"detail": "History item not found"}, status=404)

        rating_raw = request.data.get("rating")
        comment = str(request.data.get("comment", "")).strip()
        try:
            rating = int(rating_raw)
        except (TypeError, ValueError):
            return Response({"detail": "rating must be an integer between 1 and 5"}, status=400)
        if rating < 1 or rating > 5:
            return Response({"detail": "rating must be between 1 and 5"}, status=400)

        entry.rating = rating
        entry.comment = comment[:500]
        entry.save(update_fields=["rating", "comment", "updated_at"])
        return Response({"success": True, "id": entry.id, "rating": entry.rating, "comment": entry.comment})


def _subscription_unit_earning(subscription: Subscription) -> float:
    price = float(subscription.price or 0)
    if price <= 0:
        return 0.0
    meals = subscription.meal_type if isinstance(subscription.meal_type, list) else []
    meal_count = max(1, len(meals))
    total_days = (subscription.end_date - subscription.start_date).days + 1
    total_days = max(1, total_days)
    total_services = max(1, total_days * meal_count)
    return price / total_services


class ChefPartnerHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        partner = _chef_partner_for_user(request.user)
        if not partner:
            return Response({"detail": "Chef partner profile not found"}, status=404)

        chef = partner.chef
        completed_qs = (
            ServiceOtpSession.objects.filter(chef=chef, status=ServiceOtpSession.STATUS_COMPLETED)
            .select_related("user", "subscription", "instant_request")
            .order_by("-completed_at", "-updated_at", "-id")
        )
        completed_sessions = list(completed_qs[:200])

        subscription_earnings = 0.0
        instant_order_earning = float(getattr(settings, "CHEF_INSTANT_TRIP_EARNING_RUPEES", 0) or 0)
        instant_earnings = 0.0
        trips_payload = []

        for item in completed_sessions:
            earning = 0.0
            if item.mode == ServiceOtpSession.MODE_SUBSCRIPTION and item.subscription is not None:
                earning = _subscription_unit_earning(item.subscription)
                subscription_earnings += earning
            elif item.mode == ServiceOtpSession.MODE_INSTANT:
                earning = instant_order_earning
                instant_earnings += earning

            trips_payload.append(
                {
                    "service_session_id": item.id,
                    "mode": item.mode,
                    "user_id": item.user_id,
                    "username": item.user.username if item.user_id else "",
                    "service_date": item.service_date.isoformat() if item.service_date else None,
                    "meal": item.meal,
                    "wave": item.wave,
                    "started_at": item.started_at.isoformat() if item.started_at else None,
                    "completed_at": item.completed_at.isoformat() if item.completed_at else None,
                    "request_id": item.instant_request_id if item.mode == ServiceOtpSession.MODE_INSTANT else None,
                    "subscription_id": item.subscription_id if item.mode == ServiceOtpSession.MODE_SUBSCRIPTION else None,
                    "earning_rupees": round(earning, 2),
                }
            )

        instant_rating_stats = InstantOrderHistory.objects.filter(chef=chef, rating__isnull=False).aggregate(
            average=Avg("rating"),
            count=Count("id"),
        )
        subscription_rating_stats = Feedback.objects.filter(subscription__chef=chef).aggregate(
            average=Avg("rating"),
            count=Count("id"),
        )

        completed_subscriptions = sum(1 for item in completed_sessions if item.mode == ServiceOtpSession.MODE_SUBSCRIPTION)
        completed_instants = sum(1 for item in completed_sessions if item.mode == ServiceOtpSession.MODE_INSTANT)

        return Response(
            {
                "summary": {
                    "completed_trips": len(completed_sessions),
                    "completed_subscription_trips": completed_subscriptions,
                    "completed_instant_trips": completed_instants,
                    "earnings_rupees_total": round(subscription_earnings + instant_earnings, 2),
                    "earnings_rupees_subscription": round(subscription_earnings, 2),
                    "earnings_rupees_instant": round(instant_earnings, 2),
                    "instant_trip_earning_rupees": round(instant_order_earning, 2),
                    "rating_average_instant": round(float(instant_rating_stats["average"]), 2)
                    if instant_rating_stats["average"] is not None
                    else None,
                    "rating_count_instant": int(instant_rating_stats["count"] or 0),
                    "rating_average_subscription": round(float(subscription_rating_stats["average"]), 2)
                    if subscription_rating_stats["average"] is not None
                    else None,
                    "rating_count_subscription": int(subscription_rating_stats["count"] or 0),
                },
                "trips": trips_payload,
            }
        )


class ChefConsoleChefsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        chefs = Chef.objects.all().order_by("name", "id")
        return Response(ChefSerializer(chefs, many=True).data)


class ChefConsoleDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        chef_id = request.query_params.get("chef_id")
        if not chef_id:
            return Response({"detail": "chef_id is required"}, status=400)

        chef = Chef.objects.filter(id=chef_id).first()
        if not chef:
            return Response({"detail": "Chef not found"}, status=404)

        active_subscriptions = (
            Subscription.objects.filter(chef=chef, is_active=True)
            .select_related("user")
            .order_by("end_date", "id")
        )

        subscriptions_payload = []
        for sub in active_subscriptions:
            subscriptions_payload.append(
                {
                    "id": sub.id,
                    "user_id": sub.user_id,
                    "username": sub.user.username,
                    "meal_type": sub.meal_type,
                    "meal_wave": sub.meal_wave if isinstance(sub.meal_wave, dict) else {},
                    "start_date": str(sub.start_date),
                    "end_date": str(sub.end_date),
                    "price": int(sub.price or 0),
                    "delivery_latitude": float(sub.delivery_latitude) if sub.delivery_latitude is not None else None,
                    "delivery_longitude": float(sub.delivery_longitude) if sub.delivery_longitude is not None else None,
                }
            )

        now = timezone.now()
        pending_offers = (
            InstantChefOffer.objects.filter(
                chef=chef,
                status=InstantChefOffer.STATUS_PENDING,
                request__status=InstantChefRequest.STATUS_SEARCHING,
            )
            .select_related("request", "request__user")
            .order_by("expires_at", "id")
        )
        offers_payload = []
        for offer in pending_offers:
            seconds_left = None
            if offer.expires_at:
                seconds_left = max(0, int((offer.expires_at - now).total_seconds()))
            offers_payload.append(
                {
                    "offer_id": offer.id,
                    "request_id": offer.request_id,
                    "username": offer.request.user.username,
                    "distance_km": round(float(offer.distance_km), 2),
                    "status": offer.status,
                    "offered_at": offer.offered_at.isoformat() if offer.offered_at else None,
                    "expires_at": offer.expires_at.isoformat() if offer.expires_at else None,
                    "seconds_left": seconds_left,
                    "request_latitude": float(offer.request.request_latitude),
                    "request_longitude": float(offer.request.request_longitude),
                    "notes": offer.request.notes,
                }
            )

        payload = {
            "chef": ChefSerializer(chef).data,
            "stats": {
                "active_subscriptions": len(subscriptions_payload),
                "pending_instant_requests": len(offers_payload),
            },
            "subscriptions": subscriptions_payload,
            "pending_instant_offers": offers_payload,
        }
        return Response(payload)


class ChefConsoleAvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        chef_id = request.data.get("chef_id")
        is_available = request.data.get("is_available")
        if chef_id in (None, ""):
            return Response({"detail": "chef_id is required"}, status=400)
        if is_available in (None, ""):
            return Response({"detail": "is_available is required"}, status=400)

        chef = Chef.objects.filter(id=chef_id).first()
        if not chef:
            return Response({"detail": "Chef not found"}, status=404)

        if isinstance(is_available, str):
            is_available_normalized = is_available.strip().lower() in {"1", "true", "yes", "on"}
        else:
            is_available_normalized = bool(is_available)

        chef.is_available = is_available_normalized
        chef.save(update_fields=["is_available"])
        return Response({"success": True, "chef_id": chef.id, "is_available": chef.is_available})
