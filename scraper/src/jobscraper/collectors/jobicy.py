from __future__ import annotations

from datetime import datetime

from dateutil import parser as dtparser
from selectolax.parser import HTMLParser

from ..http import client, get
from .base import CollectedJob

URL = "https://jobicy.com/api/v2/remote-jobs"


def _strip(html: str) -> str:
    if not html:
        return ""
    return HTMLParser(html).text(separator=" ", strip=True)


def collect_jobicy() -> list[CollectedJob]:
    with client() as c:
        r = get(c, URL, params={"count": 100})
        data = r.json().get("jobs", [])

    jobs: list[CollectedJob] = []
    for it in data:
        jid = it.get("id") or it.get("url")
        if not jid:
            continue
        posted = None
        if it.get("pubDate"):
            try:
                posted = dtparser.parse(it["pubDate"])
            except (ValueError, TypeError):
                posted = None
        jobs.append(
            CollectedJob(
                source="jobicy",
                source_id=str(jid),
                source_url=it.get("url") or "",
                title=it.get("jobTitle") or "(no title)",
                company=it.get("companyName"),
                location=", ".join(it.get("jobGeo", "").split(",")) if it.get("jobGeo") else None,
                remote=True,
                posted_at=posted,
                description=_strip(it.get("jobDescription") or ""),
                employment_type=(
                    ",".join(it["jobType"]) if isinstance(it.get("jobType"), list)
                    else it.get("jobType")
                ),
                salary_min=float(it["annualSalaryMin"]) if it.get("annualSalaryMin") else None,
                salary_max=float(it["annualSalaryMax"]) if it.get("annualSalaryMax") else None,
                currency=it.get("salaryCurrency") or None,
            )
        )
    return jobs
