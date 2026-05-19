"""Adzuna API. Türkiye supported (country=tr). Free tier 250 calls/month.

Requires env vars ADZUNA_APP_ID and ADZUNA_APP_KEY.
Sign up: https://developer.adzuna.com/
"""
from __future__ import annotations

import os
from datetime import datetime

import httpx
from dateutil import parser as dtparser
from selectolax.parser import HTMLParser

from ..http import HTTP_TIMEOUT, USER_AGENT
from .base import CollectedJob

COUNTRIES = ["tr", "gb"]  # add more as needed
QUERIES = ["junior software", "intern developer", "graduate software engineer"]


def _strip(html: str) -> str:
    if not html:
        return ""
    return HTMLParser(html).text(separator=" ", strip=True)


def collect_adzuna() -> list[CollectedJob]:
    app_id = os.environ.get("ADZUNA_APP_ID")
    app_key = os.environ.get("ADZUNA_APP_KEY")
    if not (app_id and app_key):
        return []

    jobs: list[CollectedJob] = []
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=HTTP_TIMEOUT) as c:
        for country in COUNTRIES:
            for q in QUERIES:
                url = f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"
                params = {
                    "app_id": app_id,
                    "app_key": app_key,
                    "results_per_page": 50,
                    "what": q,
                    "content-type": "application/json",
                }
                try:
                    r = c.get(url, params=params)
                    r.raise_for_status()
                except httpx.HTTPError:
                    continue
                for it in r.json().get("results", []) or []:
                    jid = it.get("id")
                    if not jid:
                        continue
                    posted = None
                    if it.get("created"):
                        try:
                            posted = dtparser.parse(it["created"])
                        except (ValueError, TypeError):
                            posted = None
                    company = (it.get("company") or {}).get("display_name")
                    loc = (it.get("location") or {}).get("display_name")
                    jobs.append(
                        CollectedJob(
                            source="adzuna",
                            source_id=str(jid),
                            source_url=it.get("redirect_url") or "",
                            title=it.get("title") or "(no title)",
                            company=company,
                            location=loc,
                            remote="remote" in (it.get("description") or "").lower(),
                            posted_at=posted,
                            description=_strip(it.get("description") or ""),
                            employment_type=it.get("contract_time"),
                            salary_min=it.get("salary_min"),
                            salary_max=it.get("salary_max"),
                            currency=None,
                        )
                    )
    return jobs
