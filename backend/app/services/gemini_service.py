"""AI provider layer. Groq (OpenAI-compatible) and Google Gemini are supported; the API keys stay on the server."""
import time

import httpx

from app.core.config import settings

SYSTEM_PROMPT = (
    "You are the CrisisTwin AI assistant for a Balochistan disaster-management prototype. "
    "Answer in the user's requested language (English or Urdu). Use ONLY the JSON context provided for any "
    "statement about districts, risk assessments, simulations or resources. If the context lacks the answer, say so. "
    "Phone numbers may come ONLY from the context (official_helplines, hospital_directory_from_health_department, resources); mention each number's confidence and that numbers must be confirmed before relying on them. Never invent phone numbers, locations, official warnings or database records. Say clearly when you are unsure. "
    "Simulation outputs are hypothetical indicators, not forecasts. Keep answers clear and well organised, with short "
    "paragraphs or bullet points for steps. For emergencies, advise contacting local authorities and rescue services."
)
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


class AIUnavailable(Exception):
    pass


class AIFailure(Exception):
    pass


def active_provider() -> str | None:
    """Which provider will answer, or None if nothing is configured."""
    p = settings.ai_provider.lower()
    if p == "groq":
        return "groq" if settings.groq_api_key else None
    if p == "gemini":
        return "gemini" if settings.gemini_api_key else None
    if settings.groq_api_key:
        return "groq"
    return "gemini" if settings.gemini_api_key else None


def _post(url: str, **kw) -> httpx.Response:
    """POST with one retry on rate-limit / transient server errors."""
    for attempt in (0, 1):
        r = httpx.post(url, timeout=30, **kw)
        if r.status_code in (429, 500, 502, 503) and attempt == 0:
            time.sleep(1.5)
            continue
        r.raise_for_status()
        return r
    raise AssertionError("unreachable")


def _call_groq(prompt: str) -> str:
    r = _post(GROQ_URL, headers={"Authorization": f"Bearer {settings.groq_api_key}"}, json={
        "model": settings.groq_model, "temperature": 0.2, "max_tokens": 900,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}]})
    return r.json()["choices"][0]["message"]["content"]


def _call_gemini(prompt: str) -> str:
    r = _post(GEMINI_URL.format(model=settings.gemini_model), headers={"x-goog-api-key": settings.gemini_api_key or ""}, json={
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "generationConfig": {"temperature": 0.2},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}]})
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


def call_ai(prompt: str) -> str:
    provider = active_provider()
    if provider is None:
        raise AIUnavailable("AI assistant is not configured")
    try:
        text = _call_groq(prompt) if provider == "groq" else _call_gemini(prompt)
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError) as exc:
        raise AIFailure("AI provider request failed") from exc
    if not text or not text.strip():
        raise AIFailure("AI provider returned an empty answer")
    return text
