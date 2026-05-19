from __future__ import annotations

import re
from datetime import datetime
from typing import Iterable

from sqlalchemy import select

from .db import Job, JobSkill, session_scope
from .skills import SENIORITY_PATTERNS, SKILLS


def _compile() -> list[tuple[str, str, re.Pattern]]:
    compiled = []
    for canonical, (category, aliases) in SKILLS.items():
        alt = "|".join(aliases)
        pattern = re.compile(rf"(?<![A-Za-z0-9_])(?:{alt})(?![A-Za-z0-9_])", re.IGNORECASE)
        compiled.append((canonical, category, pattern))
    return compiled


_COMPILED = _compile()
_SENIORITY_COMPILED = {
    level: [re.compile(p, re.IGNORECASE) for p in pats]
    for level, pats in SENIORITY_PATTERNS.items()
}


def extract_skills(text: str) -> list[tuple[str, str]]:
    if not text:
        return []
    found = []
    seen = set()
    for canonical, category, pat in _COMPILED:
        if pat.search(text) and canonical not in seen:
            seen.add(canonical)
            found.append((canonical, category))
    return found


def detect_seniority(title: str, description: str) -> str | None:
    blob = f"{title}\n{description}".lower()
    # Priority order: senior > mid > junior > intern. Senior wins if present.
    for level in ("senior", "mid", "junior", "intern"):
        for pat in _SENIORITY_COMPILED[level]:
            if pat.search(blob):
                return level
    return None


def extract_all(only_unextracted: bool = True) -> tuple[int, int]:
    """Run extraction over jobs. Returns (jobs_processed, skills_inserted)."""
    processed = 0
    inserted = 0
    with session_scope() as s:
        q = select(Job)
        if only_unextracted:
            q = q.where(Job.extracted_at.is_(None))
        for job in s.scalars(q):
            text = f"{job.title}\n{job.description or ''}"
            skills = extract_skills(text)
            seniority = detect_seniority(job.title or "", job.description or "")

            existing = {js.skill for js in job.skills}
            for canonical, category in skills:
                if canonical in existing:
                    continue
                s.add(JobSkill(job_id=job.id, skill=canonical, category=category, weight=1.0))
                inserted += 1
            job.seniority = seniority
            job.extracted_at = datetime.utcnow()
            processed += 1
    return processed, inserted
