# IWANTAJOB — Zero to Hired Plan (3–6 months)

**Owner:** Mohamed Attia
**Start:** 2026-05-20
**Target:** Junior / Intern Full-Stack or Backend role (Türkiye + Remote EU/MENA)
**Current stack:** Python, FastAPI, React/Next, Postgres, Java, C, Linux
**Honest gap:** theory > practice. Most prior code was AI-assisted. Need to *own* the code.

---

## 0. Rules I follow

1. No tutorial-only days. Every concept I learn → I rebuild from scratch with no AI for the first pass. AI only after I solved it once.
2. Every week → 1 public commit streak, 1 written note (what I learned, in my own words).
3. Read code > watch videos. Tutorials cap: 1 per topic, then build.
4. Ship > polish. Each project gets deployed (Render / Vercel / Fly.io / Railway).
5. CV stays *truthful*. Only what I built and understand line-by-line.

---

## 1. Phase 0 — Project: Job Market Scraper & Skill Extractor (Weeks 1–3)

Goal: end-to-end real project I built alone, also produces the data that drives my learning roadmap (Phase 1+).

### 1.1 Why this project
- Forces real practice: HTTP, parsing, DB schema, queue, async, error handling, deploy, dashboard.
- Output = personal "Job Market Report" = drives next phases.
- Portfolio piece + blog post + recruiter conversation starter.

### 1.2 Legal / ethical note
LinkedIn scraping violates ToS and gets the account banned. Approach:
- **Primary data source:** legal APIs — JSearch (RapidAPI), Adzuna API, RemoteOK JSON, Hacker News "Who is hiring", Kariyer.net (with respect to robots.txt), We Work Remotely RSS, Google Jobs via SerpAPI free tier.
- **Scraper portion:** target only public, ToS-friendly pages (RemoteOK, WWR, company career pages). Build polite scraper: robots.txt check, rate limit, user-agent header, caching. This is the *skill* — apply to any future site.
- LinkedIn: only manual export (`linkedin.com/jobs` search → save HTML locally → parse). No automation against their servers.

### 1.3 Architecture (keep small)

```
┌──────────────┐    ┌───────────┐    ┌─────────────┐    ┌──────────────┐
│  collectors  │───▶│  Postgres │◀───│  extractor  │───▶│  FastAPI API │
│ (api+scrape) │    │  (jobs)   │    │ (LLM+regex) │    │  + Next.js UI│
└──────────────┘    └───────────┘    └─────────────┘    └──────────────┘
       │                                    │
       └────── scheduler (APScheduler) ◀────┘
```

Stack — *only what I already half-know*:
- Python 3.12, `httpx`, `selectolax` (fast HTML), `playwright` only if needed
- Postgres + `SQLAlchemy 2.0` + `alembic`
- FastAPI backend, Next.js 14 (app router) frontend
- Docker compose (one file, postgres + api + worker)
- Deploy: Fly.io or Railway free tier

### 1.4 Data model (start simple)

```sql
job(id, source, source_url, title, company, location, remote, posted_at,
    raw_html, description_md, seniority, employment_type, salary_min, salary_max,
    currency, scraped_at)
job_skill(job_id, skill, category, weight)   -- extracted
skill(name, category, normalized_name)        -- canonical list
```

### 1.5 Skill extraction
Two passes:
1. **Regex / keyword pass** — fast, deterministic. Curated dictionary (python, fastapi, kubernetes, sql, etc.) per category (lang, framework, db, devops, cloud, soft, methodology).
2. **LLM pass** — only on description. Prompt: "Return JSON array of required skills, must-have vs nice-to-have, years, seniority." Use cheap model (Haiku) + cache by description hash. Cost cap: under $5 total for the project.

### 1.6 Output = decisions
SQL query: top 30 skills across jobs I qualify for (junior / intern / 0–2y / my stack family). Group by:
- Must-have vs nice-to-have
- Frequency
- Salary correlation (where listed)

This list **becomes my learning backlog** (Phase 1).

### 1.7 Week-by-week
- **Week 1:** collectors for 2 APIs + 1 scraper site, Postgres + alembic, raw insert working, 500+ jobs stored. Deploy DB.
- **Week 2:** extractor (regex + LLM), `skill` table populated, basic FastAPI endpoints (`/jobs`, `/skills/top`).
- **Week 3:** Next.js dashboard (table + filter + top-skills bar chart), Docker compose, deploy public URL, write README + blog post.

### 1.8 Deliverables
- [ ] Public GitHub repo with clean README, screenshots, architecture diagram
- [ ] Live URL (read-only dashboard)
- [ ] `report.md` — top 30 skills, my analysis, what I will learn next
- [ ] Blog post (dev.to or personal) — "I scraped 1000 jobs to plan my career"

---

## 2. Phase 1 — Plug the fundamentals holes (Weeks 4–10, parallel to Phase 2)

These are the things every junior interview hits. CV says I know them — I must *truly* know them.

### 2.1 CS fundamentals
- [ ] Data structures: array, linked list, hashmap, stack, queue, tree, heap, graph — implement each from scratch in Python, then again in Java. No library. Big-O for every op.
- [ ] Algorithms: sort (merge, quick), search (binary, BFS, DFS), dynamic programming (5 classic problems), greedy (3 problems), two-pointer, sliding window.
- [ ] Practice: NeetCode 150 — 75 problems minimum. 1 hour/day. Write solution in own words *before* code.

### 2.2 Git (real workflows, not just `add/commit/push`)
- [ ] Branching: feature branches, rebase vs merge, when to use which
- [ ] Conflict resolution by hand
- [ ] Interactive rebase, squash, fixup
- [ ] `git reflog`, `git bisect`, `git cherry-pick`
- [ ] PR review etiquette: small PRs, descriptive commits (Conventional Commits)
- [ ] GitHub Actions: lint + test on PR

### 2.3 Linux / shell
- [ ] Pipes, redirection, `grep/sed/awk/xargs/find`
- [ ] Processes, signals, `ps/top/htop/lsof`
- [ ] Systemd basics (write one unit file for the scraper)
- [ ] SSH keys, port forwarding, `rsync`
- [ ] Write 3 useful shell scripts I actually use

### 2.4 Networking & HTTP
- [ ] TCP/IP layers, DNS, TLS handshake (read, draw diagram from memory)
- [ ] HTTP/1.1 vs HTTP/2 vs HTTP/3 differences
- [ ] REST principles, status codes (know top 20 cold), idempotency, caching headers
- [ ] CORS (the real reason, not just "add header")
- [ ] WebSockets vs SSE — implement one of each

### 2.5 Databases (deep, not just SELECT)
- [ ] Indexes — B-tree vs hash vs GIN. When each helps/hurts. Run `EXPLAIN ANALYZE`.
- [ ] Transactions, isolation levels, dirty/non-repeatable/phantom reads
- [ ] N+1 problem — recreate it in scraper repo and fix
- [ ] Migrations with alembic — break/fix scenarios
- [ ] Connection pooling — why and how
- [ ] Read replica vs sharding vs partitioning — concepts

### 2.6 Testing (the gap most students have)
- [ ] pytest fundamentals + fixtures + parametrize
- [ ] Unit vs integration vs e2e — clear examples in my own repo
- [ ] Mocking external APIs (`respx` for httpx)
- [ ] Coverage as guide not goal
- [ ] Add tests to Phase 0 scraper retroactively → target 70% on business logic

---

## 3. Phase 2 — Job-market-driven specialization (Weeks 5–16, parallel)

Pick **one** track based on Phase 0 report. Predicted (subject to data):

### Track A — Backend-heavy (most likely match for my stack)
- [ ] FastAPI deep: dependency injection, background tasks, middleware, custom exception handlers, OpenAPI customization
- [ ] Async Python: event loop, `asyncio`, when async hurts, `asyncio.gather`, cancellation
- [ ] Caching: Redis — cache-aside, write-through, TTL strategy. Add to scraper.
- [ ] Message queues: Celery + Redis or RQ. Move scraper jobs to queue.
- [ ] Auth: JWT vs session, OAuth2 flows, write working example from scratch
- [ ] API design: pagination (cursor vs offset), versioning, rate limiting

### Track B — Full-stack (if React/Next dominates listings)
- [ ] React: hooks deep (useMemo, useCallback, useRef edge cases), context vs zustand vs redux
- [ ] Next.js 14: server components vs client, server actions, caching layers, middleware
- [ ] TypeScript: real types, generics, discriminated unions — convert one frontend project to TS
- [ ] State management decisions, form libs (react-hook-form + zod)
- [ ] Performance: lighthouse, code-splitting, image optimization

### Track C — DevOps-adjacent (if Docker/K8s/CI shows high)
- [ ] Docker deep: multi-stage builds, layer caching, healthchecks, networking
- [ ] Kubernetes basics: pod, deployment, service, ingress (local with kind/minikube)
- [ ] CI/CD: GitHub Actions matrix, caching, secrets, deploy on tag
- [ ] Observability: structured logs, Prometheus metrics, basic Grafana dashboard
- [ ] One cloud provider basics: AWS (EC2, S3, RDS, IAM) **or** GCP equivalents

Decision point at end of Week 4: pick track based on data.

---

## 4. Phase 3 — Portfolio projects (Weeks 8–20, two more after scraper)

Three projects total (scraper = #1). Pick #2 and #3 to cover gaps in CV.

### Project 2 — Real-time app (covers async + WebSockets + auth)
Idea options:
- Collaborative todo / kanban (multi-user, real-time)
- Live chat with rooms
- Live tail log viewer for the scraper

### Project 3 — Something I personally use
Rule: if I don't use it daily, it's a portfolio prop, not a project.
- Self-hosted bookmark manager with full-text search
- Personal finance tracker (CSV in → categorize → dashboard)
- Arabic / Turkish flashcard SRS app

Each project requirements (non-negotiable):
- README with: problem, architecture, decisions log, screenshots, live URL
- Tests on core logic
- CI green
- Deployed
- Written blog post

---

## 5. Phase 4 — Job hunt machine (Weeks 12+, parallel)

### 5.1 CV rewrite (after Phase 0 done)
- Rewrite each bullet using STAR (Situation, Task, Action, Result) with numbers
- Drop vague bullets ("Gained experience in...")
- Add scraper + 2 portfolio projects with metrics (jobs scraped, latency, uptime)
- Two versions: backend-focused, full-stack-focused. Match per application.

### 5.2 GitHub profile
- [ ] Profile README with pinned projects + short intro
- [ ] Clean up old / dead repos (archive, don't delete)
- [ ] Every pinned repo: README, license, tests badge, deploy link

### 5.3 LinkedIn
- [ ] Headline matches CV (Junior Backend / Full-Stack)
- [ ] About section: 1 paragraph, what I build, what I want
- [ ] Featured: scraper + report
- [ ] Connect with 5 devs/recruiters per week, comment on 3 posts per week (real comments, not "great post")

### 5.4 Application pipeline
- [ ] Spreadsheet (or repurpose scraper DB): company, role, applied date, source, status, notes, follow-up date
- [ ] Target: 10 applications/week, focus on companies whose stack matches
- [ ] For every rejection: ask for feedback (politely, once)
- [ ] Practice interviews: 2 mock/week (Pramp, peers, AI) — system design + algo + behavioral

### 5.5 Interview prep
- [ ] Behavioral: 8 STAR stories prepped (conflict, failure, success, learning, leadership, tradeoff, deadline, ambiguity)
- [ ] System design at junior level: design URL shortener, rate limiter, chat, feed — whiteboard each twice
- [ ] Stack-specific: prep 20 FastAPI / SQL / React deep questions
- [ ] Live coding: 1 mock pair-programming session/week

---

## 6. Weekly schedule (template)

| Day | Morning (2h) | Evening (2h) |
|-----|--------------|--------------|
| Mon | DSA (NeetCode) | Phase 0/2/3 project work |
| Tue | Phase 1 fundamentals topic | Project work |
| Wed | DSA | Project work |
| Thu | Phase 1 topic | Project work + tests |
| Fri | DSA | Project work + deploy |
| Sat | Long project session (4h) | Write blog / notes |
| Sun | Rest / read / mock interview | Plan next week, update tracker |

22 hours/week minimum. 1 day fully off allowed.

---

## 7. Tracking

- `progress.md` — weekly log: what shipped, what blocked, hours, mood
- `learned.md` — concepts learned this week in own words (no AI)
- `applications.csv` — job hunt pipeline
- Monthly review (last Sunday): what's working, what isn't, adjust plan

---

## 8. Red flags I must avoid

- Reading without building
- Building without deploying
- Deploying without writing it up
- Asking AI to write code I don't yet understand → only ask AI to *explain* until I can write it myself
- Tutorial hell: cap at 1 video/topic, then build
- Lying on CV — every line must be defensible in interview

---

## 9. Success criteria (end of Month 6 — 2026-11-20)

- [ ] 3 deployed projects, each with README + tests + blog post
- [ ] 150+ NeetCode problems solved, can solve a new medium in 30 min
- [ ] Can explain (whiteboard) every Phase 1 fundamentals topic for 5 min without notes
- [ ] 1 paid job offer **or** advanced-stage interview at 3+ companies
- [ ] Public presence: GitHub green, LinkedIn active, 4+ blog posts

---

## 10. Immediate next steps (this week)

1. Create GitHub repo `job-market-scraper`, push skeleton (README, `pyproject.toml`, `docker-compose.yml`)
2. Sign up: RapidAPI (JSearch), Adzuna API key, RemoteOK (no key needed)
3. Postgres + alembic running locally, first migration: `job` table
4. First collector: RemoteOK JSON endpoint → insert raw → verify in DB
5. Daily commit, even small
