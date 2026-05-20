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


def rewrite(field: str, raw: str, instruction: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """Polish a CV field. field=summary|experience|project|education|generic."""
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        return {"error": "GEMINI_API_KEY not set on the backend."}

    profile = load_profile()
    style_by_field = {
        "summary": "1 paragraph, 2-3 sentences, first-person implicit (no 'I'), concrete strengths, end with a value statement. No buzzwords.",
        "experience": "Lead with role + company + dates on line 1. Then 3-5 bullets starting with strong action verbs (Built, Shipped, Led, Reduced). Quantify when possible. Each bullet ≤ 18 words.",
        "project": "Project name + 1-line pitch. Then 2-3 bullets: what it does, tech stack, outcome/metric. ≤ 18 words per bullet.",
        "education": "School — Degree, dates. One line. Add GPA or honors only if present.",
        "generic": "Tight, professional, ATS-friendly. No fluff.",
    }
    style = style_by_field.get(field, style_by_field["generic"])

    prompt = f"""You are polishing a single CV field for an ATS-clean resume.

FIELD TYPE: {field}
USER DRAFT / NOTES: {raw or '(empty — generate from instruction + context)'}
USER INSTRUCTION: {instruction or '(none — just polish the draft)'}

STYLE RULES FOR THIS FIELD:
{style}

CONTEXT (other CV data — reference for tone consistency, do not duplicate):
{json.dumps({k: profile.get(k) for k in ('personal', 'skills') if k in profile}, indent=2)[:1500]}

CONSTRAINTS:
- Output ONLY the polished CV text. No preamble, no markdown headers, no quotes around the result.
- Same language as the user instruction or draft.
- Never invent specific numbers, employers, or dates the user did not mention.
- Be human, not robotic. Vary sentence rhythm.
"""

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 500,
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

    return {"text": text.strip(), "model": MODEL}
