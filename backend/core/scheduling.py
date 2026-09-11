from math import asin, cos, radians, sin, sqrt

from .models import ChefWavePolicy, Subscription

MEAL_WAVES = {
    "breakfast": ("B1", "B2", "B3", "B4", "B5"),
    "lunch": ("L1", "L2", "L3", "L4", "L5"),
    "dinner": ("D1", "D2", "D3", "D4", "D5"),
}

WAVE_TIME_LABELS = {
    "breakfast": {
        "B1": "06:00 - 07:20",
        "B2": "07:30 - 08:50",
        "B3": "09:00 - 10:20",
        "B4": "10:30 - 11:30",
        "B5": "11:30 - 12:30",
    },
    "lunch": {
        "L1": "12:00 - 13:20",
        "L2": "13:30 - 14:50",
        "L3": "15:00 - 16:20",
        "L4": "16:30 - 17:30",
        "L5": "17:30 - 18:30",
    },
    "dinner": {
        "D1": "18:30 - 19:50",
        "D2": "20:00 - 21:20",
        "D3": "21:30 - 22:50",
        "D4": "23:00 - 23:59",
        "D5": "00:00 - 01:00",
    },
}

DEFAULT_WAVE_FOR_MEAL = {
    "breakfast": "B2",
    "lunch": "L2",
    "dinner": "D2",
}


def default_available_waves():
    return {
        "breakfast": ["B1", "B2", "B3"],
        "lunch": ["L1", "L2", "L3"],
        "dinner": ["D1", "D2", "D3"],
    }


def default_custom_wave_labels():
    return {meal: dict(labels) for meal, labels in WAVE_TIME_LABELS.items()}


def normalize_meal_type(meal_type):
    if isinstance(meal_type, list):
        return [str(item).strip().lower() for item in meal_type if str(item).strip()]
    if isinstance(meal_type, str) and meal_type.strip():
        return [meal_type.strip().lower()]
    return []


def normalize_meal_wave(meal_wave, meal_list):
    wave_map = meal_wave if isinstance(meal_wave, dict) else {}
    normalized = {}
    for meal in meal_list:
        waves = MEAL_WAVES.get(meal, ())
        selected = str(wave_map.get(meal, "")).strip().upper()
        if selected in waves:
            normalized[meal] = selected
        else:
            normalized[meal] = DEFAULT_WAVE_FOR_MEAL.get(meal, "")
    return normalized


def normalize_custom_wave_labels(raw_labels):
    raw = raw_labels if isinstance(raw_labels, dict) else {}
    normalized = {}
    for meal, waves in MEAL_WAVES.items():
        per_meal_raw = raw.get(meal, {})
        if not isinstance(per_meal_raw, dict):
            per_meal_raw = {}
        normalized[meal] = {}
        for wave in waves:
            label = str(per_meal_raw.get(wave, "")).strip()
            if not label:
                label = WAVE_TIME_LABELS.get(meal, {}).get(wave, wave)
            normalized[meal][wave] = label
    return normalized


def wave_time_label(meal, wave, chef=None):
    if chef is not None:
        policy = get_chef_policy(chef)
        custom = normalize_custom_wave_labels(getattr(policy, "custom_wave_labels", {}))
        label = custom.get(meal, {}).get(wave)
        if label:
            return label
    return WAVE_TIME_LABELS.get(meal, {}).get(wave, wave)


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return r * c


def _overlap_qs(start_date, end_date):
    return Subscription.objects.filter(
        is_active=True,
        start_date__lte=end_date,
        end_date__gte=start_date,
    )


def get_chef_policy(chef):
    policy, _ = ChefWavePolicy.objects.get_or_create(
        chef=chef,
        defaults={
            "base_subscription_capacity": 3,
            "max_wave_capacity": 5,
            "allow_ondemand_extra": True,
            "available_waves": default_available_waves(),
            "custom_wave_labels": default_custom_wave_labels(),
        },
    )
    updates = []
    if not isinstance(policy.available_waves, dict) or not policy.available_waves:
        policy.available_waves = default_available_waves()
        updates.append("available_waves")
    if not isinstance(getattr(policy, "custom_wave_labels", None), dict) or not policy.custom_wave_labels:
        policy.custom_wave_labels = default_custom_wave_labels()
        updates.append("custom_wave_labels")
    if updates:
        policy.save(update_fields=updates)
    return policy


def normalize_available_waves(raw_available):
    normalized = {}
    raw = raw_available if isinstance(raw_available, dict) else {}
    for meal, waves in MEAL_WAVES.items():
        raw_list = raw.get(meal, [])
        if not isinstance(raw_list, list):
            raw_list = []
        cleaned = []
        for wave in raw_list:
            wave_code = str(wave or "").strip().upper()
            if wave_code in waves and wave_code not in cleaned:
                cleaned.append(wave_code)
        normalized[meal] = cleaned
    return normalized


def enabled_waves_for_meal(chef, meal):
    policy = get_chef_policy(chef)
    available = normalize_available_waves(policy.available_waves)
    allowed = available.get(meal, [])
    return tuple(allowed)


def subscription_wave_load(chef, meal, wave, start_date, end_date, exclude_subscription_id=None):
    qs = _overlap_qs(start_date, end_date).filter(chef=chef)
    if exclude_subscription_id:
        qs = qs.exclude(id=exclude_subscription_id)

    count = 0
    for sub in qs:
        meals = normalize_meal_type(sub.meal_type)
        if meal not in meals:
            continue
        wave_map = sub.meal_wave if isinstance(sub.meal_wave, dict) else {}
        if str(wave_map.get(meal, "")).upper() == wave:
            count += 1
    return count


def evaluate_subscription_capacity(chef, meal, wave, start_date, end_date, exclude_subscription_id=None):
    policy = get_chef_policy(chef)
    enabled_waves = enabled_waves_for_meal(chef, meal)
    if wave not in enabled_waves:
        return {
            "policy_base_limit": max(1, min(policy.base_subscription_capacity, policy.max_wave_capacity)),
            "current_load": 0,
            "allowed_capacity": 0,
            "can_accept": False,
            "disabled_by_chef": True,
        }
    # Strict booking rule: a chef can have only one active subscriber per meal wave slot.
    base_limit = 1
    current = subscription_wave_load(
        chef=chef,
        meal=meal,
        wave=wave,
        start_date=start_date,
        end_date=end_date,
        exclude_subscription_id=exclude_subscription_id,
    )
    return {
        "policy_base_limit": base_limit,
        "current_load": current,
        "allowed_capacity": base_limit,
        "can_accept": current < base_limit,
        "disabled_by_chef": False,
    }


def evaluate_ondemand_capacity(chef, meal, wave, schedule_date, candidate_lat=None, candidate_lng=None):
    policy = get_chef_policy(chef)
    enabled_waves = enabled_waves_for_meal(chef, meal)
    if wave not in enabled_waves:
        return {
            "policy_base_limit": max(1, min(policy.base_subscription_capacity, policy.max_wave_capacity)),
            "policy_max_limit": max(1, min(policy.max_wave_capacity, 5)),
            "current_subscription_load": 0,
            "allowed_capacity": 0,
            "remaining_for_ondemand": 0,
            "can_accept_ondemand": False,
            "disabled_by_chef": True,
        }
    base_limit = max(1, min(policy.base_subscription_capacity, policy.max_wave_capacity))
    max_limit = max(base_limit, min(policy.max_wave_capacity, 5))

    sub_count = subscription_wave_load(
        chef=chef,
        meal=meal,
        wave=wave,
        start_date=schedule_date,
        end_date=schedule_date,
    )

    if not policy.allow_ondemand_extra:
        dynamic_limit = base_limit
    else:
        points = []
        active_qs = _overlap_qs(schedule_date, schedule_date).filter(chef=chef)
        for sub in active_qs:
            meals = normalize_meal_type(sub.meal_type)
            if meal not in meals:
                continue
            wave_map = sub.meal_wave if isinstance(sub.meal_wave, dict) else {}
            if str(wave_map.get(meal, "")).upper() != wave:
                continue
            if sub.delivery_latitude is None or sub.delivery_longitude is None:
                continue
            points.append((float(sub.delivery_latitude), float(sub.delivery_longitude)))

        if candidate_lat is not None and candidate_lng is not None:
            points.append((float(candidate_lat), float(candidate_lng)))

        close_3 = 0
        close_5 = 0
        for lat, lng in points:
            if chef.latitude is None or chef.longitude is None:
                break
            d = _haversine_km(float(chef.latitude), float(chef.longitude), lat, lng)
            if d <= 3:
                close_3 += 1
            if d <= 5:
                close_5 += 1

        dynamic_limit = base_limit
        if close_5 >= 4 and close_3 >= 3:
            dynamic_limit = min(max_limit, 5)
        elif close_5 >= 3 and close_3 >= 2:
            dynamic_limit = min(max_limit, 4)

    return {
        "policy_base_limit": base_limit,
        "policy_max_limit": max_limit,
        "current_subscription_load": sub_count,
        "allowed_capacity": dynamic_limit,
        "remaining_for_ondemand": max(0, dynamic_limit - sub_count),
        "can_accept_ondemand": sub_count < dynamic_limit,
        "disabled_by_chef": False,
    }
