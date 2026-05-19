from __future__ import annotations

from datetime import datetime

from dateutil import parser as dtparser
from selectolax.parser import HTMLParser

from ..http import client, get
from .base import CollectedJob

URL = "https://remoteok.com/api"


def _strip_html(html: str) -> str:
    if not html:
        return ""
    return HTMLParser(html).text(separator=" ", strip=True)


def collect_remoteok() -> list[CollectedJob]:
    with client() as c:
        r = get(c, URL)
        data = r.json()

    jobs: list[CollectedJob] = []
    for item in data:
        if not isinstance(item, dict) or "id" not in item:
            continue
        posted = None
        if item.get("date"):
            try:
                posted = dtparser.parse(item["date"])
            except (ValueError, TypeError):
                posted = None
        elif item.get("epoch"):
            try:
                posted = datetime.utcfromtimestamp(int(item["epoch"]))
            except (ValueError, TypeError):
                posted = None

        desc = _strip_html(item.get("description") or "")
        tags = " ".join(item.get("tags") or [])
        if tags:
            desc = f"{desc}\n\nTags: {tags}"

        jobs.append(
            CollectedJob(
                source="remoteok",
                source_id=str(item["id"]),
                source_url=item.get("url") or f"https://remoteok.com/remote-jobs/{item['id']}",
                title=item.get("position") or "(no title)",
                company=item.get("company"),
                location=item.get("location") or "Remote",
                remote=True,
                posted_at=posted,
                description=desc,
                salary_min=float(item["salary_min"]) if item.get("salary_min") else None,
                salary_max=float(item["salary_max"]) if item.get("salary_max") else None,
                currency="USD" if item.get("salary_min") else None,
            )
        )
    return jobs
