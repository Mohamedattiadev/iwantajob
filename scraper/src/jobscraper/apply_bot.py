"""Telegram-driven apply flow.

For an intern post: user clicks Apply in UI → backend POST /api/applications/telegram-apply
→ this module sends a brief + Confirm/Cancel buttons to the "applying" topic.
On Confirm callback, records Application, posts result to "submit" topic with
apply link + (if extractable) draft mailto. No web automation in this phase.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select

from . import llm
from .db import Application, Job, session_scope
from .profile import load as load_profile
from .telegram import Telegram, TelegramError, have_config, inline_keyboard, topic_id, url_keyboard

log = logging.getLogger("apply_bot")

# Tuning knobs (read from env at runtime so user can override without code edit)
AUTO_SCAN_INTERVAL_SEC = int(os.environ.get("APPLY_AUTOSCAN_SEC", "600"))   # 10 min default
AUTO_BRIEF_MAX_PER_RUN = int(os.environ.get("APPLY_AUTOBRIEF_MAX", "3"))     # 3 briefs per scan
WEEKLY_DIGEST_DAYS = int(os.environ.get("APPLY_DIGEST_DAYS", "7"))
DIGEST_STATE = Path(os.environ.get("APPLY_DIGEST_STATE", "/tmp/iwantajob-digest.ts"))
ENABLE_AUTO_BRIEF = os.environ.get("APPLY_AUTO_BRIEF", "1") not in ("0", "false", "no")
ENABLE_DIGEST = os.environ.get("APPLY_DIGEST", "1") not in ("0", "false", "no")

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


# ── Long-polling background loop ───────────────────────────────────────────

_poll_thread: threading.Thread | None = None
_poll_stop = threading.Event()


def _poll_loop() -> None:
    offset: int | None = None
    log.info("telegram poll loop started")
    while not _poll_stop.is_set():
        try:
            tg = Telegram()
            updates = tg.get_updates(offset=offset, timeout=20)
        except TelegramError as e:
            log.warning("getUpdates: %s — sleep 5s", e)
            time.sleep(5)
            continue
        except Exception as e:  # network blips etc.
            log.warning("poll error: %s — sleep 5s", e)
            time.sleep(5)
            continue
        for u in updates:
            offset = max(offset or 0, u["update_id"] + 1)
            cb = u.get("callback_query")
            if cb:
                try:
                    handle_callback(cb)
                except Exception as e:
                    log.exception("handle_callback failed: %s", e)
    log.info("telegram poll loop stopped")


def start_polling() -> None:
    """Spawn background poll thread if telegram is configured. Idempotent."""
    global _poll_thread
    if not have_config():
        log.info("telegram not configured; skipping poll loop")
        return
    if _poll_thread and _poll_thread.is_alive():
        return
    _poll_stop.clear()
    _poll_thread = threading.Thread(target=_poll_loop, name="tg-poll", daemon=True)
    _poll_thread.start()
    # Start auto-scan + digest threads alongside.
    start_auto_scan()
    start_digest()


def stop_polling() -> None:
    _poll_stop.set()


# ── Autonomous intern brief scan ───────────────────────────────────────────
#
# Every AUTO_SCAN_INTERVAL_SEC, find intern jobs that have NOT been briefed
# (auto_briefed_at IS NULL) and have NO existing Application, then send up to
# AUTO_BRIEF_MAX_PER_RUN briefs to Telegram. User confirms in TG to record/apply.

_scan_thread: threading.Thread | None = None


def _autoscan_once() -> int:
    if not have_config():
        return 0
    sent = 0
    with session_scope() as s:
        applied_ids = {a.job_id for a in s.scalars(select(Application))}
        candidates: list[int] = []
        for j in s.scalars(select(Job).where(Job.auto_briefed_at.is_(None))):
            if j.id in applied_ids:
                continue
            if not is_intern(j):
                continue
            # Skip very old jobs.
            if j.posted_at and (datetime.utcnow() - j.posted_at.replace(tzinfo=None) > timedelta(days=45)):
                continue
            candidates.append(j.id)
            if len(candidates) >= AUTO_BRIEF_MAX_PER_RUN:
                break
    for job_id in candidates:
        try:
            res = send_apply_request(job_id)
            with session_scope() as s:
                j = s.get(Job, job_id)
                if j:
                    j.auto_briefed_at = datetime.utcnow()
            if res.get("ok"):
                sent += 1
                log.info("auto-briefed job %d", job_id)
            else:
                log.warning("auto-brief job %d failed: %s", job_id, res.get("error"))
        except Exception as e:
            log.exception("auto-brief job %d crashed: %s", job_id, e)
    return sent


def _autoscan_loop() -> None:
    log.info("auto-scan loop started (interval=%ds, max=%d/run)", AUTO_SCAN_INTERVAL_SEC, AUTO_BRIEF_MAX_PER_RUN)
    while not _poll_stop.is_set():
        try:
            _autoscan_once()
        except Exception as e:
            log.exception("autoscan crash: %s", e)
        if _poll_stop.wait(AUTO_SCAN_INTERVAL_SEC):
            break
    log.info("auto-scan loop stopped")


def start_auto_scan() -> None:
    global _scan_thread
    if not ENABLE_AUTO_BRIEF or not have_config():
        return
    if _scan_thread and _scan_thread.is_alive():
        return
    _scan_thread = threading.Thread(target=_autoscan_loop, name="tg-autoscan", daemon=True)
    _scan_thread.start()


# ── Weekly digest ──────────────────────────────────────────────────────────
#
# Every WEEKLY_DIGEST_DAYS, generate a Gemini-summarised report (progress on
# applications, top skill gaps, suggested actions) and send to the "skills"
# topic. Persists last-sent timestamp to DIGEST_STATE so a server restart
# doesn't trigger duplicates.

_digest_thread: threading.Thread | None = None


def _read_last_digest_ts() -> float:
    try:
        return float(DIGEST_STATE.read_text().strip())
    except (OSError, ValueError):
        return 0.0


def _write_last_digest_ts(ts: float) -> None:
    try:
        DIGEST_STATE.write_text(str(ts))
    except OSError as e:
        log.warning("cannot write digest state: %s", e)


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


def _digest_once() -> bool:
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


def _digest_loop() -> None:
    log.info("digest loop started (every %d days)", WEEKLY_DIGEST_DAYS)
    interval = WEEKLY_DIGEST_DAYS * 86400
    while not _poll_stop.is_set():
        last = _read_last_digest_ts()
        now = time.time()
        if now - last >= interval:
            if _digest_once():
                _write_last_digest_ts(now)
                log.info("digest sent")
        # Sleep 1 hour then check again — cheap.
        if _poll_stop.wait(3600):
            break
    log.info("digest loop stopped")


def start_digest() -> None:
    global _digest_thread
    if not ENABLE_DIGEST or not have_config():
        return
    if _digest_thread and _digest_thread.is_alive():
        return
    _digest_thread = threading.Thread(target=_digest_loop, name="tg-digest", daemon=True)
    _digest_thread.start()


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
