from __future__ import annotations

from datetime import datetime

from selectolax.parser import HTMLParser

from ..http import client, get
from .base import CollectedJob

URL = "https://www.arbeitnow.com/api/job-board-api"


def _strip(html: str) -> str:
    if not html:
        return ""
    return HTMLParser(html).text(separator=" ", strip=True)


def collect_arbeitnow() -> list[CollectedJob]:
    jobs: list[CollectedJob] = []
    with client() as c:
        page = 1
        while page <= 5:
            r = get(c, URL, params={"page": page})
            payload = r.json()
            data = payload.get("data") or []
            if not data:
                break
            for it in data:
                slug = it.get("slug") or it.get("url")
                if not slug:
                    continue
                posted = None
                ts = it.get("created_at")
                if ts:
                    try:
                        posted = datetime.utcfromtimestamp(int(ts))
                    except (TypeError, ValueError):
                        posted = None
                tags = it.get("tags") or []
                desc = _strip(it.get("description") or "")
                if tags:
                    desc = f"{desc}\n\nTags: {' '.join(tags)}"
                jobs.append(
                    CollectedJob(
                        source="arbeitnow",
                        source_id=str(slug),
                        source_url=it.get("url") or f"https://arbeitnow.com/jobs/{slug}",
                        title=it.get("title") or "(no title)",
                        company=it.get("company_name"),
                        location=it.get("location"),
                        remote=bool(it.get("remote")),
                        posted_at=posted,
                        description=desc,
                        employment_type=",".join(it.get("job_types") or []) or None,
                    )
                )
            page += 1
    return jobs
