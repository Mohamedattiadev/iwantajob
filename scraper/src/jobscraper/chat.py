"""Gemini-powered chat assistant (Google AI Studio free tier).

Supports tool/function calling so the assistant can read+write notes, search jobs,
and update the user profile from chat.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

from .config import HTTP_TIMEOUT
from .profile import load as load_profile

log = logging.getLogger("chat")

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{MODEL}:generateContent"
)


def have_key() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))


def _system_prompt(market: dict[str, Any]) -> str:
    profile = load_profile()
    return f"""You are the user's personal career coach inside their jobscraper dashboard.
Be terse and concrete. No fluff. Recommend specific next actions tied to the data below.

USER PROFILE (live):
{json.dumps(profile, indent=2)}

JOB MARKET SNAPSHOT (live):
{json.dumps(market, indent=2)}

Rules:
- Reference specific skills, jobs, or numbers from the data above.
- Suggest concrete next steps: "go rate Docker", "open job #ID", "add this bullet to your CV".
- Never invent skills, jobs, or numbers the data does not show.
- If the user is unrated on many skills, push them to /learn first.
- Reply in same language as user."""


TOOLS_SCHEMA = [{
    "functionDeclarations": [
        {
            "name": "read_skill_note",
            "description": "Read the user's markdown note for a given skill (e.g. 'javascript', 'docker').",
            "parameters": {
                "type": "object",
                "properties": {"skill": {"type": "string"}},
                "required": ["skill"],
            },
        },
        {
            "name": "write_skill_note",
            "description": "Save or append content to the user's note for a skill. mode='append' adds; mode='replace' overwrites.",
            "parameters": {
                "type": "object",
                "properties": {
                    "skill": {"type": "string"},
                    "content": {"type": "string", "description": "Markdown content."},
                    "mode": {"type": "string", "enum": ["append", "replace"]},
                },
                "required": ["skill", "content"],
            },
        },
        {
            "name": "list_skill_notes",
            "description": "List all skill notes the user has, with line counts.",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "search_jobs",
            "description": "Search the user's scraped job database. Returns top matches by score.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Free text — searches title, company, description."},
                    "skill": {"type": "string", "description": "Optional: filter by required skill (e.g. 'react')."},
                    "limit": {"type": "integer", "description": "Max results, default 8."},
                },
            },
        },
        {
            "name": "update_profile_summary",
            "description": "Update the user's CV summary (1 short paragraph).",
            "parameters": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
            },
        },
        {
            "name": "read_profile",
            "description": "Read the user's full CV profile (personal info, experience, projects, skills, education).",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "add_cv_entry",
            "description": "Append a new entry to a CV section. Use for adding experience, projects, education, or certifications.",
            "parameters": {
                "type": "object",
                "properties": {
                    "section": {"type": "string", "enum": ["experience", "projects", "education", "certifications"]},
                    "raw": {"type": "string", "description": "Markdown-ish bullet block: title line + bullet points starting with -."},
                },
                "required": ["section", "raw"],
            },
        },
        {
            "name": "list_applications",
            "description": "List user's job applications with status and dates.",
            "parameters": {
                "type": "object",
                "properties": {"status": {"type": "string", "description": "Optional status filter: applied|interviewing|rejected|offer|ghost"}},
            },
        },
        {
            "name": "set_application_status",
            "description": "Update an application's status (applied → interviewing → offer/rejected/ghost).",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_id": {"type": "integer"},
                    "status": {"type": "string", "enum": ["applied", "interviewing", "rejected", "offer", "ghost"]},
                    "notes": {"type": "string"},
                },
                "required": ["job_id", "status"],
            },
        },
        {
            "name": "market_top_skills",
            "description": "Return the top N most-demanded skills across the scraped job database.",
            "parameters": {
                "type": "object",
                "properties": {"limit": {"type": "integer", "description": "Default 15."}},
            },
        },
    ],
}]


def _exec_tool(name: str, args: dict) -> dict:
    """Execute a tool call. Returns dict (sent back as functionResponse)."""
    try:
        if name == "read_skill_note":
            from . import notes as notes_mod
            skill = args.get("skill", "")
            return {"skill": skill, "content": notes_mod.load_note(skill)}
        if name == "write_skill_note":
            from . import notes as notes_mod
            skill = args.get("skill", "")
            content = args.get("content", "")
            mode = args.get("mode", "append")
            if mode == "append":
                existing = notes_mod.load_note(skill)
                sep = "\n\n" if existing and not existing.endswith("\n\n") else ""
                notes_mod.save_note(skill, existing + sep + content)
            else:
                notes_mod.save_note(skill, content)
            return {"ok": True, "skill": skill, "mode": mode, "bytes": len(content)}
        if name == "list_skill_notes":
            from .notes import NOTES_DIR
            items = []
            if NOTES_DIR.exists():
                for p in sorted(NOTES_DIR.glob("*.md")):
                    txt = p.read_text(encoding="utf-8", errors="replace")
                    items.append({"skill": p.stem, "lines": txt.count("\n") + 1, "bytes": len(txt)})
            return {"notes": items}
        if name == "search_jobs":
            from sqlalchemy import or_, select
            from .db import Job, session_scope
            from .quality import score_jobs
            q = (args.get("query") or "").strip()
            skill_filter = (args.get("skill") or "").strip().lower()
            limit = min(int(args.get("limit") or 8), 25)
            with session_scope() as s:
                stmt = select(Job)
                if q:
                    like = f"%{q}%"
                    stmt = stmt.where(or_(Job.title.ilike(like), Job.company.ilike(like), Job.description.ilike(like)))
                jobs = list(s.scalars(stmt))
                if skill_filter:
                    jobs = [j for j in jobs if any(sk.skill.lower() == skill_filter for sk in j.skills)]
                scores = score_jobs(jobs)
                jobs.sort(key=lambda j: scores.get(j.id, 0), reverse=True)
                jobs = jobs[:limit]
                return {"jobs": [{
                    "id": j.id, "title": j.title, "company": j.company,
                    "url": j.source_url, "source": j.source,
                    "score": scores.get(j.id, 0),
                    "skills": [sk.skill for sk in j.skills[:8]],
                } for j in jobs]}
        if name == "update_profile_summary":
            from .profile import load, save
            p = load()
            p.setdefault("personal", {})["summary"] = args.get("text", "")
            save(p)
            return {"ok": True}
        if name == "read_profile":
            return load_profile()
        if name == "add_cv_entry":
            from .profile import load, save
            section = args.get("section", "")
            raw = args.get("raw", "")
            if section not in {"experience", "projects", "education", "certifications"}:
                return {"error": "invalid section"}
            p = load()
            arr = p.get(section) or []
            arr.append({"raw": raw})
            p[section] = arr
            save(p)
            return {"ok": True, "section": section, "count": len(arr)}
        if name == "list_applications":
            from sqlalchemy import select
            from .db import Application, Job, session_scope
            status = (args.get("status") or "").strip()
            with session_scope() as s:
                rows = list(s.execute(
                    select(Application, Job).join(Job, Application.job_id == Job.id)
                    .order_by(Application.applied_at.desc())
                ).all())
                out = []
                for app_row, job_row in rows:
                    if status and app_row.status != status:
                        continue
                    out.append({
                        "id": app_row.id, "job_id": app_row.job_id,
                        "title": job_row.title, "company": job_row.company,
                        "status": app_row.status,
                        "applied_at": app_row.applied_at.isoformat() if app_row.applied_at else None,
                        "notes": app_row.notes or "",
                    })
                return {"applications": out, "count": len(out)}
        if name == "set_application_status":
            from sqlalchemy import select
            from .db import Application, session_scope
            with session_scope() as s:
                a = s.scalar(select(Application).where(Application.job_id == args.get("job_id")))
                if not a:
                    return {"error": "application not found"}
                a.status = args.get("status", a.status)
                if "notes" in args:
                    a.notes = args["notes"]
                return {"ok": True, "job_id": a.job_id, "status": a.status}
        if name == "market_top_skills":
            from collections import Counter
            from sqlalchemy import select
            from .db import Job, session_scope
            limit = min(int(args.get("limit") or 15), 50)
            counts: Counter = Counter()
            cats: dict[str, str] = {}
            with session_scope() as s:
                jobs = list(s.scalars(select(Job)))
                total = len(jobs)
                for j in jobs:
                    for sk in j.skills:
                        counts[sk.skill] += 1
                        cats[sk.skill] = sk.category
            top = counts.most_common(limit)
            return {"total_jobs": total, "top": [
                {"skill": k, "count": v, "pct": round(v / total * 100, 1) if total else 0,
                 "category": cats.get(k, "")} for k, v in top
            ]}
        return {"error": f"unknown tool: {name}"}
    except Exception as e:
        log.exception("tool %s failed", name)
        return {"error": str(e)}


def chat(messages: list[dict[str, str]], market_snapshot: dict[str, Any]) -> dict[str, Any]:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        return {
            "error": "GEMINI_API_KEY not set on the backend. "
                     "Get a free key at https://aistudio.google.com/apikey and restart the server with it.",
        }

    # Convert OpenAI-style messages → Gemini "contents" (role: user|model).
    contents: list[dict[str, Any]] = []
    for m in messages:
        role = m.get("role")
        text = m.get("content") or ""
        if not text:
            continue
        if role == "user":
            contents.append({"role": "user", "parts": [{"text": text}]})
        elif role == "assistant":
            contents.append({"role": "model", "parts": [{"text": text}]})

    sys_prompt = _system_prompt(market_snapshot) + (
        "\n\nYou have tools to read/write the user's skill notes, search their job database, "
        "and update their CV profile. Use them when relevant instead of asking the user to do it manually. "
        "Reference skills, jobs, and notes by name. Confirm before destructive overwrites (use append mode by default)."
    )

    tool_trace: list[dict[str, Any]] = []
    text_out = ""
    usage_total = None

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as c:
            for _ in range(6):  # up to 6 tool-call rounds
                payload = {
                    "systemInstruction": {"parts": [{"text": sys_prompt}]},
                    "contents": contents,
                    "tools": TOOLS_SCHEMA,
                    "generationConfig": {
                        "temperature": 0.4,
                        "maxOutputTokens": 1200,
                        "thinkingConfig": {"thinkingBudget": 0},
                    },
                }
                r = c.post(ENDPOINT, params={"key": key}, json=payload)
                r.raise_for_status()
                data = r.json()
                usage_total = data.get("usageMetadata") or usage_total

                cand = (data.get("candidates") or [{}])[0]
                parts = (cand.get("content") or {}).get("parts") or []
                fn_calls = [p["functionCall"] for p in parts if "functionCall" in p]
                if not fn_calls:
                    # Final text response.
                    text_out = "".join(p.get("text", "") for p in parts if "text" in p)
                    break

                # Echo model turn into contents, then run tools + send responses.
                contents.append({"role": "model", "parts": parts})
                response_parts: list[dict[str, Any]] = []
                for fc in fn_calls:
                    name = fc.get("name", "")
                    args = fc.get("args") or {}
                    result = _exec_tool(name, args)
                    tool_trace.append({"name": name, "args": args, "result_preview": _preview(result)})
                    response_parts.append({"functionResponse": {"name": name, "response": result}})
                contents.append({"role": "user", "parts": response_parts})
            else:
                text_out = text_out or "(tool loop limit reached without final answer)"
    except httpx.HTTPStatusError as e:
        return {"error": f"Gemini API error: {e.response.status_code} — {e.response.text[:300]}"}
    except httpx.HTTPError as e:
        return {"error": f"network error: {e}"}

    return {
        "text": text_out,
        "model": MODEL,
        "usage": usage_total,
        "tool_calls": tool_trace,
    }


def _preview(r: Any, n: int = 240) -> Any:
    """Compact representation of a tool result for the UI trace."""
    if isinstance(r, dict):
        if "jobs" in r and isinstance(r["jobs"], list):
            return {"jobs_count": len(r["jobs"]), "first": r["jobs"][:2]}
        if "notes" in r and isinstance(r["notes"], list):
            return {"notes_count": len(r["notes"])}
        if "content" in r:
            c = r.get("content") or ""
            return {**{k: v for k, v in r.items() if k != "content"},
                    "content_preview": (c[:n] + "…") if len(c) > n else c}
    return r


def rewrite(field: str, raw: str, instruction: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """Polish a CV field. field=summary|experience|project|education|generic."""
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        return {"error": "GEMINI_API_KEY not set on the backend."}

    profile = load_profile()
    style_by_field = {
        "summary": "1 paragraph, 2-3 sentences, first-person implicit (no 'I'), concrete strengths, end with a value statement. No buzzwords.",
        "experience": "Lead with role + company + dates on line 1. Then 3-5 bullets starting with strong action verbs (Built, Shipped, Led, Reduced). Quantify when possible. Each bullet ≤ 18 words.",
        "project": "Project name + 1-line pitch. Then 2-3 bullets: what it does, tech stack, outcome/metric. ≤ 18 words per bullet.",
        "education": "School — Degree, dates. One line. Add GPA or honors only if present.",
        "generic": "Tight, professional, ATS-friendly. No fluff.",
    }
    style = style_by_field.get(field, style_by_field["generic"])

    prompt = f"""You are polishing a single CV field for an ATS-clean resume.

FIELD TYPE: {field}
USER DRAFT / NOTES: {raw or '(empty — generate from instruction + context)'}
USER INSTRUCTION: {instruction or '(none — just polish the draft)'}

STYLE RULES FOR THIS FIELD:
{style}

CONTEXT (other CV data — reference for tone consistency, do not duplicate):
{json.dumps({k: profile.get(k) for k in ('personal', 'skills') if k in profile}, indent=2)[:1500]}

CONSTRAINTS:
- Output ONLY the polished CV text. No preamble, no markdown headers, no quotes around the result.
- Same language as the user instruction or draft.
- Never invent specific numbers, employers, or dates the user did not mention.
- Be human, not robotic. Vary sentence rhythm.
"""

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 500,
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as c:
            r = c.post(ENDPOINT, params={"key": key}, json=payload)
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPStatusError as e:
        return {"error": f"Gemini API error: {e.response.status_code} — {e.response.text[:300]}"}
    except httpx.HTTPError as e:
        return {"error": f"network error: {e}"}

    text = ""
    candidates = data.get("candidates") or []
    if candidates:
        parts = (candidates[0].get("content") or {}).get("parts") or []
        for p in parts:
            if "text" in p:
                text += p["text"]

    return {"text": text.strip(), "model": MODEL}
