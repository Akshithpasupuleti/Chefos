import json
import os
from urllib import error, request


def _extract_json(raw_text: str) -> dict:
    text = (raw_text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.replace("json", "", 1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("AI response did not contain valid JSON")

    payload = text[start : end + 1]
    return json.loads(payload)


def _normalize_menu(data: dict) -> dict:
    normalized = {}
    for key in ("breakfast", "lunch", "dinner"):
        value = data.get(key, [])
        if isinstance(value, str):
            value = [item.strip() for item in value.split(",") if item.strip()]
        elif isinstance(value, list):
            value = [str(item).strip() for item in value if str(item).strip()]
        else:
            value = []
        normalized[key] = value
    return normalized


def _build_prompt(profile: dict, context: dict | None = None) -> str:
    context = context or {}
    extra_rules = []
    if context.get("week_label"):
        extra_rules.append(f"9) This menu is for {context['week_label']}; make it feel fresh for this specific week.")
    if context.get("previous_menu"):
        extra_rules.append(
            "10) Avoid repeating the exact same dishes from the previous week's menu unless the profile makes it necessary."
        )

    prompt = (
        "You are a clinical nutrition assistant. Create a practical Indian-style 7-day meal plan.\n"
        "Use these profile details exactly:\n"
        f"{json.dumps(profile, ensure_ascii=True)}\n\n"
        "Rules:\n"
        "1) Respect ALL profile fields strictly: goal, cuisine_style, allergies, age, gender, height_cm, weight_kg, target_weight_kg, activity_level, medical_conditions.\n"
        "2) Keep meals realistic for home cooking.\n"
        "3) Prioritize the requested cuisine_style strongly. If cuisine_style is North Indian or South Indian, menu should mostly reflect that cuisine.\n"
        "4) Adapt meal intensity to activity_level and body targets (target_weight_kg) where sensible.\n"
        "5) Include protein and fiber balance.\n"
        "6) If people_count is present and > 1, scale portion sizes or mention quantities to serve that many people.\n"
        "7) Return ONLY valid JSON with keys breakfast, lunch, dinner.\n"
        "8) Each key must map to an array of 7 short meal strings.\n"
    )
    if extra_rules:
        prompt += "".join(rule + "\n" for rule in extra_rules)
    if context.get("previous_menu"):
        prompt += (
            "\nPrevious week's menu to avoid repeating too closely:\n"
            f"{json.dumps(context['previous_menu'], ensure_ascii=True)}\n"
        )
    return prompt


def _call_openai(prompt: str) -> dict:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not set")

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    body = {
        "model": model,
        "temperature": 0.4,
        "messages": [
            {"role": "system", "content": "Return only strict JSON."},
            {"role": "user", "content": prompt},
        ],
    }
    req = request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=40) as response:
        payload = json.loads(response.read().decode("utf-8"))

    content = payload["choices"][0]["message"]["content"]
    return _normalize_menu(_extract_json(content))


def _call_gemini(prompt: str) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set")

    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4},
    }
    req = request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=40) as response:
        payload = json.loads(response.read().decode("utf-8"))

    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    return _normalize_menu(_extract_json(text))


def _call_deepseek(prompt: str) -> dict:
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

    # OpenRouter-style model IDs, e.g. "deepseek/deepseek-v3.2".
    if "/" in model or ":" in model:
        return _call_openrouter(prompt, model)

    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise ValueError("DEEPSEEK_API_KEY is not set")

    body = {
        "model": model,
        "temperature": 0.4,
        "messages": [
            {"role": "system", "content": "Return only strict JSON."},
            {"role": "user", "content": prompt},
        ],
    }
    req = request.Request(
        "https://api.deepseek.com/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=40) as response:
        payload = json.loads(response.read().decode("utf-8"))

    content = payload["choices"][0]["message"]["content"]
    return _normalize_menu(_extract_json(content))


def _call_openrouter(prompt: str, model: str | None = None) -> dict:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY is not set")

    model = model or os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-v3.2")
    body = {
        "model": model,
        "temperature": 0.4,
        "messages": [
            {"role": "system", "content": "Return only strict JSON."},
            {"role": "user", "content": prompt},
        ],
    }
    req = request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=40) as response:
        payload = json.loads(response.read().decode("utf-8"))

    content = payload["choices"][0]["message"]["content"]
    return _normalize_menu(_extract_json(content))


def _fallback_menu(profile: dict, context: dict | None = None) -> dict:
    context = context or {}
    veg_breakfast = ["Vegetable oats", "Moong chilla", "Idli sambar", "Poha", "Upma", "Paneer sandwich", "Fruit + yogurt"]
    veg_lunch = ["Dal rice salad", "Rajma rice", "Chapati paneer sabzi", "Sambar rice", "Khichdi curd", "Chole roti", "Millet bowl"]
    veg_dinner = ["Chapati + mixed veg", "Paneer bhurji + roti", "Soup + stir-fry", "Dal + quinoa", "Vegetable pulao", "Besan chilla", "Curd rice"]
    nv_breakfast = ["Egg bhurji toast", "Oats + boiled eggs", "Veg omelette", "Poha + eggs", "Greek yogurt bowl", "Egg sandwich", "Fruit + nuts"]
    nv_lunch = ["Grilled chicken + rice", "Fish curry + rice", "Egg curry + roti", "Chicken stew + millet", "Tuna salad bowl", "Chicken khichdi", "Prawn curry + rice"]
    nv_dinner = ["Chicken soup + sauteed veg", "Fish + stir-fry", "Egg wrap + salad", "Chicken tikka + roti", "Dal + grilled fish", "Paneer + egg scramble", "Lean curry + roti"]

    food_type = str(profile.get("food_type", "")).lower()
    is_non_veg = "non" in food_type or "egg" in food_type
    menu = {
        "breakfast": nv_breakfast if is_non_veg else veg_breakfast,
        "lunch": nv_lunch if is_non_veg else veg_lunch,
        "dinner": nv_dinner if is_non_veg else veg_dinner,
    }

    allergies = str(profile.get("allergies", "")).lower()
    if "peanut" in allergies:
        for key in menu:
            menu[key] = [item.replace("nuts", "seeds") for item in menu[key]]

    week_number = int(context.get("week_number") or 0)
    if week_number:
        for key in menu:
            items = menu[key]
            if not items:
                continue
            rotation = week_number % len(items)
            menu[key] = items[rotation:] + items[:rotation]

    return menu


def generate_menu_with_ai(profile: dict, context: dict | None = None) -> dict:
    provider = os.getenv("AI_PROVIDER", "openrouter").lower().strip()
    strict_mode = os.getenv("AI_STRICT_MODE", "false").strip().lower() in {"1", "true", "yes", "on"}
    prompt = _build_prompt(profile, context=context)
    attempts = []

    # For your requested default behavior we always try this order first.
    if provider in {"", "auto", "openrouter"}:
        chain = ["openrouter", "openai", "deepseek"]
    elif provider == "openai":
        chain = ["openai", "deepseek"]
    elif provider == "deepseek":
        chain = ["deepseek"]
    elif provider == "gemini":
        chain = ["gemini", "openrouter", "openai", "deepseek"]
    else:
        chain = ["openrouter", "openai", "deepseek"]

    for item in chain:
        try:
            if item == "openrouter":
                model = os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-v3.2")
                menu = _call_openrouter(prompt, model)
            elif item == "openai":
                menu = _call_openai(prompt)
            elif item == "deepseek":
                menu = _call_deepseek(prompt)
            else:
                menu = _call_gemini(prompt)

            attempts.append({"provider": item, "status": "success"})
            return {
                "menu": menu,
                "provider": item,
                "used_fallback": False,
                "error": None,
                "attempts": attempts,
            }
        except (ValueError, KeyError, IndexError, json.JSONDecodeError, error.URLError) as exc:
            attempts.append({"provider": item, "status": "failed", "error": str(exc)})

    combined_error = " | ".join(
        f"{item['provider']}: {item['error']}" for item in attempts if item.get("error")
    ) or "AI generation failed"
    if strict_mode:
        raise ValueError(combined_error)
    return {
        "menu": _fallback_menu(profile, context=context),
        "provider": provider or "openrouter",
        "used_fallback": True,
        "error": combined_error,
        "attempts": attempts,
    }
