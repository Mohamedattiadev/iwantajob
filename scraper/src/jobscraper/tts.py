"""Server-side TTS via edge-tts (Microsoft Edge online voices).

Free, no API key, supports many neural voices including TR + AR.
Returns MP3 bytes or streams chunks as edge-tts produces them.
"""
from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator

import edge_tts

log = logging.getLogger("tts")

# Default neural voices per language.
VOICES: dict[str, str] = {
    "en": "en-US-AriaNeural",
    "tr": "tr-TR-EmelNeural",
    "ar": "ar-SA-HamedNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "es": "es-ES-ElviraNeural",
}


class TTSError(RuntimeError):
    pass


def have_provider() -> bool:
    return True  # edge-tts hits Microsoft's public endpoint — no key needed.


def synthesize(text: str, lang: str = "en", voice: str | None = None,
               rate: str = "+5%") -> bytes:
    """Render text → MP3 bytes. `rate` like "+0%" / "+10%" / "-10%"."""
    if not text or not text.strip():
        raise TTSError("empty text")
    v = voice or VOICES.get(lang, VOICES["en"])
    return asyncio.run(_render(text, v, rate))


async def _render(text: str, voice: str, rate: str) -> bytes:
    try:
        comm = edge_tts.Communicate(text, voice, rate=rate)
        chunks: list[bytes] = []
        async for ev in comm.stream():
            if ev.get("type") == "audio":
                chunks.append(ev.get("data", b""))
        return b"".join(chunks)
    except Exception as e:
        raise TTSError(f"edge-tts: {e}") from e


async def stream(text: str, lang: str = "en", voice: str | None = None,
                 rate: str = "+10%") -> AsyncIterator[bytes]:
    """Yield mp3 chunks as edge-tts generates them — lets the client start
    playing while later chunks are still being synthesized."""
    if not text or not text.strip():
        raise TTSError("empty text")
    v = voice or VOICES.get(lang, VOICES["en"])
    try:
        comm = edge_tts.Communicate(text, v, rate=rate)
        async for ev in comm.stream():
            if ev.get("type") == "audio":
                data = ev.get("data")
                if data:
                    yield data
    except Exception as e:
        raise TTSError(f"edge-tts: {e}") from e
