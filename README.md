# IWANTAJOB

Personal job-market launchpad for a junior software student.

**What it does:** scrapes real junior jobs from 6 legal sources, ghost-filters them, maps required skills against your CV, runs a per-skill learning notebook, tracks applications, generates ATS-clean CVs (Markdown / HTML / LaTeX PDF), and answers questions via a Claude-powered chat.

## Architecture

```
┌──────────────────┐    HTTP    ┌─────────────────┐
│  Next.js 16      │ ─────────▶ │  FastAPI        │
│  React 19 + TS   │            │  Python 3.13    │
│  shadcn/ui       │            │  SQLAlchemy 2   │
│  glassmorphism   │            │  pypdf · pdflatex│
└──────────────────┘            │  Anthropic SDK  │
                                └─────────────────┘
                                        │
                                        ▼
                                ┌─────────────────┐
                                │  SQLite         │
                                │  + JSON profile │
                                │  + markdown notes│
                                └─────────────────┘
```

## Pages

| # | Route       | Purpose |
|---|-------------|---------|
| 0 | `/`         | 4-card dashboard, top matches, scrape button |
| 1 | `/cv`       | Upload PDF → parse → edit → export MD/HTML/PDF |
| 2 | `/learn`    | Rate skills 0–5, open per-skill markdown notebook |
| 3 | `/jobs`     | Filterable grid, match-scored, click = mark applied |
| 4 | `/apply`    | Application pipeline (applied → interviewing → offer/rejected) |
|   | `/welcome`  | Onboarding (upload CV → 4 questions → done) |

## Sources

Open APIs (no key): RemoteOK · HN Who-is-hiring · WeWorkRemotely · Arbeitnow · Jobicy.

Keyed (free tier): **Adzuna** (`ADZUNA_APP_ID`, `ADZUNA_APP_KEY` — Türkiye + UK) · **JSearch** (`RAPIDAPI_KEY` — legal LinkedIn aggregation).

LinkedIn direct scrape: **not** done — breaks ToS, risks bans. Use JSearch.

## Run

```bash
# Backend
cd scraper
python -m venv .venv && source .venv/bin/activate.fish
pip install -e .
ADZUNA_APP_ID=... ADZUNA_APP_KEY=... ANTHROPIC_API_KEY=... \
  jobscraper serve

# Frontend
cd web
npm install
npm run dev
```

Open http://127.0.0.1:3000.

## Layout

```
scraper/                  FastAPI backend + CLI
  src/jobscraper/
    collectors/           one file per source
    db.py                 SQLAlchemy: Job, JobSkill, Application
    extractor.py          skill + seniority regex
    quality.py            ghost-job scoring
    profile.py            JSON-backed user profile
    cv.py                 PDF parse + Markdown/HTML CV
    latex.py              .tex render + pdflatex compile
    chat.py               Anthropic API client
    notes.py              per-skill markdown notebooks
    web.py                FastAPI app
    cli.py                Typer CLI

web/                      Next.js dashboard
  src/
    app/                  routes: /, /welcome, /cv, /learn, /jobs, /apply
    components/           shadcn UI + ChatWidget + ScrapeButton
    lib/                  api client, proficiency, applications
```

## License

Private — personal project.
