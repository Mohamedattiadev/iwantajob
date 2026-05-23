# Refactor prompt — paste into a fresh Claude Code session

You are picking up a refactor that's been pre-audited. Read this whole file before doing anything.

## Project
- Repo root: `/home/ati/Attia-Pro/Projectos/IWANTAJOB`
- Frontend: `web/` (Next.js, Excalidraw-based sketch app)
- Backend: `scraper/` (FastAPI + SQLite + LLM router)
- Two audit reports already exist at repo root — **READ BOTH FIRST**:
  - `CODE_AUDIT_FRONTEND.md`
  - `CODE_AUDIT_BACKEND.md`

## Mission
Execute the refactor roadmaps in both audits. Preserve every user-facing behavior. Make the system measurably faster. Ship in small, reviewable commits with passing checks after each.

## Hard rules
1. **No behavior regressions.** Every visible feature in `web/src/components/skill-sketch.tsx` (sketch canvas, AI transform, PNG/SVG/PDF export, book mode, libraries, paper modes, canvas colors, presence, websocket collab, frame presentation, AI ask/chat, AI improve search, etc.) must keep working. Same for every backend endpoint.
2. **Commit per logical step**, not at the end. Commit message format: `refactor(scope): what + why`. Run typecheck/lint/tests before each commit. If something fails, fix it before moving on — don't pile up errors.
3. **Never use `--no-verify`** on commits. Never force-push. Never `git reset --hard`.
4. **Don't break the canvas crash recovery.** The five-layer scrubbing in `skill-sketch.tsx` (initialData filter, updateScene monkey-patch, post-mount scrub, ExcalCrashBoundary, nukedInitialData) is there because Excalidraw render crashes on dangling element refs. Consolidate to ONE layer at the `updateScene` boundary — don't remove it entirely.
5. **Don't remove monkey-patches without replacing them.** The patched `Array.prototype.filter`, `Worker` constructor, and `console.warn/error` interceptors exist because:
   - Excalidraw's render hits transient `undefined.type` inside its own `.filter` calls
   - Excalidraw tries to load a subset-worker from a path Brave blocks in dev
   - The "Failed to use workers for subsetting" log spam is unwanted
   Move them out of module scope of `skill-sketch.tsx` to a dedicated `web/src/lib/sketch/excal-compat.ts` and import once. If you find a cleaner fix for the underlying Excalidraw bug, do that instead — but only if it's actually cleaner, not just different.
6. **Keep all deterministic AI fast-paths working.** `_try_deterministic()` in `scraper/src/jobscraper/web.py` (wrap/delete/recolor/stroke) must keep passing `scraper/scripts/test_sketch_transform.py` 23/23.
7. **Auth/CORS hardening is allowed.** Switch `==`/`!=` token compare to `secrets.compare_digest`. Restrict `allow_origins` from `["*"]` to a configured list. Extend auth gate to the currently unguarded endpoints (CV, profile, applications, conversations, chat, AI improve, sketch ask). Document the env var name.
8. **Backups:** before any destructive refactor, create a branch `refactor/cleanup-YYYYMMDD` off main. Work there. Open PRs back into main, don't merge directly unless instructed.

## Order of operations (do them in this order)

### Phase 1 — Cheap wins, ~1 day total

**Frontend**
1. Extract `web/src/lib/sketch/color.ts` with `isDarkHex` / `isLightHex` / `hexToLuma`. Delete the 4 inline copies in `skill-sketch.tsx` and the one in `drawPaperPattern`. Import everywhere.
2. Extract `web/src/lib/sketch/excal-compat.ts` containing the module-scope monkey-patches currently at the top of `skill-sketch.tsx` (Array.prototype.filter patch, Worker patch, console interceptors). Call once from `web/src/app/layout.tsx` or a dedicated client wrapper. Document why each exists in JSDoc.
3. Extract `web/src/lib/sketch/scrub.ts`. Centralize the element-sanitization logic that's duplicated across `initialData` memo, SWR mirror, `updateScene` patch, post-mount effect, and `nukedInitialData`. Drop to ONE invocation at the `updateScene` patch boundary; the rest call into the same helper.
4. Extract `web/src/lib/sketch/bbox.ts` for `selectionBBox` / `sceneBBox` / element bbox helpers (search the file for `Math.min(...minX...)` patterns — there are 6+ copies).

**Backend**
5. Collapse the three LLM provider functions in `scraper/src/jobscraper/llm.py:102-231` into one parameterized HTTP-based provider class. Keep the public `generate()` signature identical.
6. Extract `scraper/src/jobscraper/llm_response.py` with `strip_json_fence(raw: str) -> str` and `parse_llm_json(raw: str) -> dict`. Replace the 5 inlined copies in `web.py:881, 1380, 1521, 1696` plus the one in `/api/sketch/transform`.
7. Pin top-of-file imports in `web.py`. Remove every inline `import json as _json`, `import re as _re`, `import time as _time`, etc. (~21 of them).
8. Replace `==`/`!=` token comparison with `secrets.compare_digest`. Restrict CORS via env var `ALLOWED_ORIGINS` (comma-separated).

Commit after each numbered item. Run typecheck (`cd web && bunx tsc --noEmit`) + lint (`bunx eslint .`) + the audit test (`scraper/.venv/bin/python scraper/scripts/test_sketch_transform.py`). All must pass.

### Phase 2 — Backend route split, ~2-3 days

9. Convert each route group in `scraper/src/jobscraper/web.py` to its own FastAPI router under `scraper/src/jobscraper/routes/`:
   - `routes/drawings.py` (PUT/GET `/api/drawings/...`, `/api/presence/...`, WS `/ws/drawings/...`)
   - `routes/sketch.py` (`/api/sketch/generate`, `/api/sketch/transform`, `/api/sketch/ask`, `/api/ai/sketch-*`)
   - `routes/jobs.py`, `routes/applications.py`, `routes/profile.py`, `routes/cv.py`, `routes/conversations.py`, `routes/chat.py`, `routes/scrape.py`, `routes/ai.py`
10. `web.py` shrinks to `create_app()` that mounts every router. Target: < 200 lines.
11. Sketch-transform helpers (`_try_deterministic`, `_wrap_shape`, `_detect_wrap_target`, `_detect_color`, etc.) move to `scraper/src/jobscraper/sketch_ops.py`. Add unit tests in `scraper/tests/test_sketch_ops.py`.
12. Replace `body: dict` endpoints (8 of them, listed in audit) with explicit Pydantic models. Validate.
13. Module-level `_scrape_state` + `_scrape_lock` move into a small `ScrapeManager` class. Persist its state through a single `Manager` singleton attached to `app.state`.
14. Fix the `drawings.py` save() read-modify-write race: wrap the SQLite ops in a transaction; drop the 3-way (SQLite + JSON + .excalidraw) write or sequence it atomically.
15. Add `scraper/tests/test_endpoints.py` smoke tests for every route group using FastAPI's TestClient.

### Phase 3 — Frontend megafile split, ~3-5 days

16. Move sub-components out of `web/src/components/skill-sketch.tsx` into `web/src/components/sketch/`:
   - `SelectionAiWidget` → `components/sketch/SelectionAiWidget.tsx`
   - `BookPagesOverlay`, `BookNavWidget`, `BookOutlinePanel` → `components/sketch/book/*`
   - `PaperBackdrop` + `drawPaperPattern` → `components/sketch/paper.tsx`
   - `ExcalCrashBoundary` → `components/sketch/CrashBoundary.tsx`
   - `PropertyPanelSliders`, `ShapeIslandTools`, `TrimMoreToolsDropdown` → `components/sketch/toolbar/*`
   - Library helpers + libSeededRef logic → `components/sketch/library.tsx`
   - Minimap → `components/sketch/Minimap.tsx`
   - AI chat panel + ask → `components/sketch/ai/*`
17. Export functions move to `web/src/lib/sketch/exports/`:
   - `png.ts` (current `exportPng`)
   - `svg.ts` (current `exportSvg`)
   - `pdf.ts` (current PDF book exporter — the chunked render lives here)
   - `pptx.ts` (current `exportPptx`)
   - `excalidraw.ts` (native scene save)
   Each takes `{ api, customBg, paperMode, resolvedTheme, bookPages, bookPageCount, skill }` — no globals. Each is independently testable.
18. WebSocket + presence logic → `web/src/lib/sketch/collab.ts`. Single hook `useSketchCollab(slug, refs)`. Drops the duplication with `web/src/app/sketch/[slug]/page.tsx`.
19. Pick ONE transport: WS push OR SWR polling. The 500ms `dedupingInterval:0` + websocket together is the source of every "race" bug in the commit history. Recommendation: WS for live updates, SWR with 30s polling only as a fallback when WS disconnects.
20. Collapse `web/src/app/sketch/[slug]/page.tsx` into a thin wrapper that calls `<SkillSketch slug={...} />`. Audit found it reimplements ~70% of the same collab/save logic.

### Phase 4 — Performance, ~1-2 days

21. Audit `skill-sketch.tsx` for unstable callbacks passed to memoized children. Wrap with `useCallback` only where dep list is genuinely stable; otherwise mark the child as not-memoizable.
22. Move `JSON.stringify(bookPagesRef.current)` comparisons (used to detect doc diffs) to a hash-based diff. The stringify is called in the SWR effect on every poll.
23. PDF export already chunks. Verify peak memory profile with Chrome devtools on a 50-page book. If still > 500MB peak, drop exportScale or DPI further at high page counts.
24. Replace the `setTimeout(...,0)` yield pattern in the book PDF exporter with `await new Promise(r => requestIdleCallback(r))` where available.
25. SWR refresh: drop `refreshInterval: livePeers > 0 ? 500 : 3000` to `livePeers > 0 ? 2000 : 10000`. WS handles real-time; SWR is just safety net.

### Phase 5 — Auth hardening, ~0.5 day

26. Auth middleware now wraps every `/api/*` except an explicit allow-list (`/api/health`, `/api/scrape/sources/public` if any). Document the env var.
27. Add basic per-IP rate limiting on AI endpoints (`/api/sketch/transform`, `/api/sketch/ask`, `/api/ai/sketch-generate`). Naive in-memory token bucket is fine.
28. Replace hardcoded `/tmp/sketch-transform.log` with a configurable `SKETCH_TRACE_LOG` env var. Disable entirely when `NODE_ENV=production`.

## Quality gates (run after every commit)

```bash
# Frontend
cd /home/ati/Attia-Pro/Projectos/IWANTAJOB/web
bunx tsc --noEmit
bunx eslint .
bun test 2>/dev/null || true

# Backend
cd /home/ati/Attia-Pro/Projectos/IWANTAJOB/scraper
.venv/bin/python -m pyflakes src/
.venv/bin/python scripts/test_sketch_transform.py

# Sanity boot
cd /home/ati/Attia-Pro/Projectos/IWANTAJOB/scraper && .venv/bin/uvicorn jobscraper.web:app --port 8000 &
sleep 4
curl -s http://127.0.0.1:8000/api/scrape/status | head -c 200
kill %1
```

If any of these fail, fix before committing.

## Definition of done
- `skill-sketch.tsx` is < 800 LOC (was 5,892).
- `web.py` is < 200 LOC (was 1,882).
- Zero `as never`/`as unknown` in the new extracted files. The 103 escapes in skill-sketch are allowed to remain until Phase 3 extractions migrate them — but new code adds zero.
- Every route lives in `routes/*.py`.
- `scraper/tests/` exists with > 30 tests passing.
- Audit test still 23/23.
- 50-page PDF export completes in < 60s on the dev machine with peak browser memory < 600 MB.
- WebSocket + SWR no longer compete (one canonical transport).
- No new "Cannot read properties of undefined (reading 'type')" crash reports under normal use.
- CORS uses an env-var allowlist, not `*`. Token compare uses `secrets.compare_digest`.

## Anti-goals (don't do these)
- Don't introduce a state management library (Redux/Zustand/Jotai). Plain React + a few module-scope stores is fine.
- Don't migrate to a different sketch library. Excalidraw stays.
- Don't change the URL scheme. `/scratch` and `/sketch/[slug]` keep their paths.
- Don't change the SQLite schema unless absolutely required. If you must, write a migration in `scraper/src/jobscraper/migrations/`.
- Don't reformat unrelated files. Keep diffs surgical.
- Don't add new dependencies unless they replace > 200 LOC of hand-rolled code.

## Reporting
After each phase, append a short summary to a new file `REFACTOR_LOG.md` at repo root:
```
## Phase N — <date>
- Files touched
- LOC delta (before → after)
- Commits
- Anything weird you found
- What's left for next phase
```

Start by reading both audit reports cover-to-cover, then begin Phase 1.
