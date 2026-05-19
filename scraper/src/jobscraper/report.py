from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, select

from .db import Job, JobSkill, session_scope
from .quality import REAL_THRESHOLD, score_jobs

# Skills the user already lists on CV — exclude from "to learn".
KNOWN_SKILLS = {
    "Python", "Java", "C", "C++", "JavaScript",
    "FastAPI", "Node.js",
    "React", "Next.js", "HTML", "CSS", "Tailwind",
    "SQL", "PostgreSQL",
    "Linux", "Git",
}

JUNIOR_LEVELS = {"intern", "junior", None}  # None = unknown — keep, do not assume senior.


def _query_target_jobs(s, junior_only: bool):
    q = select(Job)
    if junior_only:
        q = q.where(Job.seniority.in_(["intern", "junior"]) | Job.seniority.is_(None))
    return list(s.scalars(q))


def build_report(
    out_path: Path,
    junior_only: bool = True,
    top_n: int = 40,
    real_only: bool = True,
    min_score: int = REAL_THRESHOLD,
) -> dict:
    with session_scope() as s:
        total_jobs = s.scalar(select(func.count()).select_from(Job)) or 0
        all_jobs = list(s.scalars(select(Job)))
        scores = score_jobs(all_jobs)

        jobs = _query_target_jobs(s, junior_only)
        if real_only:
            jobs = [j for j in jobs if scores.get(j.id, 0) >= min_score]
        target_ids = {j.id for j in jobs}

        skill_rows = list(
            s.execute(
                select(JobSkill.skill, JobSkill.category, JobSkill.job_id)
            ).all()
        )

    counts: Counter = Counter()
    cat_of: dict[str, str] = {}
    for skill, cat, job_id in skill_rows:
        if job_id not in target_ids:
            continue
        counts[skill] += 1
        cat_of[skill] = cat

    seniority_counts: Counter = Counter()
    source_counts: Counter = Counter()
    for j in jobs:
        seniority_counts[j.seniority or "unknown"] += 1
        source_counts[j.source] += 1

    by_cat: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for skill, n in counts.most_common():
        by_cat[cat_of[skill]].append((skill, n))

    total_target = len(jobs) or 1

    def pct(n: int) -> str:
        return f"{100 * n / total_target:.0f}%"

    lines: list[str] = []
    lines.append(f"# Job Market Report\n")
    lines.append(f"_Generated: {datetime.utcnow().isoformat(timespec='seconds')}Z_\n")
    lines.append(f"- Total jobs in DB: **{total_jobs}**")
    label = "real, " if real_only else ""
    lines.append(f"- Target jobs ({label}junior/intern/unknown): **{len(jobs)}**")
    if real_only:
        lines.append(f"- Ghost-job filter: score >= {min_score}/100")
    lines.append("")
    lines.append("## Sources")
    for src, n in source_counts.most_common():
        lines.append(f"- {src}: {n}")
    lines.append("")
    lines.append("## Seniority breakdown")
    for lvl, n in seniority_counts.most_common():
        lines.append(f"- {lvl}: {n}")
    lines.append("")

    lines.append(f"## Top {top_n} skills (target jobs)\n")
    lines.append("| Rank | Skill | Category | Jobs | % | Already have |")
    lines.append("|-----:|-------|----------|-----:|--:|:------------:|")
    for i, (skill, n) in enumerate(counts.most_common(top_n), 1):
        have = "yes" if skill in KNOWN_SKILLS else ""
        lines.append(f"| {i} | {skill} | {cat_of[skill]} | {n} | {pct(n)} | {have} |")
    lines.append("")

    lines.append("## By category\n")
    for cat in sorted(by_cat):
        lines.append(f"### {cat}")
        for skill, n in by_cat[cat][:15]:
            tag = " _(have)_" if skill in KNOWN_SKILLS else ""
            lines.append(f"- **{skill}** — {n} ({pct(n)}){tag}")
        lines.append("")

    lines.append("## Gap analysis — top skills you do NOT yet have\n")
    gaps = [(s, n) for s, n in counts.most_common() if s not in KNOWN_SKILLS][:20]
    for i, (skill, n) in enumerate(gaps, 1):
        lines.append(f"{i}. **{skill}** ({cat_of[skill]}) — {n} jobs, {pct(n)}")
    lines.append("")

    lines.append("## Suggested learning order (priority = frequency × stack-fit)\n")
    priority_categories = ["devops", "db", "framework", "frontend", "cloud", "lang", "methodology", "data", "ai", "tools"]
    ordered: list[tuple[str, str, int]] = []
    for cat in priority_categories:
        for skill, n in by_cat.get(cat, []):
            if skill in KNOWN_SKILLS:
                continue
            ordered.append((skill, cat, n))
        if len(ordered) >= 15:
            break
    for i, (skill, cat, n) in enumerate(ordered[:15], 1):
        lines.append(f"{i}. **{skill}** _{cat}_ — {n} jobs")
    lines.append("")

    lines.append("## Top real jobs (highest quality score, junior/unknown)\n")
    ranked = sorted(jobs, key=lambda j: (scores.get(j.id, 0), j.posted_at or datetime.min), reverse=True)
    for j in ranked[:25]:
        sc = scores.get(j.id, 0)
        when = j.posted_at.date().isoformat() if j.posted_at else "?"
        comp = j.company or "?"
        lines.append(f"- **[{sc}]** {when} — _{comp}_ — [{j.title[:80]}]({j.source_url})")
    lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    return {
        "total_jobs": total_jobs,
        "target_jobs": len(jobs),
        "top_skills": counts.most_common(top_n),
        "gaps": gaps,
    }
