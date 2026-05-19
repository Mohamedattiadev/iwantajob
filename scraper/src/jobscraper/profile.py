"""User profile: structured CV data + proficiency. Stored as JSON on disk.

The dashboard's localStorage holds quick-edit proficiency too. This file is
the canonical source for CV generation.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import DATA_DIR

PROFILE_PATH = DATA_DIR / "profile.json"


DEFAULT: dict[str, Any] = {
    "personal": {
        "name": "",
        "email": "",
        "phone": "",
        "location": "",
        "links": {  # github, linkedin, portfolio
            "github": "",
            "linkedin": "",
            "portfolio": "",
        },
        "summary": "",
    },
    "education": [],   # {school, degree, location, start, end, gpa, notes}
    "experience": [],  # {company, role, location, start, end, bullets:[str]}
    "projects": [],    # {name, link, summary, bullets:[str], skills:[str]}
    "skills": {},      # canonical: { "Python": 4, "Docker": 2, ... }  level 0-5
    "languages": [],   # {name, level}
    "certifications": [],  # {name, issuer, year}
}


def load() -> dict[str, Any]:
    if not PROFILE_PATH.exists():
        save(DEFAULT)
        return json.loads(json.dumps(DEFAULT))
    try:
        return json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return json.loads(json.dumps(DEFAULT))


def save(data: dict[str, Any]) -> None:
    PROFILE_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def merge(patch: dict[str, Any]) -> dict[str, Any]:
    """Shallow merge over top-level keys, replace nested lists/dicts."""
    cur = load()
    for k, v in patch.items():
        cur[k] = v
    save(cur)
    return cur
