"""Excalidraw drawing storage. Writes to three places on every save:

1. SQLite `drawing` table — source of truth for listing/queries.
2. Flat JSON at `data/drawings/<slug>.json` — legacy compat.
3. Per-category folder `data/excalidraw/<category>/<name>.excalidraw` in
   Excalidraw native format, so each scene can be opened directly in
   excalidraw.com or VS Code's Excalidraw extension.

Category is derived from the slug: `skill-react` → `react`, `skill-javascript`
→ `javascript`. Slugs without `skill-` prefix go under `misc/`.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from sqlalchemy import select

from .config import DATA_DIR
from .db import Drawing, session_scope

DRAW_DIR = DATA_DIR / "drawings"
DRAW_DIR.mkdir(parents=True, exist_ok=True)
EXCALIDRAW_DIR = DATA_DIR / "excalidraw"
EXCALIDRAW_DIR.mkdir(parents=True, exist_ok=True)


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9_-]+", "-", name.lower()).strip("-")
    return s or "untitled"


def _legacy_path(name: str) -> Path:
    return DRAW_DIR / f"{_slug(name)}.json"


def _category_from_slug(slug: str) -> tuple[str, str]:
    """Return (category, leaf_name). `skill-react` → ('react', 'main')."""
    s = _slug(slug)
    if s.startswith("skill-"):
        cat = s[len("skill-"):] or "misc"
        return cat, "main"
    return "misc", s


def _excalidraw_path(slug: str) -> Path:
    cat, leaf = _category_from_slug(slug)
    folder = EXCALIDRAW_DIR / cat
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{leaf}.excalidraw"


def _to_excalidraw_native(data: dict[str, Any]) -> dict[str, Any]:
    app = data.get("appState") or {}
    return {
        "type": "excalidraw",
        "version": 2,
        "source": "iwantajob",
        "elements": data.get("elements") or [],
        "appState": {
            "viewBackgroundColor": app.get("viewBackgroundColor", "#ffffff"),
            "gridSize": app.get("gridSize"),
        },
        "files": data.get("files") or {},
    }


def list_all() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    with session_scope() as s:
        for d in s.scalars(select(Drawing).order_by(Drawing.updated_at.desc())):
            items.append({
                "slug": d.slug,
                "title": d.title or d.slug,
                "category": d.category,
                "updated_at": d.updated_at.timestamp(),
            })
    if items:
        return items
    # Backfill view from legacy disk on first run before any save.
    for p in sorted(DRAW_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        items.append({
            "slug": p.stem,
            "title": data.get("title") or p.stem,
            "category": _category_from_slug(p.stem)[0],
            "updated_at": p.stat().st_mtime,
        })
    return items


def load(name: str) -> dict[str, Any] | None:
    slug = _slug(name)
    with session_scope() as s:
        row = s.scalar(select(Drawing).where(Drawing.slug == slug))
        if row:
            try:
                return json.loads(row.content_json)
            except Exception:
                pass
    p = _legacy_path(name)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def save(name: str, data: dict[str, Any]) -> None:
    slug = _slug(name)
    category, _ = _category_from_slug(slug)
    title = str(data.get("title") or slug)[:200]
    payload = json.dumps(data, ensure_ascii=False)

    with session_scope() as s:
        row = s.scalar(select(Drawing).where(Drawing.slug == slug))
        if row is None:
            row = Drawing(slug=slug, title=title, category=category, content_json=payload)
            s.add(row)
        else:
            row.title = title
            row.category = category
            row.content_json = payload

    _legacy_path(name).write_text(payload, encoding="utf-8")

    native = _to_excalidraw_native(data)
    _excalidraw_path(slug).write_text(json.dumps(native, ensure_ascii=False, indent=2), encoding="utf-8")


def delete(name: str) -> bool:
    slug = _slug(name)
    found = False
    with session_scope() as s:
        row = s.scalar(select(Drawing).where(Drawing.slug == slug))
        if row is not None:
            s.delete(row)
            found = True
    p = _legacy_path(name)
    if p.exists():
        p.unlink()
        found = True
    ep = _excalidraw_path(slug)
    if ep.exists():
        ep.unlink()
        found = True
    return found
