from __future__ import annotations

from datetime import datetime

from selectolax.parser import HTMLParser

from ..http import client, get
from .base import CollectedJob

HN_STORY_SEARCH = (
    "https://hn.algolia.com/api/v1/search?query=Ask+HN+Who+is+hiring"
    "&tags=story&hitsPerPage=5"
)
HN_COMMENTS = (
    "https://hn.algolia.com/api/v1/search?tags=comment,story_{story_id}"
    "&hitsPerPage=1000"
)


def _strip(html: str) -> str:
    if not html:
        return ""
    return HTMLParser(html).text(separator=" ", strip=True)


def _latest_hiring_story_id(c) -> str | None:
    r = get(c, HN_STORY_SEARCH)
    for hit in r.json().get("hits", []):
        title = (hit.get("title") or "").lower()
        if "who is hiring" in title and hit.get("author") == "whoishiring":
            return hit["objectID"]
    return None


def collect_hn() -> list[CollectedJob]:
    with client() as c:
        story_id = _latest_hiring_story_id(c)
        if not story_id:
            return []
        r = get(c, HN_COMMENTS.format(story_id=story_id))
        hits = r.json().get("hits", [])

    jobs: list[CollectedJob] = []
    for h in hits:
        text = _strip(h.get("comment_text") or "")
        if len(text) < 80:
            continue
        head = text.split(".")[0][:200]
        company = head.split("|")[0].strip()[:100] if "|" in head else None
        posted = None
        if h.get("created_at"):
            try:
                posted = datetime.fromisoformat(h["created_at"].replace("Z", "+00:00"))
            except ValueError:
                pass
        jobs.append(
            CollectedJob(
                source="hn",
                source_id=str(h["objectID"]),
                source_url=f"https://news.ycombinator.com/item?id={h['objectID']}",
                title=head,
                company=company,
                location=None,
                remote="remote" in text.lower(),
                posted_at=posted,
                description=text,
            )
        )
    return jobs
