"""JSearch via RapidAPI. Aggregates LinkedIn/Indeed/Glassdoor/ZipRecruiter etc.
This is the legal way to get LinkedIn job data.

Requires env var RAPIDAPI_KEY. Free tier ~150 requests/month.
Sign up: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
"""
from __future__ import annotations

import os
from datetime import datetime

import httpx
from dateutil import parser as dtparser

from ..http import HTTP_TIMEOUT
from .base import CollectedJob

HOST = "jsearch.p.rapidapi.com"
BASE = f"https://{HOST}"

# Tailored queries; each costs 1 API call. Keep small to fit free tier.
QUERIES = [
    {"query": "junior software engineer in Turkey", "num_pages": 1},
    {"query": "intern software developer remote", "num_pages": 1},
    {"query": "junior full stack developer remote", "num_pages": 1},
]


def collect_jsearch() -> list[CollectedJob]:
    key = os.environ.get("RAPIDAPI_KEY")
    if not key:
        return []

    headers = {"x-rapidapi-key": key, "x-rapidapi-host": HOST}
    jobs: list[CollectedJob] = []
    with httpx.Client(headers=headers, timeout=HTTP_TIMEOUT) as c:
        for q in QUERIES:
            try:
                r = c.get(f"{BASE}/search", params=q)
                r.raise_for_status()
            except httpx.HTTPError:
                continue
            for it in r.json().get("data", []) or []:
                jid = it.get("job_id")
                if not jid:
                    continue
                posted = None
                if it.get("job_posted_at_datetime_utc"):
                    try:
                        posted = dtparser.parse(it["job_posted_at_datetime_utc"])
                    except (ValueError, TypeError):
                        posted = None
                location_parts = [
                    it.get("job_city"),
                    it.get("job_state"),
                    it.get("job_country"),
                ]
                location = ", ".join(p for p in location_parts if p) or None
                jobs.append(
                    CollectedJob(
                        source="jsearch",
                        source_id=str(jid),
                        source_url=it.get("job_apply_link") or it.get("job_google_link") or "",
                        title=it.get("job_title") or "(no title)",
                        company=it.get("employer_name"),
                        location=location,
                        remote=bool(it.get("job_is_remote")),
                        posted_at=posted,
                        description=it.get("job_description") or "",
                        employment_type=it.get("job_employment_type"),
                        salary_min=it.get("job_min_salary"),
                        salary_max=it.get("job_max_salary"),
                        currency=it.get("job_salary_currency"),
                    )
                )
    return jobs
