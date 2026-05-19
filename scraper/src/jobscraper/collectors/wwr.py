from __future__ import annotations

from datetime import datetime
from time import mktime

import feedparser
from selectolax.parser import HTMLParser

from ..http import client, get
from .base import CollectedJob

FEEDS = [
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
]


def _strip(html: str) -> str:
    if not html:
        return ""
    return HTMLParser(html).text(separator=" ", strip=True)


def collect_wwr() -> list[CollectedJob]:
    jobs: list[CollectedJob] = []
    with client() as c:
        for url in FEEDS:
            r = get(c, url)
            feed = feedparser.parse(r.text)
            for e in feed.entries:
                guid = e.get("id") or e.get("link")
                if not guid:
                    continue
                posted = None
                if getattr(e, "published_parsed", None):
                    posted = datetime.fromtimestamp(mktime(e.published_parsed))
                title = e.get("title") or ""
                company = None
                if ":" in title:
                    company, _, rest = title.partition(":")
                    company = company.strip()
                    title = rest.strip() or title
                jobs.append(
                    CollectedJob(
                        source="wwr",
                        source_id=str(guid),
                        source_url=e.get("link") or guid,
                        title=title,
                        company=company,
                        location="Remote",
                        remote=True,
                        posted_at=posted,
                        description=_strip(e.get("summary") or ""),
                    )
                )
    return jobs
