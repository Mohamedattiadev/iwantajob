from __future__ import annotations

import os
import threading
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import PlainTextResponse, HTMLResponse
from pydantic import BaseModel
from typing import Any

from . import chat as chat_mod
from . import cv as cv_mod
from . import latex as latex_mod
from . import profile as profile_mod
from .db import Application


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    messages: list[ChatMessage]


class NoteIn(BaseModel):
    content: str


class ProfileIn(BaseModel):
    data: dict[str, Any]


class SkillRate(BaseModel):
    skill: str
    level: int


class ApplyIn(BaseModel):
    job_id: int
    status: str | None = "applied"
    notes: str | None = ""


class ApplyUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None


class SearchImproveIn(BaseModel):
    query: str
    context: str = "jobs"  # "jobs" | "learn" | "skills" | generic
    hint: str = ""         # optional user-supplied intent ("ML internships in Berlin")
from sqlalchemy import func, select

from .collectors import COLLECTORS, upsert_jobs
from .db import Job, JobSkill, init_db, session_scope
from .extractor import extract_all
from . import notes as notes_mod
from .quality import REAL_THRESHOLD, score_jobs
from .report import KNOWN_SKILLS

PKG_DIR = Path(__file__).resolve().parent

# Simple in-memory job tracker. One scrape at a time.
_scrape_lock = threading.Lock()
_scrape_state: dict = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "log": [],
    "result": None,
    "error": None,
}




def _scrape_job(sources: list[str]) -> None:
    with _scrape_lock:
        _scrape_state.update(
            running=True,
            started_at=datetime.utcnow().isoformat() + "Z",
            finished_at=None,
            log=[],
            result=None,
            error=None,
        )
    try:
        totals = {"fetched": 0, "new": 0, "dup": 0}
        for src in sources:
            if src not in COLLECTORS:
                _scrape_state["log"].append(f"skip unknown source: {src}")
                continue
            _scrape_state["log"].append(f"collecting {src} ...")
            try:
                jobs = COLLECTORS[src]()
                ins, skip = upsert_jobs(jobs)
                _scrape_state["log"].append(f"  {src}: fetched={len(jobs)} new={ins} dup={skip}")
                totals["fetched"] += len(jobs)
                totals["new"] += ins
                totals["dup"] += skip
            except Exception as e:
                _scrape_state["log"].append(f"  {src} failed: {e}")

        _scrape_state["log"].append("extracting skills ...")
        n, k = extract_all(only_unextracted=True)
        _scrape_state["log"].append(f"  extracted jobs={n} skill_rows_added={k}")

        _scrape_state["result"] = {
            **totals,
            "extracted_jobs": n,
            "skill_rows_added": k,
        }
    except Exception as e:  # belt and suspenders
        _scrape_state["error"] = str(e)
    finally:
        _scrape_state["finished_at"] = datetime.utcnow().isoformat() + "Z"
        _scrape_state["running"] = False


def create_app() -> FastAPI:
    init_db()
    app = FastAPI(title="jobscraper API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # gzip large responses (e.g. /api/jobs paged lists) to cut LAN bandwidth.
    app.add_middleware(GZipMiddleware, minimum_size=500)

    # In-memory cache for _load(): invalidates when the SQLite file mtime changes
    # or an Application/Profile mutation bumps `_cache_bump`. ~2s → ~5ms per call.
    from .config import DB_PATH as _DB_PATH
    _cache: dict[str, Any] = {"key": None, "jobs": None, "scores": None, "bump": 0}

    def _bump_cache():
        _cache["bump"] += 1

    def _load() -> tuple[list[Job], dict[int, int]]:
        try:
            mtime = _DB_PATH.stat().st_mtime_ns
        except OSError:
            mtime = 0
        key = (mtime, _cache["bump"])
        if _cache["key"] == key and _cache["jobs"] is not None:
            return _cache["jobs"], _cache["scores"]  # type: ignore[return-value]
        with session_scope() as s:
            jobs = list(s.scalars(select(Job)))
            for j in jobs:
                _ = [(sk.skill, sk.category) for sk in j.skills]
            # Detach so they survive after session_scope exits.
            for j in jobs:
                s.expunge(j)
        scores = score_jobs(jobs)
        _cache["key"], _cache["jobs"], _cache["scores"] = key, jobs, scores
        return jobs, scores

    def _skill_counts(jobs: list[Job]) -> tuple[Counter, dict[str, str]]:
        counts: Counter = Counter()
        cat_of: dict[str, str] = {}
        for j in jobs:
            for sk in j.skills:
                counts[sk.skill] += 1
                cat_of[sk.skill] = sk.category
        return counts, cat_of

    def _serialize_job(j: Job, score: int) -> dict:
        from . import apply_bot
        return {
            "id": j.id,
            "source": j.source,
            "source_url": j.source_url,
            "title": j.title,
            "company": j.company,
            "location": j.location,
            "remote": bool(j.remote),
            "posted_at": j.posted_at.isoformat() if j.posted_at else None,
            "seniority": j.seniority,
            "salary_min": j.salary_min,
            "salary_max": j.salary_max,
            "currency": j.currency,
            "score": score,
            "is_intern": apply_bot.is_intern(j),
            "skills": [
                {"skill": sk.skill, "category": sk.category} for sk in j.skills
            ],
            "description_excerpt": (j.description or "")[:600],
        }

    @app.get("/api/stats")
    def api_stats():
        jobs, scores = _load()
        target = [j for j in jobs if j.seniority in (None, "intern", "junior")]
        real = [j for j in target if scores.get(j.id, 0) >= REAL_THRESHOLD]
        by_src = Counter(j.source for j in jobs)
        by_sen = Counter(j.seniority or "unknown" for j in target)
        counts, cat_of = _skill_counts(real)
        return {
            "total": len(jobs),
            "target": len(target),
            "real": len(real),
            "by_source": [{"name": k, "value": v} for k, v in by_src.most_common()],
            "by_seniority": [{"name": k, "value": v} for k, v in by_sen.most_common()],
            "top_skills": [
                {"skill": s, "count": n, "category": cat_of[s], "have": s in KNOWN_SKILLS}
                for s, n in counts.most_common(20)
            ],
            "generated_at": datetime.utcnow().isoformat() + "Z",
        }

    @app.get("/api/jobs")
    def api_jobs(
        q: Optional[str] = None,
        source: Optional[str] = None,
        seniority: str = "junior_or_unknown",
        min_score: int = REAL_THRESHOLD,
        skill: Optional[str] = None,
        limit: int = 200,
        offset: int = 0,
    ):
        jobs, scores = _load()

        if seniority == "junior_or_unknown":
            jobs = [j for j in jobs if j.seniority in (None, "intern", "junior")]
        elif seniority != "all":
            jobs = [j for j in jobs if j.seniority == seniority]

        jobs = [j for j in jobs if scores.get(j.id, 0) >= min_score]
        if source:
            jobs = [j for j in jobs if j.source == source]
        if skill:
            jobs = [j for j in jobs if any(sk.skill == skill for sk in j.skills)]
        if q:
            ql = q.lower()
            jobs = [
                j for j in jobs
                if ql in (j.title or "").lower()
                or ql in (j.company or "").lower()
                or ql in (j.description or "").lower()
            ]

        jobs.sort(
            key=lambda j: (scores.get(j.id, 0), j.posted_at or datetime.min),
            reverse=True,
        )

        total = len(jobs)
        page = jobs[offset : offset + limit]

        with session_scope() as s:
            sources = [r[0] for r in s.execute(select(Job.source).distinct()).all()]

        all_skills_counts, _ = _skill_counts(jobs)
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "items": [_serialize_job(j, scores.get(j.id, 0)) for j in page],
            "facets": {
                "sources": sources,
                "skills": [s for s, _ in all_skills_counts.most_common(80)],
            },
        }

    @app.get("/api/learn")
    def api_learn():
        jobs, scores = _load()
        target = [j for j in jobs if j.seniority in (None, "intern", "junior")]
        real = [j for j in target if scores.get(j.id, 0) >= REAL_THRESHOLD]
        counts, cat_of = _skill_counts(real)
        total_real = max(1, len(real))

        gaps = []
        have = []
        for s, n in counts.most_common():
            row = {
                "skill": s,
                "count": n,
                "pct": round(100 * n / total_real, 1),
                "category": cat_of[s],
            }
            (have if s in KNOWN_SKILLS else gaps).append(row)

        by_cat: dict[str, list[dict]] = defaultdict(list)
        for g in gaps:
            by_cat[g["category"]].append(g)

        return {
            "total_real": len(real),
            "gaps": gaps[:30],
            "have": have,
            "by_category": by_cat,
        }

    @app.post("/api/scrape", status_code=202)
    def api_scrape(
        background: BackgroundTasks,
        source: Optional[str] = Query(None, description="One source or omit for all."),
    ):
        if _scrape_state["running"]:
            raise HTTPException(409, detail="scrape already running")
        sources = [source] if source else list(COLLECTORS)
        background.add_task(_scrape_job, sources)
        return {"status": "queued", "sources": sources}

    @app.get("/api/scrape/status")
    def api_scrape_status():
        return _scrape_state

    @app.get("/api/scrape/sources")
    def api_scrape_sources():
        # Marks sources that require env keys so the UI can warn.
        needs = {
            "adzuna": ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
            "jsearch": ["RAPIDAPI_KEY"],
        }
        return [
            {
                "id": src,
                "configured": all(os.environ.get(k) for k in needs.get(src, [])),
                "requires": needs.get(src, []),
            }
            for src in COLLECTORS
        ]

    @app.get("/api/notes/{skill}")
    def api_get_note(skill: str):
        # Best-effort category lookup so generic template gets a meaningful word.
        with session_scope() as s:
            row = s.execute(
                select(JobSkill.category).where(JobSkill.skill == skill).limit(1)
            ).first()
        category = row[0] if row else "skill"
        return {
            "skill": skill,
            "category": category,
            "content": notes_mod.load_note(skill, category),
        }

    @app.put("/api/notes/{skill}")
    def api_put_note(skill: str, body: NoteIn):
        notes_mod.save_note(skill, body.content)
        return {"ok": True, "bytes": len(body.content)}

    @app.post("/api/notes/{skill}/reset")
    def api_reset_note(skill: str):
        with session_scope() as s:
            row = s.execute(
                select(JobSkill.category).where(JobSkill.skill == skill).limit(1)
            ).first()
        category = row[0] if row else "skill"
        return {"content": notes_mod.reset_note(skill, category)}

    # -------- CV / profile --------

    @app.get("/api/profile")
    def api_profile_get():
        return profile_mod.load()

    @app.put("/api/profile")
    def api_profile_put(body: ProfileIn):
        profile_mod.save(body.data)
        return profile_mod.load()

    @app.post("/api/cv/upload")
    async def api_cv_upload(file: UploadFile = File(...)):
        raw = await file.read()
        if not raw:
            raise HTTPException(400, "empty upload")
        if (file.filename or "").lower().endswith(".pdf") or raw[:4] == b"%PDF":
            parsed = cv_mod.parse_pdf(raw)
        else:
            parsed = cv_mod.parse_text(raw.decode("utf-8", errors="replace"))
        merged = profile_mod.load()
        # Replace only present fields; preserve manual edits user may have.
        for k, v in parsed.items():
            if k == "_meta":
                continue
            if k == "skills":
                # Merge: keep higher level if existing > parsed
                existing = merged.get("skills") or {}
                for sk, lvl in v.items():
                    if existing.get(sk, 0) < lvl:
                        existing[sk] = lvl
                merged["skills"] = existing
            elif k == "personal":
                pers = merged.get("personal") or {}
                for pk, pv in v.items():
                    if pk == "links":
                        cur_links = pers.get("links") or {}
                        for lk, lv in pv.items():
                            if lv and not cur_links.get(lk):
                                cur_links[lk] = lv
                        pers["links"] = cur_links
                    elif pv and not pers.get(pk):
                        pers[pk] = pv
                merged["personal"] = pers
            else:
                if v and not merged.get(k):
                    merged[k] = v
        profile_mod.save(merged)
        return {"profile": merged, "meta": parsed.get("_meta", {})}

    @app.put("/api/profile/skills")
    def api_set_skill(body: SkillRate):
        return cv_mod.update_skill(body.skill, body.level)

    @app.get("/api/cv/markdown")
    def api_cv_md(min_level: int = 3, template: str = "classic"):
        # Markdown is the canonical lossless form — same for every template.
        del template
        return PlainTextResponse(cv_mod.render_markdown(min_level=min_level))

    @app.get("/api/cv/html")
    def api_cv_html(min_level: int = 3, template: str = "classic"):
        return HTMLResponse(cv_mod.render_html(min_level=min_level, template=template))

    @app.get("/api/cv/templates")
    def api_cv_templates():
        return {
            "templates": [
                {"id": "classic",   "name": "Classic",   "desc": "Navy accent. Balanced two-column. Safe default."},
                {"id": "modern",    "name": "Modern",    "desc": "Bold blue. Generous spacing. Easy to skim."},
                {"id": "executive", "name": "Executive", "desc": "Formal corporate. Charcoal serif. Senior-leadership feel."},
                {"id": "academic",  "name": "Academic",  "desc": "Research/grad-school. Airy single-column serif."},
                {"id": "tech",      "name": "Tech",      "desc": "Developer-flavored. Monospace headings. Teal accent."},
                {"id": "elegant",   "name": "Elegant",   "desc": "Serif small-caps. Centered headings. Hairline rules."},
                {"id": "sidebar",   "name": "Sidebar",   "desc": "Sky accent. Hairline column divider."},
                {"id": "compact",   "name": "Compact",   "desc": "Tighter spacing. Fits more on one page."},
                {"id": "minimal",   "name": "Minimal",   "desc": "Black-and-white. ATS-safe. Maximum readability."},
            ],
            "default": "classic",
        }

    @app.get("/api/cv/tex")
    def api_cv_tex(min_level: int = 3, template: str = "classic"):
        return PlainTextResponse(latex_mod.render_tex(min_level=min_level, template=template))

    @app.get("/api/cv/pdf/available")
    def api_cv_pdf_available():
        import shutil
        return {"available": bool(shutil.which("pdflatex"))}

    @app.get("/api/cv/pdf")
    def api_cv_pdf(min_level: int = 3, template: str = "classic", dl: int = 0):
        tex = latex_mod.render_tex(min_level=min_level, template=template)
        result = latex_mod.compile_pdf(tex)
        if result is None:
            raise HTTPException(503, detail="pdflatex not installed. Install texlive or use the .tex export.")
        if isinstance(result, tuple):  # (None, error_log)
            raise HTTPException(500, detail=f"pdflatex compile failed:\n{result[1][:2000]}")
        from fastapi.responses import Response
        disp = "attachment" if dl else "inline"
        return Response(content=result, media_type="application/pdf",
                        headers={"Content-Disposition": f"{disp}; filename=cv-{template}.pdf"})

    # -------- Applications (apply tracker / dedupe) --------

    @app.get("/api/applications")
    def api_applications():
        with session_scope() as s:
            rows = list(s.execute(
                select(Application, Job).join(Job, Application.job_id == Job.id)
                .order_by(Application.applied_at.desc())
            ).all())
        return [
            {
                "id": a.id,
                "job_id": a.job_id,
                "applied_at": a.applied_at.isoformat() if a.applied_at else None,
                "status": a.status,
                "notes": a.notes or "",
                "follow_up_at": a.follow_up_at.isoformat() if a.follow_up_at else None,
                "job": {
                    "id": j.id,
                    "title": j.title,
                    "company": j.company,
                    "source": j.source,
                    "source_url": j.source_url,
                    "posted_at": j.posted_at.isoformat() if j.posted_at else None,
                },
            }
            for a, j in rows
        ]

    @app.post("/api/applications", status_code=201)
    def api_apply(body: ApplyIn):
        with session_scope() as s:
            exists = s.scalar(select(Application).where(Application.job_id == body.job_id))
            if exists:
                exists.status = body.status or exists.status
                if body.notes:
                    exists.notes = body.notes
                return {"id": exists.id, "duplicated": True}
            a = Application(job_id=body.job_id, status=body.status or "applied", notes=body.notes or "")
            s.add(a)
            s.flush()
            return {"id": a.id, "duplicated": False}

    @app.patch("/api/applications/{app_id}")
    def api_apply_update(app_id: int, body: ApplyUpdate):
        with session_scope() as s:
            a = s.get(Application, app_id)
            if not a:
                raise HTTPException(404)
            if body.status:
                a.status = body.status
            if body.notes is not None:
                a.notes = body.notes
        return {"ok": True}

    @app.delete("/api/applications/{app_id}", status_code=204)
    def api_apply_delete(app_id: int):
        with session_scope() as s:
            a = s.get(Application, app_id)
            if a:
                s.delete(a)

    # -------- Telegram apply --------

    @app.get("/api/telegram/status")
    def api_telegram_status():
        from . import telegram as tg_mod
        return {
            "available": tg_mod.have_config(),
            "topics": {
                "applying": bool(os.environ.get("TELEGRAM_TOPIC_APPLYING")),
                "applied":  bool(os.environ.get("TELEGRAM_TOPIC_APPLIED")),
                "submit":   bool(os.environ.get("TELEGRAM_TOPIC_SUBMIT")),
                "skills":   bool(os.environ.get("TELEGRAM_TOPIC_SKILLS")),
            },
        }

    @app.post("/api/applications/telegram-apply")
    def api_telegram_apply(body: dict):
        from . import apply_bot
        job_id = body.get("job_id")
        if not isinstance(job_id, int):
            raise HTTPException(400, "job_id required (int)")
        res = apply_bot.send_apply_request(job_id)
        if not res.get("ok"):
            raise HTTPException(400, res.get("error") or "failed")
        return res

    # -------- Chat --------

    @app.get("/api/chat/status")
    def api_chat_status():
        return {"available": chat_mod.have_key()}

    @app.post("/api/chat")
    def api_chat(body: ChatIn):
        msgs_dict = [{"role": m.role, "content": m.content} for m in body.messages]
        # Provide live market snapshot to the model so answers are grounded.
        with session_scope() as s:
            jobs = list(s.scalars(select(Job)))
            for j in jobs:
                _ = [(sk.skill, sk.category) for sk in j.skills]
        scores = score_jobs(jobs)
        target = [j for j in jobs if j.seniority in (None, "intern", "junior")]
        real = [j for j in target if scores.get(j.id, 0) >= REAL_THRESHOLD]
        counts: Counter = Counter()
        for j in real:
            for sk in j.skills:
                counts[sk.skill] += 1
        snapshot = {
            "total_jobs": len(jobs),
            "real_junior_jobs": len(real),
            "top_skills": counts.most_common(20),
        }
        return chat_mod.chat(msgs_dict, snapshot)


    @app.post("/api/ai/search-improve")
    def api_ai_search_improve(body: SearchImproveIn):
        from . import llm as llm_mod
        if not llm_mod.have_provider():
            raise HTTPException(503, detail="No LLM provider configured (set GEMINI_API_KEY).")
        ctx_hint = {
            "jobs":   "job postings (titles, companies, technologies, seniority)",
            "learn":  "skill names from the curriculum",
            "skills": "skill names",
        }.get(body.context, "general full-text search")
        system = (
            "You rewrite messy search queries into concise, high-signal keywords that match a "
            f"full-text search over {ctx_hint}. Output ONLY the improved query — no quotes, no "
            "explanation, no leading 'Query:'. Keep it under 8 words. Prefer canonical technology "
            "names. Strip filler words. If the input is already clean, return it unchanged."
        )
        prompt_parts = [f"User input: {body.query.strip() or '(empty)'}"]
        if body.hint:
            prompt_parts.append(f"User intent hint: {body.hint.strip()}")
        try:
            improved = llm_mod.generate("\n".join(prompt_parts), system=system, max_tokens=60).strip()
        except llm_mod.LLMError as e:
            raise HTTPException(502, detail=str(e))
        # Strip surrounding quotes / trailing punctuation the model sometimes adds.
        improved = improved.strip().strip('"\'`').rstrip(".!?,")
        return {"query": improved or body.query}

    # -------- Conversations (assistant + interview history) --------

    @app.get("/api/conversations")
    def api_conv_list(type: str = ""):
        from .db import Conversation
        import json as _json
        with session_scope() as s:
            q = select(Conversation).order_by(Conversation.updated_at.desc())
            if type:
                q = q.where(Conversation.type == type)
            rows = list(s.scalars(q))
            return [{
                "id": c.id, "type": c.type, "title": c.title,
                "meta": _json.loads(c.meta_json or "{}"),
                "created_at": c.created_at.isoformat(),
                "updated_at": c.updated_at.isoformat(),
                "message_count": len(c.messages),
            } for c in rows]

    @app.post("/api/conversations", status_code=201)
    def api_conv_create(body: dict):
        from .db import Conversation
        import json as _json
        ctype = (body.get("type") or "").strip()
        if ctype not in {"assistant", "interview"}:
            raise HTTPException(400, "type must be 'assistant' or 'interview'")
        title = (body.get("title") or "New chat").strip()[:200]
        meta = body.get("meta") or {}
        with session_scope() as s:
            c = Conversation(type=ctype, title=title, meta_json=_json.dumps(meta))
            s.add(c); s.flush()
            return {"id": c.id, "type": c.type, "title": c.title, "meta": meta}

    @app.get("/api/conversations/{conv_id}")
    def api_conv_get(conv_id: int):
        from .db import Conversation
        import json as _json
        with session_scope() as s:
            c = s.get(Conversation, conv_id)
            if not c: raise HTTPException(404, "not found")
            return {
                "id": c.id, "type": c.type, "title": c.title,
                "meta": _json.loads(c.meta_json or "{}"),
                "messages": [{
                    "id": m.id, "role": m.role, "content": m.content,
                    "meta": _json.loads(m.meta_json or "{}"),
                    "created_at": m.created_at.isoformat(),
                } for m in c.messages],
            }

    @app.post("/api/conversations/{conv_id}/messages", status_code=201)
    def api_conv_msg_add(conv_id: int, body: dict):
        from .db import Conversation, Message
        import json as _json
        with session_scope() as s:
            c = s.get(Conversation, conv_id)
            if not c: raise HTTPException(404, "conversation not found")
            m = Message(
                conversation_id=conv_id,
                role=body.get("role", "user"),
                content=body.get("content", ""),
                meta_json=_json.dumps(body.get("meta") or {}),
            )
            s.add(m); s.flush()
            c.updated_at = datetime.utcnow()
            return {"id": m.id}

    @app.patch("/api/conversations/{conv_id}")
    def api_conv_patch(conv_id: int, body: dict):
        from .db import Conversation
        with session_scope() as s:
            c = s.get(Conversation, conv_id)
            if not c: raise HTTPException(404, "not found")
            if "title" in body:
                c.title = (body["title"] or "Untitled").strip()[:200]
            return {"ok": True}

    @app.delete("/api/conversations/{conv_id}", status_code=204)
    def api_conv_delete(conv_id: int):
        from .db import Conversation
        with session_scope() as s:
            c = s.get(Conversation, conv_id)
            if c: s.delete(c)

    # -------- User goal (used by Learn page rerank) --------

    @app.get("/api/profile/goal")
    def api_goal_get():
        p = profile_mod.load()
        pers = p.get("personal") or {}
        return {"goal": pers.get("goal") or "", "ranked": pers.get("learn_ranked") or []}

    @app.put("/api/profile/goal")
    def api_goal_put(body: dict):
        p = profile_mod.load()
        pers = p.setdefault("personal", {})
        if "goal" in body:
            pers["goal"] = (body.get("goal") or "").strip()[:200]
        if "ranked" in body:
            pers["learn_ranked"] = body.get("ranked") or []
        profile_mod.save(p)
        return {"ok": True, "goal": pers.get("goal", ""), "ranked": pers.get("learn_ranked", [])}

    @app.post("/api/learn/rerank")
    def api_learn_rerank(body: dict):
        """Rerank candidate skills by relevance to user's stated goal.
        Body: {goal: str, candidates: [str]} → {ranked: [{skill, why}], goal}"""
        from . import llm
        import json as _json
        goal = (body.get("goal") or "").strip()
        candidates = body.get("candidates") or []
        if not goal:
            return {"error": "goal required"}
        if not candidates:
            return {"ranked": []}
        prompt = f"""You rerank skills by relevance to a user's career goal.

GOAL: {goal}
CANDIDATE SKILLS (drawn from real junior job postings):
{', '.join(candidates[:40])}

Return STRICT JSON only — no prose, no markdown — in this exact shape:
{{"ranked": [{{"skill": "<one from candidates>", "why": "<<=12 words>"}}, ...]}}
- Pick the TOP 5 most relevant skills for the goal.
- Use only skills from the candidate list (exact spelling).
- 'why' must be concrete: how it serves the goal.
"""
        try:
            text = llm.generate(prompt, max_tokens=400, temperature=0.2, tier="cheap")
        except llm.LLMError as e:
            return {"error": str(e)}
        text = text.strip()
        if text.startswith("```"):
            text = text.strip("`").lstrip("json").strip()
        try:
            data = _json.loads(text)
        except _json.JSONDecodeError:
            return {"error": "model returned non-JSON", "raw": text[:400]}
        # Filter to known candidates
        cand_lower = {c.lower(): c for c in candidates}
        ranked = []
        for it in (data.get("ranked") or [])[:5]:
            sk = (it.get("skill") or "").strip()
            if sk.lower() in cand_lower:
                ranked.append({"skill": cand_lower[sk.lower()], "why": (it.get("why") or "").strip()})
        return {"ranked": ranked, "goal": goal}

    @app.post("/api/interview")
    def api_interview(body: dict):
        from . import interview as iv
        topic = (body.get("topic") or "").strip()
        mode = body.get("mode") or "interview"
        lang = body.get("lang") or "en"
        messages = body.get("messages") or []
        return iv.run(topic=topic, mode=mode, lang=lang, messages=messages)

    @app.get("/api/health")
    def health():
        return {"ok": True, "time": datetime.utcnow().isoformat() + "Z"}

    @app.on_event("startup")
    def _start_bots():
        from . import apply_bot
        apply_bot.start_polling()

    @app.on_event("shutdown")
    def _stop_bots():
        from . import apply_bot
        apply_bot.stop_polling()

    return app


app = create_app()
