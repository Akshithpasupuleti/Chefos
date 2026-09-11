from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone


def cache_key_menu_preference(user_id: int) -> str:
    return f"api:user:{user_id}:menu_preference:v1"


def cache_key_weekly_menu(user_id: int) -> str:
    return f"api:user:{user_id}:weekly_menu:v1"


def cache_key_today_menu(user_id: int, day_iso: str) -> str:
    return f"api:user:{user_id}:today_menu:{day_iso}:v2"


def cache_key_active_subscription(user_id: int) -> str:
    return f"api:user:{user_id}:active_subscription:v1"


def cache_key_assigned_chef(user_id: int) -> str:
    return f"api:user:{user_id}:assigned_chef:v1"


CHEF_LIST_VERSION_KEY = "api:chef:list:version"


def cache_key_chef_list(suffix: str = "all") -> str:
    version = int(cache.get(CHEF_LIST_VERSION_KEY, 1))
    return f"api:chef:list:v{version}:{suffix}"


def invalidate_chef_list_cache() -> None:
    current = int(cache.get(CHEF_LIST_VERSION_KEY, 1))
    cache.set(CHEF_LIST_VERSION_KEY, current + 1, None)


def invalidate_user_api_cache(user_id: int) -> None:
    keys = [
        cache_key_menu_preference(user_id),
        cache_key_weekly_menu(user_id),
        cache_key_active_subscription(user_id),
        cache_key_assigned_chef(user_id),
    ]
    today = timezone.localdate()
    for delta_days in (-1, 0, 1):
        day = today + timedelta(days=delta_days)
        keys.append(cache_key_today_menu(user_id, day.isoformat()))
    cache.delete_many(keys)
