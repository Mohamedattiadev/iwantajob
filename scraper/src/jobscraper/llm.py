"""Groq-only LLM client.

Single provider. If GROQ_API_KEY is not set, calls raise LLMError immediately.

Public surface preserved for callers:
  - generate(prompt, system=None, max_tokens=800, temperature=0.4, tier="high")
  - have_provider()
  - LLMError, LLMQuotaError

The `tier` arg is accepted for backwards compatibility but ignored — every
call goes to the same Groq model.
"""
from __future__ import annotations

import logging
import os

import httpx

from .config import HTTP_TIMEOUT

log = logging.getLogger("llm")

GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")


class LLMError(RuntimeError):
    pass


class LLMQuotaError(LLMError):
    """Raised on 429 / quota / rate-limit from Groq."""


def _have_groq() -> bool:
    return bool(os.environ.get("GROQ_API_KEY"))


def have_provider() -> bool:
    return _have_groq()


def generate(prompt: str, *, system: str | None = None, max_tokens: int = 800,
             temperature: float = 0.4, tier: str = "high") -> str:
    """Call Groq. Raises LLMError if no key, or on hard failure."""
    if not _have_groq():
        raise LLMError("GROQ_API_KEY not set (Groq is the only configured provider)")
    text = _groq_generate(prompt, system=system, max_tokens=max_tokens, temperature=temperature)
    log.info("llm: groq answered (tier=%s, %d chars)", tier, len(text))
    return text


def _groq_generate(prompt: str, *, system: str | None, max_tokens: int,
                   temperature: float) -> str:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise LLMError("GROQ_API_KEY not set")
    url = "https://api.groq.com/openai/v1/chat/completions"
    messages: list[dict] = []
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
            if r.status_code in (429, 500, 503, 504):
                raise LLMQuotaError(f"groq {r.status_code}: {r.text[:200]}")
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPStatusError as e:
        body = e.response.text or ""
        code = e.response.status_code
        if code in (429, 500, 503, 504) or "rate" in body.lower() or "unavailable" in body.lower() or "overloaded" in body.lower():
            raise LLMQuotaError(f"groq {code}: {body[:200]}") from e
        raise LLMError(f"groq http {code}: {body[:200]}") from e
    except httpx.HTTPError as e:
        raise LLMError(f"groq network: {e}") from e
    choices = data.get("choices") or []
    if not choices:
        raise LLMError("groq returned no choices")
    return (choices[0].get("message") or {}).get("content", "").strip()
