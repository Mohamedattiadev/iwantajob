# Backend Code Audit — `scraper/`

Scope: `scraper/src/jobscraper/**` (FastAPI app + job-scrape pipeline + LLM glue).
Method: full read of `web.py`, `llm.py`, `drawings.py`, `db.py`, `config.py`, structural grep across the package, recent git log.

---

## TL;DR — Highest-leverage problems

1. **`web.py` is a 1,882-line single-file API** with `create_app()` running 1,530 lines (`web.py:352`). Forty-plus routes, all Pydantic models, deterministic sketch helpers, scrape worker, WebSocket room, auth middleware, and the in-memory cache live in one module. Split into routers + helpers. Highest-leverage refactor in the repo.
2. **Three near-identical LLM call sites** (`_gemini_call`, `_groq_generate`, `_openai_call`) in `llm.py:102-231`. Same HTTP scaffolding, same 429/500/503/504 list, same `body.lower()` substring checks — three places to keep in sync.
3. **Markdown-fence stripping + JSON parsing duplicated across 5+ AI endpoints** (`web.py:881-885, 1380-1385, 1521-1526, 1696-1702`, plus `chat.py`). Same `re.sub(r"^```(?:json)?...")` + `json.loads` + 502 detail. One `parse_llm_json()` helper would kill it.
4. **`/api/sketch/transform` is a 280-line god-function** (`web.py:1192-1469`) doing: validation, trace logging, bbox math, deterministic fast-path call, LLM call, response parsing, op application, geometry audit. Five files writing to `/tmp/sketch-transform.log` on every request — production-unsafe (multiprocess collisions, disk fill, hard-coded `/tmp` path).
5. **Module-level mutable globals** in `web.py`: `_scrape_state` (`web.py:119`) and `_scrape_lock` are module-scoped — fine; but `_cache` (`web.py:395`) and `rooms` (`web.py:1811`) live inside `create_app()`, so they reset if anyone ever calls `create_app()` twice (tests). The lock only guards `_scrape_state` init — `_scrape_state["log"].append(...)` at `web.py:323-334` runs lock-free from the BackgroundTasks thread while `/api/scrape/status` reads it (`web.py:569`). Non-atomic list ops on shared state.
6. **No real authentication.** `SKETCH_AUTH_TOKEN` (`web.py:375-390`) is a shared bearer for *protected prefixes only* (`/api/drawings`, `/api/presence`, `/api/sketch`). `/api/profile`, `/api/applications`, `/api/cv/*`, `/api/chat`, `/api/conversations`, `/api/scrape`, `/api/ai/*` are unauthenticated and `CORSMiddleware` is `allow_origins=["*"]` (`web.py:357`). If exposed to LAN, anyone can read CV/profile/conversations.
7. **`body: dict` bypasses Pydantic on 8 endpoints** (`web.py:796, 1585, 1616, 1633, 1658, 1669, 1713, 1741`). `body.get("job_id")` etc. is hand-validated — `Pydantic` models exist for everything else but were skipped here.
8. **No test suite.** The only thing matching `test_*.py` is `scraper/scripts/test_sketch_transform.py`, which is an ad-hoc smoke script (not pytest). `pyproject.toml` has `pytest` as a dev dep but no `tests/` dir. Refactors are scary because nothing is pinned down.
9. **Drawings persistence: 3x write fan-out, no transaction across them** (`drawings.py:182-195`). SQLite write commits first, then legacy JSON, then native `.excalidraw`. A crash between writes leaves disk + DB diverged. No locking around the `load()→merge→save` round-trip (`drawings.py:163-168`); concurrent PUTs (laptop + iPad both autosaving) race even with `_reconcile_elements`.
10. **Fix-fix-fix churn on `sketch`.** Last 20 commits: 14 touch sketch (`fix(sketch)` × 7, `feat(sketch)` × 6). The hottest code in the repo has the least encapsulation and no tests.

---

## 1. Megafile problems

| File | LOC | Verdict |
|---|---|---|
| `web.py` | **1,882** | Split urgent. |
| `cv.py` | 536 | Tolerable, but `render_markdown` 149 lines + nested 147-line `link_repl` (`cv.py:358`) → extract. |
| `apply_bot.py` | 492 | Three thread loops + Telegram handling in one file. OK but border. |
| `latex.py` | 454 | `_preamble` is 154 lines of template strings (`latex.py:95`) — fine, but extract template strings. |
| `chat.py` | 435 | `_system_prompt` 119 lines, `_exec_tool` 128 lines (`chat.py:31, 150`). Long but cohesive. |
| `notes.py` | 369 | OK; mostly default templates. |
| `llm.py` | 239 | Right size, wrong abstraction (see §4). |

`create_app()` extraction targets:

- `web.py:115-307` — deterministic sketch helpers (`_WRAP_VERBS`, `_wrap_shape`, `_detect_color`, `_try_deterministic`) → `routes/sketch_deterministic.py` (pure module, easy to unit-test).
- `web.py:309-349` — `_scrape_job` worker → `scrape_worker.py`.
- `web.py:392-449` — `_cache`, `_load`, `_skill_counts`, `_serialize_job` → `services/jobs_cache.py`.
- `web.py:451-554` — stats/jobs/learn routes → `routes/jobs.py`.
- `web.py:556-585` — scrape control → `routes/scrape.py`.
- `web.py:587-613` — notes → `routes/notes.py`.
- `web.py:615-716` — CV/profile/PDF → `routes/cv.py`.
- `web.py:720-804` — applications + telegram → `routes/applications.py`.
- `web.py:808-836` — chat/rewrite → `routes/chat.py`.
- `web.py:838-1190` — sketch/generate (350 lines incl. layout algos) → `routes/sketch_generate.py` + `services/sketch_layout.py`.
- `web.py:1192-1469` — sketch/transform (280 lines) → `routes/sketch_transform.py`.
- `web.py:1471-1563` — sketch/ask, ai/search-improve → `routes/sketch_ai.py`.
- `web.py:1567-1666` — conversations + goal → `routes/conversations.py`.
- `web.py:1668-1754` — learn/rerank, interview, STT, TTS → `routes/ai_misc.py`.
- `web.py:1758-1863` — drawings + WS → `routes/drawings.py`.
- `web.py:1869-1877` — startup/shutdown → keep in `web.py`.
- Pydantic models (`web.py:26-105`) → `schemas.py`.

## 2. Route inventory

40 HTTP routes + 1 WebSocket, all attached inside `create_app()`. They fall into nine domains. Each domain becomes one `APIRouter`. The middleware (auth, gzip, CORS) and lifecycle hooks stay in `web.py`. Grouping table is the natural form of the extraction in §1; not repeating it.

## 3. Duplication

- **LLM JSON parse + fence strip** at `web.py:881-885`, `web.py:1380-1385`, `web.py:1521-1526`, `web.py:1696-1702`. Same `_re.sub(r"^```(?:json)?\s*|\s*```$", "", raw).strip()` + `json.loads`. Extract `llm_utils.parse_json(raw) -> dict | LLMParseError`.
- **`have_provider` guard** repeated at `web.py:847, 1277, 1482, 1542`. Make it a FastAPI dependency: `Depends(require_llm)`.
- **Inline imports** of `json/re/time/uuid/math` inside functions, 21 occurrences (`web.py:178, 179, 230, 243, 842-844, 977, 996, 1209-1212, 1478-1479, 1570, 1587, 1601, 1618, 1673, 1765, 1786`). These are leftovers from someone (or a tool) renaming to `_json` to dodge name shadowing. Move all to module top.
- **Trace-log helper** `_trace()` is local to `api_sketch_transform` (`web.py:1226-1231`). If/when `sketch_ask`/`sketch_generate` need traces, this will get copy-pasted. Promote to `tracing.py` with proper rotation.
- **`detail=str(e)` after `LLMError`** repeated 5x (`web.py:880, 1375, 1520, 1560`, `web.py:1378` for general). Could be a `@llm_endpoint` decorator that maps `LLMError → 502`.
- **`isinstance(..., list)` defensive checks on `data.get("elements")`** in `drawings.py:164, 166` — pattern repeats. Either trust the schema and validate at boundary, or wrap in a Pydantic model.
- **Excalidraw "base element" dict** is reconstructed in two places (`web.py:182-190` for wraps, `web.py:1118-1147` for generated nodes/text). One factory.

## 4. LLM provider chain (`llm.py`)

- `_gemini_call` (`llm.py:102`), `_groq_generate` (`llm.py:154`), `_openai_call` (`llm.py:197`) are 30-line clones with three differences: URL, auth header, response shape. **Abstract**: a `Provider` protocol or a dataclass `{name, build_payload(prompt, system, ...), extract_text(json)}` driven by a single `_call_provider(p, ...)`.
- Failure-mode tax: each provider duplicates the same status-code list `(429, 500, 503, 504)` and the same `body.lower() in ("quota", "rate", "unavailable", "overloaded")` heuristic. One classification function would do.
- `_chain_for` (`llm.py:85-97`) — `_have_gemini()` is checked twice in both branches (lite + flash). If `GEMINI_API_KEY` rotates between calls (it won't, but…), the two `_have_gemini()` checks aren't symmetric with the call sites that re-read `os.environ` (`llm.py:104, 156, 199`). Cache keys at startup.
- `generate()` (`llm.py:55`) treats DNS errors specially (`llm.py:78-80`) — but only inside the `LLMError` branch, not inside the `LLMQuotaError` branch. If gemini returns 503 first and groq has a DNS issue second, the user gets "all providers failed" instead of "offline".
- No retry/backoff inside a single provider; the fallback chain *is* the retry. If gemini blips 503 once and the chain falls to groq, the system silently switches providers. Add a single retry-with-jitter before falling through.

## 5. Sketch transform endpoint (`web.py:1192-1469`)

Code smells:

- **280 lines, deep nesting, side-effecting file writes inline.** Five `_trace(...)` calls interleaved with business logic.
- **`/tmp/sketch-transform.log`** hard-coded (`web.py:1223`). Multi-process workers (uvicorn `--workers >1`) collide; container/serverless deploy can't keep it; no rotation.
- **`_trace()` swallows all errors silently** (`web.py:1230-1231`) including `OSError` (disk full). At minimum log to stderr.
- **Truncation `body.elements[:120]`** (`web.py:1219`) is silent. If the user selects 200 elements, 80 disappear with no warning in the audit.
- **`add_ops` not validated against an Excalidraw schema** (`web.py:1413-1416`). Only checks `isinstance(nv, dict)` and `isinstance(nv.get("type"), str)`. LLM can inject any keys (`onclick: "..."`, huge `points` arrays). Sanitize against a known field allowlist — the same one used for `slim` (`web.py:1283-1289`).
- **Audit `_encloses` cast `float(outer.get("x") or 0)`** (`web.py:1425-1428`) — `outer.get("x") or 0` treats `0.0` as falsy and substitutes `0` (fine but accidental). Use `outer.get("x", 0)`.
- **Deterministic + LLM paths return slightly different shapes**: deterministic returns `{elements, ops}` (`web.py:250-253, 259-262`), LLM returns `{elements, ops}` (`web.py:1465-1469`) — OK they match, but no shared model. Define `SketchTransformResult(BaseModel)`.
- **`_try_deterministic` ordering**: recolor branch (`web.py:265`) matches `"black"` etc. — but `"black"` also appears in shape requests ("put in a black box"). Today the wrap branch runs first (`web.py:256-262`), but if the user says "put in a red square", wrap matches and recolor is skipped. The recolor of the *new* shape is then lost. Edge case, but worth a test.
- **`_detect_color`** mixes hex-search against `text`, named-color search against `t` (lowercased) (`web.py:231, 235-237`). Confusing inconsistency.

## 6. State / globals

- `_scrape_lock` + `_scrape_state` at module scope (`web.py:118-126`). Lock only used to *initialize* state (`web.py:310-318`). Writes inside the loop (`web.py:323, 325, 329, 334, 336, 338`) are lock-free; `/api/scrape/status` reads lock-free. List `.append` on CPython is GIL-atomic but `.update()` of multiple keys is not.
- `_cache` (`web.py:395`) captured by closure in `_load`. Not thread-safe — `_load()` reads `_cache["key"]`, then `_DB_PATH.stat()`, then assigns. Two concurrent requests can both miss-then-fill, doing two `session_scope()` reads.
- `rooms: dict[str, set[WebSocket]]` (`web.py:1811`) is closure-scoped and protected by `rooms_lock` (`web.py:1812`) — done correctly.
- `apply_bot.py` has three thread handles (`_poll_thread`, `_scan_thread`, `_digest_thread` at `apply_bot.py:240, 296, 363`) + a single `_poll_stop` event. Started in `@app.on_event("startup")` (`web.py:1869`) — uvicorn `--workers N` runs `N` copies of all of them. Should guard with a "worker-0 only" check or use a separate worker process.

## 7. Data validation

- 8 endpoints take `body: dict` (`web.py:796, 1585, 1616, 1633, 1658, 1669, 1713, 1741`). Inline `body.get("...")` + `isinstance` checks. Replace with Pydantic models.
- `SketchTransformIn.elements: list[dict[str, Any]]` (`web.py:86`) — no shape validation. A typed Excalidraw element model would catch many of the issues in §5.
- `ProfileIn.data: dict[str, Any]` (`web.py:40`) — full profile is unstructured. Acceptable since profile is freeform user data, but document the assumed shape.
- `DrawingIn.data: dict[str, Any]` (`web.py:60`) — same; trust frontend. Worth at least `model_config = {"extra": "ignore"}` on a real model.

## 8. Persistence

- SQLite via SQLAlchemy ORM (`db.py`). Tables: `job, job_skill, conversation, message, application, drawing`. `init_db()` calls `create_all` only (`db.py:129-130`). **No migrations.** Adding a column means: edit model + drop DB or run manual `ALTER TABLE`. Add Alembic.
- `drawings.py:182-195` triple-write (SQLite → legacy JSON → native `.excalidraw`). Each happens outside any cross-store transaction. If the process dies between the SQL commit and `_legacy_path(...).write_text()`, the next `load()` reads SQLite (newer) but `list_all()` legacy fallback still uses disk. Pick one source of truth (SQLite) and treat the others as best-effort exports.
- `drawings.save()` reconciliation race: `load(name)` (line 165) → reconcile → write (line 192). Two concurrent PUTs both read the pre-write state and both write their own merge. Last writer wins on the SQLite UPDATE, partially clobbering the other side. Wrap in `SELECT ... FOR UPDATE` (SQLite needs `BEGIN IMMEDIATE`) or use `versionNonce`-checking optimistic concurrency.
- `notes.py` writes to disk; not audited deeply here.

## 9. Error handling

Broad excepts (`grep -n "except Exception"`):

- `web.py:333` — per-source scrape failure → log to `_scrape_state["log"]`. Appropriate; one bad source shouldn't stop the run.
- `web.py:345` — outer `_scrape_job` belt-and-suspenders. Appropriate.
- `web.py:1230` — `_trace` swallows; should at least log once at WARN.
- `web.py:1376` — broad except in `/sketch/transform` mapped to 502 with `f"{type(e).__name__}: {e}"`. Comment justifies it ("so the proxy doesn't dump HTML"). Acceptable, but **leaks internal exception types** to client — see §14.
- `web.py:1822, 1850, 1854` — WebSocket send/recv failures pass silently. Appropriate (peer disconnected).
- `drawings.py:86, 104, 111` — corrupted JSON on disk treated as "missing". Hides real corruption. Log once.
- `db.py:139` — session rollback then re-raise. Correct.
- `cv.py:28`, `tts.py:52, 70`, `apply_bot.py:219, 255, 265, 329, 339`, `cli.py:42`, `chat.py:273` — mixed; most log first then continue. Generally OK.

Error-message leakage:

- `web.py:712` — `f"pdflatex compile failed:\n{result[1][:2000]}"` — leaks 2 KB of compile log to the client. Move to logs; return a generic 500.
- `web.py:885, 1385` — `f"AI returned non-JSON: {e}\n{raw[:200]}"` — leaks raw LLM output. Fine in dev, bad in prod.
- `web.py:1378` — leaks exception class name + message.

## 10. Dead code / TODOs

- `grep TODO|FIXME|XXX|HACK src/` → **0 hits** in source. Clean (or, more likely, comments-as-prose dominate — multi-paragraph rationale blocks at `web.py:367-376, 1255-1259, 1278-1279, 1369-1372, 1805-1810`. Useful but heavy; could move to `docs/`).
- `web.py:1192-1193` — dual route `@app.post("/api/ai/sketch-transform")` + `@app.post("/api/sketch/transform")`. Same on `sketch-generate` (`web.py:838-839`), `sketch-ask` (`web.py:1471-1472`). Aliases for frontend migration; pick one and deprecate.

## 11. Type hints

- Consistent on signatures; `dict[str, Any]` is the dominant escape hatch.
  - `_cache: dict[str, Any]` (`web.py:395`).
  - `SketchTransformIn.elements: list[dict[str, Any]]` (`web.py:86`) — should be a typed Excalidraw element union.
  - `ProfileIn.data` / `DrawingIn.data` — as above.
- `_serialize_job` (`web.py:428`) returns `dict` (no annotation). Make it a `JobOut(BaseModel)` and let FastAPI handle serialization.
- `_load` returns `tuple[list[Job], dict[int, int]]` with a `# type: ignore[return-value]` (`web.py:407`) — fix the cache types so the ignore goes away.

## 12. Tests

- `scraper/scripts/test_sketch_transform.py` (422 lines) is an end-to-end smoke driver that hits the running server. Not pytest.
- No `tests/` directory. No CI configuration visible.
- The pure functions are eminently testable and aren't tested: `_try_deterministic`, `_detect_wrap_target`, `_wrap_shape`, `_detect_color`, all the layout functions (`layered_layout` etc.), `_reconcile_elements` in `drawings.py`. Each should have a pytest module before any further sketch fix-up.

## 13. Dependencies

`pyproject.toml`:

- All deps minimum-pinned (`>=`), none upper-bounded. A surprise FastAPI 1.0 release breaks the build. Pin `<2` at minimum.
- `selectolax` is HTML parsing — only `extractor.py`? Worth verifying not vestigial.
- `feedparser` — used by RSS collectors. OK.
- `pypdf` — used in `cv.py`. OK.
- Missing for a project this size: `alembic` (migrations), `pytest-asyncio`, `pre-commit`.
- `ruff` is a dev dep but no `[tool.ruff]` config — wouldn't enforce anything if run.

## 14. Security / safety

- **API keys read from `os.environ` on every call** (`llm.py:104, 156, 199`; `chat.py:280`). Cheap (env is in-process) but trace-noise. Cache at module init.
- **CORS `allow_origins=["*"]`** (`web.py:357`) — fine for localhost dev, dangerous if exposed. Combined with the `SKETCH_AUTH_TOKEN` only protecting three prefixes (see #6 TL;DR), profile/CV/conversations are publicly readable to any LAN host.
- **`SKETCH_AUTH_TOKEN`** (`web.py:375-390`) — when unset, server is open. Default should be "deny" with a `DEV_OPEN=1` opt-out. Token compared with `!=` not `secrets.compare_digest` (`web.py:388, 1829`) → timing-attack adjacent (low risk for a long random token, but the right idiom is the constant-time compare).
- **`X-Auth-Token` or `?t=` query param** — token in URL ends up in proxy/access logs and browser history. Header-only would be better; the query option exists for the WebSocket which can't easily set headers.
- **No SQL injection risk** — all DB access through SQLAlchemy ORM expressions; only one `s.execute(select(...))` (`web.py:512`) and it's a parameterless distinct query.
- **File path traversal**: `/api/drawings/{name}` → `_slug(name)` (`drawings.py:30-32`) does `re.sub(r"[^a-z0-9_-]+", "-", name.lower())`. Safe — strips slashes, dots, everything non-alphanumeric. Good.
- **CV upload** (`web.py:626-663`) accepts arbitrary bytes, runs `pypdf` on them. `pypdf` has known DoS-on-malformed-PDF bugs; consider a size cap. No size limit on the upload (`raw = await file.read()` reads everything).
- **`pdflatex` invocation** (`latex.py`, via `api_cv_pdf`): if `template` param is user-controllable, ensure no shell escapes. Quick check needed — the `.tex` is generated then compiled.
- **WebSocket** (`web.py:1825`): no rate limiting, no message size cap. A peer can `ws.send_text("X" * 100_000_000)` and it'll fan out to every other peer. Add `max_message_size` and per-IP throttling.
- **`/api/applications/telegram-apply`** (`web.py:795-804`) accepts `body: dict`, then validates `job_id` by `isinstance(int)`. OK, but combined with the no-auth posture, anyone on LAN can fire Telegram notifications.

## 15. Long functions (> 100 lines)

| Location | Lines |
|---|---|
| `web.py:352 create_app()` | 1,530 |
| `web.py:1192 api_sketch_transform` | 278 |
| `web.py:838 api_sketch_generate` | 354 |
| `chat.py:31 _system_prompt` | 119 |
| `chat.py:150 _exec_tool` | 128 |
| `cv.py:42 parse_text` | 94 (just over the practical bar) |
| `cv.py:197 render_markdown` | 149 |
| `cv.py:358 link_repl` (nested) | 147 |
| `latex.py:95 _preamble` | 154 (template string — OK) |

## 16. Recent commits — fix-fix-fix pattern

Last 25 commits: **14 touch sketch**. Pattern:

- `b2e9adc fix(sketch): tight SVG viewBox + reload meta-sync safety net`
- `dcc34ca fix(sketch+ui): PNG/SVG color parity, paper density, dropdown z-index`
- `411931d feat(sketch): deterministic AI ops, robust PDF export, crash recovery`
- `69637b9 fix(sketch): paper modes render pattern over bg-card wrapper`
- `ac6e84c fix(sketch): laser-lock stroke shape ...`
- `45ec392 fix(sketch): view-mode hides minimap + laser-lock ...`
- `301b6c9 fix(sketch): real laser-lock ...`
- `2e87fec fix(sketch): laser button works immediately ...`
- `b509786 fix(sketch): PDF paper/strokes correct ...`
- `d017b6c fix(sketch): plain-mode book pages visible ...`

Five consecutive commits on "laser-lock" alone. **Symptom**: sketch logic is at the edge of comprehensibility. Cause: no tests, mega-function. The two fixes — split into focused modules, add pytest harness for the pure helpers — are the same.

---

## Refactor roadmap

Order is chosen for impact and reversibility (cheap wins first, scary wins last).

1. **(0.5 day) Hoist inline imports.** Move all `import json as _json` etc. to module top in `web.py`. Pure mechanical, zero risk.
2. **(0.5 day) Extract `llm_utils.parse_json` + `require_llm` Depends.** Kills the 5x duplication and the 4x `have_provider()` guard. Touches `web.py` only.
3. **(1 day) Replace `body: dict` with Pydantic models** for the 8 affected endpoints. Add `TelegramApplyIn`, `ConversationIn`, `MessageIn`, `ConversationPatchIn`, `GoalIn`, `LearnRerankIn`, `InterviewIn`, `TTSIn`.
4. **(1 day) Unify provider scaffolding in `llm.py`.** Single `_call(provider_spec, ...)` with a `ProviderSpec` dataclass. Halves the file.
5. **(2 days) Carve `web.py` into routers.** Use FastAPI `APIRouter` per §1. Mechanical, but big diff — do alongside step 6.
6. **(1 day) Add pytest harness.** Cover `_try_deterministic`, `_wrap_shape`, `_detect_color`, `_reconcile_elements`, the layout functions, and the `_encloses` audit. ~30 tests, all pure functions.
7. **(1 day) Sketch-transform decomposition.** Inside its new router: split into `_build_bbox`, `_apply_ops`, `_audit`, `_trace_event`. Move `_trace` to a proper logger with a rotating handler (and a config-driven path, not `/tmp/sketch-transform.log`).
8. **(1 day) Drawings persistence consolidation.** Make SQLite authoritative; turn legacy JSON + `.excalidraw` writes into best-effort exports behind a flag. Add `versionNonce`-based optimistic concurrency on `Drawing.content_json`.
9. **(2 days) Auth + CORS.** Decide on the auth model: bearer token middleware applied to *everything* by default, with an explicit allowlist for public endpoints (`/api/health`, possibly `/api/scrape/sources`). Lock CORS to known origins. Use `secrets.compare_digest`.
10. **(2 days) Alembic migrations.** Baseline current schema, add the first migration. Stop relying on `create_all`.

Out-of-scope but worth flagging:
- `apply_bot.py` thread lifecycle vs uvicorn workers — needs a single-leader pattern.
- WebSocket message size limits.
- CV upload size limits + `pypdf` hardening.

Estimated total: ~12 engineer-days for a thorough pass. The first 4 items (3 days) clear most of the duplication-and-validation debt and unblock everything else.
