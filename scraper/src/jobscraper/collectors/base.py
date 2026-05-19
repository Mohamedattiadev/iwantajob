from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..db import Job, session_scope


@dataclass
class CollectedJob:
    source: str
    source_id: str
    source_url: str
    title: str
    company: str | None = None
    location: str | None = None
    remote: bool = False
    posted_at: datetime | None = None
    description: str = ""
    employment_type: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: str | None = None


def upsert_jobs(jobs: Iterable[CollectedJob]) -> tuple[int, int]:
    inserted = 0
    skipped = 0
    with session_scope() as s:
        for j in jobs:
            stmt = sqlite_insert(Job).values(
                source=j.source,
                source_id=j.source_id,
                source_url=j.source_url,
                title=j.title,
                company=j.company,
                location=j.location,
                remote=1 if j.remote else 0,
                posted_at=j.posted_at,
                description=j.description or "",
                employment_type=j.employment_type,
                salary_min=j.salary_min,
                salary_max=j.salary_max,
                currency=j.currency,
            ).on_conflict_do_nothing(index_elements=["source", "source_id"])
            res = s.execute(stmt)
            if res.rowcount and res.rowcount > 0:
                inserted += 1
            else:
                skipped += 1
    return inserted, skipped
