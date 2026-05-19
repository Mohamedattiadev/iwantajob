"""Anthropic-powered chat assistant. Streams not enabled for simplicity."""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

from .config import HTTP_TIMEOUT
from .profile import load as load_profile

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-haiku-4-5-20251001"  # fast + cheap; bump to sonnet for harder Qs


def have_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


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
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return {
            "error": "ANTHROPIC_API_KEY not set on the backend. "
                     "Get a key at https://console.anthropic.com and restart the server with it.",
        }

    # Convert any user/assistant turns into Anthropic format
    msgs = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]

    payload = {
        "model": MODEL,
        "max_tokens": 700,
        "system": _system_prompt(market_snapshot),
        "messages": msgs,
    }
    headers = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as c:
            r = c.post(API_URL, json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPStatusError as e:
        return {"error": f"Anthropic API error: {e.response.status_code} — {e.response.text[:200]}"}
    except httpx.HTTPError as e:
        return {"error": f"network error: {e}"}

    text = ""
    for block in data.get("content", []):
        if block.get("type") == "text":
            text += block.get("text", "")

    return {
        "text": text,
        "model": data.get("model"),
        "usage": data.get("usage"),
    }
