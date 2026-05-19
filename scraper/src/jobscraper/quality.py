"""Ghost-job filter. Score each job 0..100 on likely-real-hiring signals.

Signals (additive):
  +30  Source is paid/moderated (HN whoishiring, WWR)
  +20  Posted within last 45 days
  +15  Description >= 400 chars
  +10  Description >= 800 chars (cumulative)
  +10  Has salary
  +10  Company not posting many roles (<=3 in DB)
  -20  Staffing/agency pattern in title or company
  -15  Generic boilerplate title ("multiple positions", "various roles")
  -10  Posted > 90 days ago
  -25  Posted > 180 days ago (cumulative)
"""
from __future__ import annotations

import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Iterable

from .db import Job

PAID_SOURCES = {"hn", "wwr"}

AGENCY_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\brecruiter\b",
        r"\bstaffing\b",
        r"\btalent\s+solutions\b",
        r"\btalent\s+acquisition\b",
        r"\brpo\b",
        r"\bheadhunter\b",
        r"\bplacement\s+agency\b",
        r"\bconsulting\s+group\b",
    )
]

GENERIC_TITLE_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"multiple\s+positions",
        r"various\s+roles",
        r"hiring\s+now",
        r"urgent\s+hiring",
        r"immediate\s+joiners?",
        r"all\s+levels",
    )
]


def _has_any(patterns: list[re.Pattern], *texts: str | None) -> bool:
    blob = " ".join(t for t in texts if t)
    return any(p.search(blob) for p in patterns)


def score_jobs(jobs: Iterable[Job]) -> dict[int, int]:
    jobs = list(jobs)
    now = datetime.utcnow()

    company_counts: Counter = Counter()
    for j in jobs:
        if j.company:
            company_counts[j.company.strip().lower()] += 1

    scores: dict[int, int] = {}
    for j in jobs:
        s = 0
        if j.source in PAID_SOURCES:
            s += 30

        desc_len = len(j.description or "")
        if desc_len >= 400:
            s += 15
        if desc_len >= 800:
            s += 10

        if j.posted_at:
            age = now - j.posted_at.replace(tzinfo=None)
            if age <= timedelta(days=45):
                s += 20
            if age > timedelta(days=90):
                s -= 10
            if age > timedelta(days=180):
                s -= 25
        # No date → neutral (HN comments and some feeds lack reliable date).

        if j.salary_min or j.salary_max:
            s += 10

        if j.company:
            cnt = company_counts[j.company.strip().lower()]
            if cnt <= 3:
                s += 10
            elif cnt >= 10:
                s -= 10

        if _has_any(AGENCY_PATTERNS, j.title, j.company, j.description):
            s -= 20
        if _has_any(GENERIC_TITLE_PATTERNS, j.title):
            s -= 15

        scores[j.id] = max(0, min(100, s))
    return scores


REAL_THRESHOLD = 50
