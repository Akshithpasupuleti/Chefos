from functools import lru_cache
from typing import List

# Priority list shown first when query is empty.
PRIORITY_CUISINES = [
    "North Indian",
    "South Indian",
    "Punjabi",
    "Tamil",
    "Kerala",
    "Andhra",
    "Karnataka",
    "Bengali",
    "Gujarati",
    "Maharashtrian",
    "Rajasthani",
    "Coastal Indian",
    "Chettinad",
    "Hyderabadi",
]

CUISINE_ALIASES = {
    "north indian": "North Indian",
    "south indian": "South Indian",
    "punjabi": "Punjabi",
    "tamil": "Tamil",
    "kerala": "Kerala",
    "malabar": "Kerala",
    "andhra": "Andhra",
    "telugu": "Andhra",
    "karnataka": "Karnataka",
    "bengali": "Bengali",
    "gujarati": "Gujarati",
    "maharashtrian": "Maharashtrian",
    "rajasthani": "Rajasthani",
    "coastal": "Coastal Indian",
    "coastal indian": "Coastal Indian",
    "chettinad": "Chettinad",
    "hyderabadi": "Hyderabadi",
}

CANONICAL_CUISINES = tuple(dict.fromkeys(PRIORITY_CUISINES + list(CUISINE_ALIASES.values())))
CANONICAL_LOWER = tuple(name.lower() for name in CANONICAL_CUISINES)


def normalize_cuisine_name(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    key = raw.lower()
    if key in CUISINE_ALIASES:
        return CUISINE_ALIASES[key]
    # Keep custom cuisine entered by user while normalizing spacing/case.
    return " ".join(part.capitalize() for part in raw.split())


@lru_cache(maxsize=256)
def _search_cached(normalized_query: str, limit: int) -> tuple[str, ...]:
    if not normalized_query:
        return CANONICAL_CUISINES[:limit]

    q = normalized_query
    starts_with = []
    contains = []

    for idx, lower_name in enumerate(CANONICAL_LOWER):
        if lower_name.startswith(q):
            starts_with.append(CANONICAL_CUISINES[idx])
        elif q in lower_name:
            contains.append(CANONICAL_CUISINES[idx])

    results = starts_with + contains
    if len(results) < limit:
        for alias, canonical_name in CUISINE_ALIASES.items():
            if q in alias and canonical_name not in results:
                results.append(canonical_name)
            if len(results) >= limit:
                break
    return tuple(results[:limit])


def search_cuisines(query: str, limit: int = 10) -> List[str]:
    q = " ".join((query or "").strip().lower().split())
    safe_limit = max(1, min(int(limit), 20))
    return list(_search_cached(q, safe_limit))
