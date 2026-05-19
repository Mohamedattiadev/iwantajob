# jobscraper

Personal job-market scraper. Pulls jobs from public, ToS-friendly sources, extracts skills from descriptions, and writes a markdown report that drives a learning roadmap.

## Sources (no API keys needed)
- RemoteOK public JSON
- Hacker News "Who is hiring" via Algolia search API
- We Work Remotely RSS feeds (programming categories)

LinkedIn is **not** scraped — violates ToS and risks account ban.

## Install

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate.fish  # or .venv/bin/activate for bash
pip install -e .
```

## Use

```bash
jobscraper init-db
jobscraper collect              # all sources
jobscraper collect --source remoteok
jobscraper extract              # parse skills + seniority
jobscraper stats                # quick counts
jobscraper report               # writes data/report.md
```

Re-run `collect` daily. New jobs only insert (dedup by source + source_id).

## Data

SQLite by default at `scraper/data/jobs.sqlite`. Override with `JOBSCRAPER_DB_URL=postgresql+psycopg://...`.

## Output

`data/report.md` — top skills, gap analysis vs your current CV (edit `KNOWN_SKILLS` in `src/jobscraper/report.py` to match your stack), suggested learning order.

## Files

```
src/jobscraper/
  config.py            paths, HTTP settings
  db.py                SQLAlchemy models + session
  http.py              httpx client + retries
  skills.py            curated skill dictionary
  extractor.py         regex skill + seniority extraction
  report.py            markdown report builder
  cli.py               Typer CLI
  collectors/
    base.py            CollectedJob + upsert
    remoteok.py
    hn.py
    wwr.py
```

## Next steps (after running once)

1. Read `data/report.md`. Pick top 5 unknown skills.
2. Add them to `plan.md` Phase 2 backlog.
3. Optionally add more collectors (Adzuna, JSearch via RapidAPI) — get a free key and stick another file in `collectors/`.
