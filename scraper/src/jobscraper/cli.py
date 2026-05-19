from __future__ import annotations

from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table
from sqlalchemy import func, select

from .collectors import COLLECTORS, upsert_jobs
from .config import DATA_DIR
from .db import Job, JobSkill, init_db, session_scope
from .extractor import extract_all
from .quality import REAL_THRESHOLD, score_jobs
from .report import build_report

app = typer.Typer(help="Personal job-market scraper.", no_args_is_help=True)
console = Console()


@app.command("init-db")
def cmd_init_db() -> None:
    """Create database tables."""
    init_db()
    console.print(f"[green]DB initialized[/green] at {DATA_DIR}")


@app.command()
def collect(
    source: str = typer.Option("all", help="Source name or 'all'."),
) -> None:
    """Fetch jobs from one or all collectors and upsert into DB."""
    init_db()
    sources = list(COLLECTORS) if source == "all" else [source]
    for src in sources:
        if src not in COLLECTORS:
            console.print(f"[red]Unknown source:[/red] {src}")
            continue
        console.print(f"[cyan]Collecting[/cyan] {src} ...")
        try:
            jobs = COLLECTORS[src]()
        except Exception as e:  # network etc.
            console.print(f"[red]{src} failed:[/red] {e}")
            continue
        ins, skip = upsert_jobs(jobs)
        console.print(f"  {src}: fetched={len(jobs)} new={ins} dup={skip}")


@app.command()
def extract(
    all_jobs: bool = typer.Option(False, "--all", help="Re-extract every job, not just new."),
) -> None:
    """Extract skills and seniority from job descriptions."""
    init_db()
    n, k = extract_all(only_unextracted=not all_jobs)
    console.print(f"[green]Extracted[/green] jobs={n} skill_rows_added={k}")


@app.command()
def report(
    out: Path = typer.Option(DATA_DIR / "report.md", help="Output markdown path."),
    top: int = typer.Option(40, help="Top N skills to list."),
    junior_only: bool = typer.Option(True, "--junior/--all-levels"),
    real_only: bool = typer.Option(True, "--real/--all-quality"),
    min_score: int = typer.Option(REAL_THRESHOLD, help="Min quality score 0..100."),
) -> None:
    """Build the market report (markdown)."""
    init_db()
    summary = build_report(
        out,
        junior_only=junior_only,
        top_n=top,
        real_only=real_only,
        min_score=min_score,
    )
    console.print(f"[green]Report written:[/green] {out}")
    console.print(
        f"jobs_total={summary['total_jobs']} target={summary['target_jobs']} "
        f"distinct_skills={len(summary['top_skills'])}"
    )


@app.command()
def stats() -> None:
    """Quick DB stats."""
    init_db()
    with session_scope() as s:
        total = s.scalar(select(func.count()).select_from(Job)) or 0
        extracted = s.scalar(
            select(func.count()).select_from(Job).where(Job.extracted_at.is_not(None))
        ) or 0
        per_source = list(
            s.execute(select(Job.source, func.count()).group_by(Job.source)).all()
        )
        per_sen = list(
            s.execute(select(Job.seniority, func.count()).group_by(Job.seniority)).all()
        )
        skill_rows = s.scalar(select(func.count()).select_from(JobSkill)) or 0

    t = Table(title="Job DB stats")
    t.add_column("metric")
    t.add_column("value", justify="right")
    t.add_row("total jobs", str(total))
    t.add_row("extracted jobs", str(extracted))
    t.add_row("skill rows", str(skill_rows))
    for src, n in per_source:
        t.add_row(f"  src:{src}", str(n))
    for lvl, n in per_sen:
        t.add_row(f"  seniority:{lvl or 'unknown'}", str(n))
    console.print(t)


@app.command("real-jobs")
def cmd_real_jobs(
    limit: int = typer.Option(30, help="Max jobs to print."),
    min_score: int = typer.Option(REAL_THRESHOLD, help="Min quality score."),
    junior_only: bool = typer.Option(True, "--junior/--all-levels"),
    source: str = typer.Option(None, help="Filter by source (remoteok|hn|wwr)."),
) -> None:
    """List highest-quality real-looking jobs."""
    init_db()
    with session_scope() as s:
        all_jobs = list(s.scalars(select(Job)))
    scores = score_jobs(all_jobs)
    pool = all_jobs
    if junior_only:
        pool = [j for j in pool if j.seniority in (None, "intern", "junior")]
    if source:
        pool = [j for j in pool if j.source == source]
    pool = [j for j in pool if scores.get(j.id, 0) >= min_score]
    pool.sort(key=lambda j: (scores[j.id], j.posted_at or 0), reverse=True)

    t = Table(title=f"Real jobs (score >= {min_score})")
    t.add_column("score", justify="right")
    t.add_column("src")
    t.add_column("when")
    t.add_column("company", overflow="fold")
    t.add_column("title", overflow="fold")
    t.add_column("url", overflow="fold")
    for j in pool[:limit]:
        when = j.posted_at.date().isoformat() if j.posted_at else "?"
        t.add_row(
            str(scores[j.id]),
            j.source,
            when,
            (j.company or "?")[:30],
            (j.title or "")[:60],
            j.source_url,
        )
    console.print(t)
    console.print(f"[dim]Showing {min(limit, len(pool))} of {len(pool)} matching jobs.[/dim]")


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", help="Host to bind."),
    port: int = typer.Option(8000, help="Port to bind."),
    reload: bool = typer.Option(False, "--reload", help="Auto-reload on code change."),
) -> None:
    """Launch web dashboard."""
    import uvicorn
    uvicorn.run("jobscraper.web:app", host=host, port=port, reload=reload)


def main() -> None:  # entrypoint for `python -m jobscraper`
    app()


if __name__ == "__main__":
    main()
