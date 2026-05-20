"""Minimal Telegram Bot API wrapper. No external dep beyond httpx.

Supports: send_message (with topic threading + inline keyboard), edit_message_text,
answer_callback_query, long-polling get_updates. Designed for forum-style groups
where each topic = a thread_id.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Iterable

import httpx

log = logging.getLogger("telegram")


class TelegramError(RuntimeError):
    pass


def have_config() -> bool:
    return bool(os.environ.get("TELEGRAM_BOT_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID"))


class Telegram:
    def __init__(self, token: str | None = None, chat_id: str | None = None):
        self.token = token or os.environ.get("TELEGRAM_BOT_TOKEN")
        self.chat_id = chat_id or os.environ.get("TELEGRAM_CHAT_ID")
        if not self.token:
            raise TelegramError("TELEGRAM_BOT_TOKEN not set")
        self.base = f"https://api.telegram.org/bot{self.token}"

    def _post(self, method: str, payload: dict[str, Any], *, timeout: float = 15.0) -> dict[str, Any]:
        try:
            with httpx.Client(timeout=timeout) as c:
                r = c.post(f"{self.base}/{method}", json=payload)
                data = r.json()
        except httpx.HTTPError as e:
            raise TelegramError(f"network: {e}") from e
        if not data.get("ok"):
            raise TelegramError(f"{method} failed: {data.get('description')}")
        return data.get("result") or {}

    def send_message(self, text: str, *, chat_id: str | int | None = None,
                     topic_id: int | None = None, reply_markup: dict | None = None,
                     parse_mode: str = "HTML", disable_preview: bool = True) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "chat_id": chat_id or self.chat_id,
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": disable_preview,
        }
        if topic_id is not None:
            payload["message_thread_id"] = topic_id
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        return self._post("sendMessage", payload)

    def edit_message_text(self, *, chat_id: str | int, message_id: int, text: str,
                          reply_markup: dict | None = None, parse_mode: str = "HTML") -> dict[str, Any]:
        payload: dict[str, Any] = {
            "chat_id": chat_id, "message_id": message_id,
            "text": text, "parse_mode": parse_mode,
            "disable_web_page_preview": True,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        return self._post("editMessageText", payload)

    def answer_callback_query(self, callback_query_id: str, *, text: str = "",
                              show_alert: bool = False) -> dict[str, Any]:
        return self._post("answerCallbackQuery",
                          {"callback_query_id": callback_query_id, "text": text, "show_alert": show_alert})

    def get_updates(self, offset: int | None = None, *, timeout: int = 25,
                    allowed_updates: Iterable[str] = ("callback_query", "message")) -> list[dict]:
        payload: dict[str, Any] = {"timeout": timeout, "allowed_updates": list(allowed_updates)}
        if offset is not None:
            payload["offset"] = offset
        try:
            with httpx.Client(timeout=timeout + 10) as c:
                r = c.post(f"{self.base}/getUpdates", json=payload)
                data = r.json()
        except httpx.HTTPError as e:
            raise TelegramError(f"network: {e}") from e
        if not data.get("ok"):
            raise TelegramError(f"getUpdates failed: {data.get('description')}")
        return data.get("result") or []


def inline_keyboard(rows: list[list[tuple[str, str]]]) -> dict:
    """rows = [[(label, callback_data), ...], ...]"""
    return {"inline_keyboard": [
        [{"text": lbl, "callback_data": cb} for lbl, cb in row] for row in rows
    ]}


def url_keyboard(rows: list[list[tuple[str, str]]]) -> dict:
    """rows = [[(label, url), ...], ...]"""
    return {"inline_keyboard": [
        [{"text": lbl, "url": url} for lbl, url in row] for row in rows
    ]}


def topic_id(env_var: str) -> int | None:
    v = os.environ.get(env_var, "").strip()
    if not v:
        return None
    try:
        return int(v)
    except ValueError:
        log.warning("bad %s: %r (want integer)", env_var, v)
        return None
