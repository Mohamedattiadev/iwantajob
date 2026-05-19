"""Excalidraw drawing storage as JSON files."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .config import DATA_DIR

DRAW_DIR = DATA_DIR / "drawings"
DRAW_DIR.mkdir(parents=True, exist_ok=True)


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9_-]+", "-", name.lower()).strip("-")
    return s or "untitled"


def _path(name: str) -> Path:
    return DRAW_DIR / f"{_slug(name)}.json"


def list_all() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for p in sorted(DRAW_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        items.append({
            "slug": p.stem,
            "title": data.get("title") or p.stem,
            "updated_at": p.stat().st_mtime,
        })
    return items


def load(name: str) -> dict[str, Any] | None:
    p = _path(name)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def save(name: str, data: dict[str, Any]) -> None:
    _path(name).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def delete(name: str) -> bool:
    p = _path(name)
    if p.exists():
        p.unlink()
        return True
    return False
