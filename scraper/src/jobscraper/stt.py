"""Server-side speech-to-text via Groq Whisper.

Browser SpeechRecognition is fragile (Chrome-only; Brave blocks Google STT
backend → 'network' error). MediaRecorder + this endpoint is provider-neutral.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from .config import HTTP_TIMEOUT

log = logging.getLogger("stt")

GROQ_WHISPER_MODEL = os.environ.get("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo")


class STTError(RuntimeError):
    pass


def have_provider() -> bool:
    return bool(os.environ.get("GROQ_API_KEY"))


def transcribe(audio_bytes: bytes, filename: str = "audio.webm", lang: str | None = None) -> dict[str, Any]:
    """Returns {text, duration?, language?}."""
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise STTError("GROQ_API_KEY not set")
    if not audio_bytes:
        raise STTError("empty audio")

    data: dict[str, Any] = {
        "model": GROQ_WHISPER_MODEL,
        "response_format": "verbose_json",
        "temperature": "0",
    }
    if lang and lang in {"en", "tr", "ar", "fr", "de", "es", "it", "pt", "ru", "zh", "ja", "ko"}:
        data["language"] = lang

    files = {"file": (filename, audio_bytes, _guess_mime(filename))}
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as c:
            r = c.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                data=data,
                files=files,
            )
            if r.status_code >= 400:
                raise STTError(f"groq whisper {r.status_code}: {r.text[:300]}")
            j = r.json()
    except httpx.HTTPError as e:
        raise STTError(f"network: {e}") from e

    return {
        "text": (j.get("text") or "").strip(),
        "duration": j.get("duration"),
        "language": j.get("language"),
    }


def _guess_mime(filename: str) -> str:
    fn = filename.lower()
    if fn.endswith(".webm"): return "audio/webm"
    if fn.endswith(".ogg"):  return "audio/ogg"
    if fn.endswith(".mp3"):  return "audio/mpeg"
    if fn.endswith(".m4a"):  return "audio/m4a"
    if fn.endswith(".wav"):  return "audio/wav"
    if fn.endswith(".mp4"):  return "audio/mp4"
    return "application/octet-stream"
