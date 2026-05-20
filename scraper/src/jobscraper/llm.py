"""Multi-provider LLM with tier-based routing + quota fallback.

Tiers:
  - "cheap": short, frequent calls (briefs, digests, autoscan). Prefers Groq (free,
    fast). Falls back to Gemini flash.
  - "high":  user-facing reasoning (chat tool loop, interview, CV rewrite). Prefers
    Gemini flash. Falls back to Groq.

Entry point: generate(prompt, system=None, max_tokens=800, temperature=0.4, tier="high")

On 429 / quota error, the chain advances automatically. Telemetry logs which
provider answered.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Callable

import httpx

from .config import HTTP_TIMEOUT

log = logging.getLogger("llm")

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
GEMINI_MODEL_FALLBACK = os.environ.get("GEMINI_MODEL_FALLBACK", "gemini-2.5-flash")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")


class LLMError(RuntimeError):
    pass


class LLMQuotaError(LLMError):
    """Raised on 429 / quota / rate-limit — triggers fallback to next provider."""


def _have_gemini() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))


def _have_groq() -> bool:
    return bool(os.environ.get("GROQ_API_KEY"))


def have_provider() -> bool:
    return _have_gemini() or _have_groq()


def generate(prompt: str, *, system: str | None = None, max_tokens: int = 800,
             temperature: float = 0.4, tier: str = "high") -> str:
    """Try providers in the order dictated by tier, falling back on quota errors."""
    chain = _chain_for(tier)
    if not chain:
        raise LLMError("no LLM provider configured (set GEMINI_API_KEY or GROQ_API_KEY)")
    last_err: Exception | None = None
    for name, fn in chain:
        try:
            text = fn(prompt, system=system, max_tokens=max_tokens, temperature=temperature)
            log.info("llm: %s answered (tier=%s, %d chars)", name, tier, len(text))
            return text
        except LLMQuotaError as e:
            log.warning("llm: %s quota hit — falling back: %s", name, e)
            last_err = e
            continue
        except LLMError as e:
            log.warning("llm: %s failed: %s", name, e)
            last_err = e
            continue
    raise LLMError(f"all providers failed (last: {last_err})")


def _chain_for(tier: str) -> list[tuple[str, Callable]]:
    chain: list[tuple[str, Callable]] = []
    if tier == "cheap":
        if _have_groq():   chain.append(("groq", _groq_generate))
        if _have_gemini(): chain.append(("gemini-lite", _gemini_lite_generate))
        if _have_gemini(): chain.append(("gemini-flash", _gemini_flash_generate))
    else:  # "high"
        if _have_gemini(): chain.append(("gemini-flash", _gemini_flash_generate))
        if _have_gemini(): chain.append(("gemini-lite", _gemini_lite_generate))
        if _have_groq():   chain.append(("groq", _groq_generate))
    return chain


# ── Gemini ────────────────────────────────────────────────────────────────

def _gemini_call(model: str, prompt: str, *, system: str | None, max_tokens: int,
                 temperature: float) -> str:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise LLMError("GEMINI_API_KEY not set")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload: dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as c:
            r = c.post(url, params={"key": key}, json=payload)
            if r.status_code == 429:
                raise LLMQuotaError(f"gemini/{model} 429: {r.text[:200]}")
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPStatusError as e:
        body = e.response.text or ""
        if e.response.status_code == 429 or "quota" in body.lower() or "rate" in body.lower():
            raise LLMQuotaError(f"gemini/{model}: {body[:200]}") from e
        raise LLMError(f"gemini/{model} http {e.response.status_code}: {body[:200]}") from e
    except httpx.HTTPError as e:
        raise LLMError(f"gemini/{model} network: {e}") from e
    text = ""
    for cand in data.get("candidates") or []:
        for p in (cand.get("content") or {}).get("parts") or []:
            if "text" in p:
                text += p["text"]
    return text.strip()


def _gemini_lite_generate(prompt: str, **kw) -> str:
    return _gemini_call(GEMINI_MODEL, prompt, **kw)


def _gemini_flash_generate(prompt: str, **kw) -> str:
    return _gemini_call(GEMINI_MODEL_FALLBACK, prompt, **kw)


# ── Groq (OpenAI-compatible) ──────────────────────────────────────────────

def _groq_generate(prompt: str, *, system: str | None, max_tokens: int,
                   temperature: float) -> str:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise LLMError("GROQ_API_KEY not set")
    url = "https://api.groq.com/openai/v1/chat/completions"
    messages: list[dict[str, Any]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as c:
            r = c.post(url, headers={"Authorization": f"Bearer {key}"}, json=payload)
            if r.status_code == 429:
                raise LLMQuotaError(f"groq 429: {r.text[:200]}")
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPStatusError as e:
        body = e.response.text or ""
        if e.response.status_code == 429 or "rate" in body.lower():
            raise LLMQuotaError(f"groq: {body[:200]}") from e
        raise LLMError(f"groq http {e.response.status_code}: {body[:200]}") from e
    except httpx.HTTPError as e:
        raise LLMError(f"groq network: {e}") from e
    choices = data.get("choices") or []
    if not choices:
        raise LLMError("groq returned no choices")
    return (choices[0].get("message") or {}).get("content", "").strip()
