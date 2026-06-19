"""Telegram-driven apply flow.

For an intern post: user clicks Apply in UI → backend POST /api/applications/telegram-apply
→ this module sends a brief + Confirm/Cancel buttons to the "applying" topic.
On Confirm callback, records Application, posts result to "submit" topic with
apply link + (if extractable) draft mailto. No web automation in this phase.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any

from sqlalchemy import select

from . import llm
from .db import Application, Job, session_scope
from .profile import load as load_profile
from .telegram import Telegram, TelegramError, have_config, inline_keyboard, topic_id, url_keyboard

log = logging.getLogger("apply_bot")


INTERN_RE = re.compile(r"\b(intern|internship|stajyer|staj|stagiaire|practicante)\b", re.IGNORECASE)
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")


def is_intern(job: Job | dict) -> bool:
    title = (job.title if isinstance(job, Job) else job.get("title")) or ""
    desc = (job.description if isinstance(job, Job) else job.get("description")) or ""
    return bool(INTERN_RE.search(title) or INTERN_RE.search(desc[:1500]))


def _topic(kind: str) -> int | None:
    return topic_id({
        "applying": "TELEGRAM_TOPIC_APPLYING",
        "applied":  "TELEGRAM_TOPIC_APPLIED",
        "submit":   "TELEGRAM_TOPIC_SUBMIT",
        "skills":   "TELEGRAM_TOPIC_SKILLS",
    }[kind])


def _build_brief(job: Job, profile: dict) -> str:
    """Use Gemini to produce a tight 4-line brief + match notes. Fallback to template."""
    skills = ", ".join(s.skill for s in job.skills[:12]) or "n/a"
    pers = profile.get("personal", {})
    user_skills = profile.get("skills") or {}
    user_have = ", ".join(sk for sk, lvl in user_skills.items() if lvl >= 3)[:400] or "n/a"
    prompt = f"""Write a 4-line apply brief for this internship.

JOB
- Title: {job.title}
- Company: {job.company or 'unknown'}
- Location: {job.location or 'unknown'} (remote={bool(job.remote)})
- Source: {job.source}
- Skills wanted: {skills}
- Description (truncated): {(job.description or '')[:1200]}

APPLICANT
- Name: {pers.get('name', '')}
- Summary: {pers.get('summary', '')[:300]}
- Skills (>=working): {user_have}

OUTPUT FORMAT (exactly 4 short lines, plain text, no markdown):
1. One-sentence what the role is.
2. Top 2 reasons you fit (from applicant skills/projects).
3. One gap to flag (skill you lack but they want).
4. Recommendation: APPLY or SKIP and why in <12 words.
"""
    try:
        text = llm.generate(prompt, max_tokens=350, temperature=0.3, tier="cheap")
        if text:
            return text
    except llm.LLMError as e:
        log.warning("llm brief failed: %s", e)
    # Fallback template
    return (f"Role: {job.title} at {job.company}.\n"
            f"Skills wanted: {skills}.\n"
            f"Your matching skills: {user_have}.\n"
            f"Recommendation: review and decide.")


def _escape_html(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _format_brief_message(job: Job, brief: str) -> str:
    title = _escape_html(job.title)
    company = _escape_html(job.company or "Unknown")
    loc = _escape_html(job.location or "—")
    url = _escape_html(job.source_url)
    return (
        f"<b>🎯 Apply request</b>\n"
        f"<b>{title}</b>\n"
        f"{company} · {loc} · <i>{job.source}</i>\n\n"
        f"<pre>{_escape_html(brief)}</pre>\n"
        f'<a href="{url}">Open posting</a>'
    )


def send_apply_request(job_id: int) -> dict[str, Any]:
    """Build brief + post to 'applying' topic with Confirm/Cancel buttons."""
    if not have_config():
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set"}
    with session_scope() as s:
        job = s.get(Job, job_id)
        if not job:
            return {"ok": False, "error": "job not found"}
        existing = s.scalar(select(Application).where(Application.job_id == job_id))
        if existing:
            return {"ok": False, "error": "already applied"}
        profile = load_profile()
        brief = _build_brief(job, profile)
        text = _format_brief_message(job, brief)
        kb = inline_keyboard([[
            ("✅ Confirm apply", f"apply:confirm:{job.id}"),
            ("✖ Skip", f"apply:cancel:{job.id}"),
        ]])
    try:
        tg = Telegram()
        msg = tg.send_message(text, topic_id=_topic("applying"), reply_markup=kb)
    except TelegramError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "message_id": msg.get("message_id"), "brief": brief}


def _record_application(job_id: int, note: str) -> Application | None:
    with session_scope() as s:
        if s.scalar(select(Application).where(Application.job_id == job_id)):
            return None
        app = Application(job_id=job_id, status="applied", notes=note, applied_at=datetime.utcnow())
        s.add(app)
        s.flush()
        return app


def _post_submit(job: Job, applied_at: datetime, auto_res: dict | None = None) -> None:
    """Post a 'submitted' message to the submit topic with apply link + mailto draft."""
    tg = Telegram()
    title = _escape_html(job.title)
    emails = EMAIL_RE.findall(job.description or "")
    rows: list[list[tuple[str, str]]] = [[("Open posting", job.source_url)]]
    if emails:
        subj = f"Application: {job.title} — {load_profile().get('personal', {}).get('name', '')}"
        body = (f"Hi,\n\nI'd like to apply for the {job.title} internship. "
                f"My CV is attached / available on request.\n\nBest,\n"
                f"{load_profile().get('personal', {}).get('name', '')}")
        from urllib.parse import quote
        mailto = f"mailto:{emails[0]}?subject={quote(subj)}&body={quote(body)}"
        rows.append([("Draft email", mailto)])
    kb = url_keyboard(rows)
    auto_line = ""
    if auto_res:
        if auto_res.get("ok"):
            auto_line = f"\n🤖 Auto-applied via <i>{_escape_html(auto_res.get('method', ''))}</i>"
        else:
            auto_line = f"\n⚠ <i>{_escape_html(auto_res.get('message', 'Manual apply needed'))}</i>"
    text = (
        f"<b>✉️ Submitted</b>\n"
        f"<b>{title}</b>\n"
        f"{_escape_html(job.company or 'Unknown')} · <i>{job.source}</i>\n"
        f"Logged {applied_at.strftime('%Y-%m-%d %H:%M')} UTC.{auto_line}"
    )
    tg.send_message(text, topic_id=_topic("submit"), reply_markup=kb)


def handle_callback(callback: dict) -> None:
    """Process a Telegram callback_query payload."""
    data = callback.get("data") or ""
    cb_id = callback.get("id")
    msg = callback.get("message") or {}
    chat = (msg.get("chat") or {}).get("id")
    mid = msg.get("message_id")
    tg = Telegram()

    parts = data.split(":")
    if len(parts) != 3 or parts[0] != "apply":
        tg.answer_callback_query(cb_id, text="unknown action")
        return
    action, job_id_s = parts[1], parts[2]
    try:
        job_id = int(job_id_s)
    except ValueError:
        tg.answer_callback_query(cb_id, text="bad job id")
        return

    if action == "cancel":
        tg.answer_callback_query(cb_id, text="Skipped.")
        try:
            tg.edit_message_text(chat_id=chat, message_id=mid,
                                 text=(msg.get("text") or "") + "\n\n— ✖ Skipped.")
        except TelegramError:
            pass
        return

    if action == "confirm":
        app = _record_application(job_id, note="via telegram")
        if not app:
            tg.answer_callback_query(cb_id, text="Already applied.")
            return
        with session_scope() as s:
            job = s.get(Job, job_id)
            applied_at = app.applied_at
            # Attempt automated apply (no-op until playwright adapters exist).
            try:
                auto_res = try_auto_apply(job, load_profile())
            except Exception as e:
                log.exception("auto_apply crash: %s", e)
                auto_res = {"ok": False, "method": "error", "message": str(e)}
            try:
                _post_submit(job, applied_at, auto_res)
            except TelegramError as e:
                log.warning("submit post failed: %s", e)
        tg.answer_callback_query(cb_id, text="Recorded ✓")
        try:
            suffix = "\n\n— ✅ Confirmed."
            if auto_res.get("ok"):
                suffix += f"\n🤖 Auto-applied via {auto_res.get('method')}."
            else:
                suffix += f"\n🔗 Manual apply needed ({auto_res.get('method', 'manual')})."
            tg.edit_message_text(chat_id=chat, message_id=mid, text=(msg.get("text") or "") + suffix)
        except TelegramError:
            pass


# ── Telegram polling startup hooks ─────────────────────────────────────────
#
# Background polling threads were removed to cut idle cost. The web app still
# calls start_polling()/stop_polling() at startup/shutdown — these are now
# no-ops. Apply callbacks can be wired via Telegram webhook if/when needed.


def start_polling() -> None:
    log.info("apply_bot: background polling disabled (no-op)")


def stop_polling() -> None:
    return


# ── Weekly digest (manual) ─────────────────────────────────────────────────
#
# Builds + sends a digest to the "skills" topic when send_digest() is called
# explicitly. No timer loop — invoke from a cron / CLI / endpoint when wanted.


def _build_digest() -> str:
    """Compose a markdown digest. Falls back gracefully if LLM unavailable."""
    from collections import Counter
    profile = load_profile()
    with session_scope() as s:
        apps = list(s.scalars(select(Application)))
        jobs = list(s.scalars(select(Job)))
    app_counts = Counter(a.status for a in apps)
    market: Counter = Counter()
    for j in jobs:
        for sk in j.skills:
            market[sk.skill] += 1
    user_skills = profile.get("skills") or {}
    user_strong = sorted([k for k, v in user_skills.items() if v >= 3])[:15]
    gaps = [(s, c) for s, c in market.most_common(40) if user_skills.get(s, 0) < 3][:8]

    prompt = f"""Write a weekly progress digest for the user as Telegram-friendly HTML
(use <b>…</b>, <i>…</i>, simple bullets with •). Keep it under 1500 chars.

CONTEXT
- Total scraped jobs: {len(jobs)}
- Applications: {sum(app_counts.values())} total → {dict(app_counts)}
- User's strong skills (>=working): {', '.join(user_strong) or '(none rated yet)'}
- Top skill GAPS (market wants, user weak): {', '.join(f"{s}({c})" for s, c in gaps) or '(none)'}

OUTPUT SECTIONS (in this order, each 1-3 lines):
1. <b>📊 Last week</b> — applications activity summary
2. <b>🎯 Next priorities</b> — 2-3 skills to push hard this week (from gaps)
3. <b>💡 Quick wins</b> — 1-2 specific actions (e.g. "build a small FastAPI project", "rate {{skill}} on Learn page")
4. <b>🔥 Motivation</b> — one-line encouragement.
No markdown. Plain Telegram HTML only.
"""
    try:
        text = llm.generate(prompt, max_tokens=700, temperature=0.5, tier="cheap")
        if text:
            return text
    except llm.LLMError as e:
        log.warning("digest llm failed: %s", e)
    # Fallback minimal text
    return (f"<b>📊 Weekly digest</b>\n"
            f"Apps: {sum(app_counts.values())}. Jobs in DB: {len(jobs)}.\n"
            f"Top gaps: {', '.join(s for s, _ in gaps[:5]) or 'n/a'}.")


def send_digest() -> bool:
    """Build digest and send to the 'skills' topic. Returns True on success."""
    if not have_config():
        return False
    text = _build_digest()
    try:
        tg = Telegram()
        tg.send_message(text, topic_id=_topic("skills"))
        return True
    except TelegramError as e:
        log.warning("digest send failed: %s", e)
        return False


# ── Apply engine abstraction ──────────────────────────────────────────────
#
# On confirm callback, attempt automated submission via a per-site adapter.
# If no adapter matches OR playwright isn't installed, fall back to the
# current behavior (post link + mailto draft to submit topic).

def try_auto_apply(job: Job, profile: dict) -> dict[str, Any]:
    """Attempt automated apply. Returns {ok, method, message}.

    Engines registered: playwright_linkedin, playwright_wellfound, mailto_fallback.
    None do real form-fill yet — playwright adapters require `pip install playwright`
    + `playwright install chromium`. Currently returns {ok: False} for those so
    the caller falls back to manual link in Telegram.
    """
    url = (job.source_url or "").lower()
    has_pw = _has_playwright()
    if has_pw and "linkedin.com" in url:
        return {"ok": False, "method": "playwright_linkedin", "message": "LinkedIn adapter not yet implemented."}
    if has_pw and ("wellfound.com" in url or "angel.co" in url):
        return {"ok": False, "method": "playwright_wellfound", "message": "Wellfound adapter not yet implemented."}
    return {"ok": False, "method": "manual", "message": "No automated adapter for this site. Open link + apply manually."}


def _has_playwright() -> bool:
    try:
        import importlib
        importlib.import_module("playwright.sync_api")
        return True
    except ImportError:
        return False
