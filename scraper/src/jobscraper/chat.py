"""Gemini-powered chat assistant (Google AI Studio free tier)."""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

from .config import HTTP_TIMEOUT
from .profile import load as load_profile

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{MODEL}:generateContent"
)


def have_key() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))


def _system_prompt(market: dict[str, Any]) -> str:
    profile = load_profile()
    return f"""You are the user's personal career coach inside their jobscraper dashboard.
Be terse and concrete. No fluff. Recommend specific next actions tied to the data below.

USER PROFILE (live):
{json.dumps(profile, indent=2)}

JOB MARKET SNAPSHOT (live):
{json.dumps(market, indent=2)}

Rules:
- Reference specific skills, jobs, or numbers from the data above.
- Suggest concrete next steps: "go rate Docker", "open job #ID", "add this bullet to your CV".
- Never invent skills, jobs, or numbers the data does not show.
- If the user is unrated on many skills, push them to /learn first.
- Reply in same language as user."""


def chat(messages: list[dict[str, str]], market_snapshot: dict[str, Any]) -> dict[str, Any]:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        return {
            "error": "GEMINI_API_KEY not set on the backend. "
                     "Get a free key at https://aistudio.google.com/apikey and restart the server with it.",
        }

    # Convert OpenAI-style messages → Gemini "contents" (role: user|model).
    contents: list[dict[str, Any]] = []
    for m in messages:
        role = m.get("role")
        text = m.get("content") or ""
        if not text:
            continue
        if role == "user":
            contents.append({"role": "user", "parts": [{"text": text}]})
        elif role == "assistant":
            contents.append({"role": "model", "parts": [{"text": text}]})

    payload = {
        "systemInstruction": {"parts": [{"text": _system_prompt(market_snapshot)}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 600,
            # Disable thinking phase (Gemini 2.5) — 5–10x faster, fine for chat.
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as c:
            r = c.post(ENDPOINT, params={"key": key}, json=payload)
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPStatusError as e:
        return {"error": f"Gemini API error: {e.response.status_code} — {e.response.text[:300]}"}
    except httpx.HTTPError as e:
        return {"error": f"network error: {e}"}

    text = ""
    candidates = data.get("candidates") or []
    if candidates:
        parts = (candidates[0].get("content") or {}).get("parts") or []
        for p in parts:
            if "text" in p:
                text += p["text"]

    return {
        "text": text,
        "model": MODEL,
        "usage": data.get("usageMetadata"),
    }
