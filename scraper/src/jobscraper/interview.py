"""Real-time interviewer / teach-mode endpoint.

Mode 'interview': AI asks technical questions on a topic, evaluates answers,
follow-up probes.
Mode 'teach': user explains topic, AI plays curious student + gives feedback
on clarity/accuracy.

Multi-lingual (tr/en/ar) via system-prompt instruction; the LLM responds in
the user's language automatically.
"""
from __future__ import annotations

import json
from typing import Any

from . import llm
from .profile import load as load_profile


def _system(topic: str, mode: str, lang: str) -> str:
    profile = load_profile()
    user_level = profile.get("skills", {}).get(topic.lower(), 0)
    if mode == "teach":
        role = (
            "You play a CURIOUS LEARNER. The user is explaining a topic to you to practice "
            "their teaching. Ask clarifying questions, point out where the explanation jumped "
            "ahead, request concrete examples. At natural breakpoints (every 4-5 turns) give "
            "a SHORT feedback block: what was clear, what was vague, one suggestion. "
            "Keep your turns SHORT (1-3 sentences) so the user does most of the talking."
        )
    else:
        role = (
            "You play a TECHNICAL INTERVIEWER for an internship candidate. Ask one focused "
            "question at a time. After each answer: brief 1-line reaction (correct/partial/wrong), "
            "then either a follow-up probe or move to a new sub-topic. Increase difficulty as "
            "answers strengthen. Every 5-6 questions give a SHORT scorecard (strengths, gaps, "
            "what to study). Keep your turns SHORT — interviewers don't lecture."
        )
    lang_hint = {
        "tr": "Reply in Turkish.",
        "ar": "Reply in Arabic.",
        "en": "Reply in English.",
    }.get(lang, "Reply in the user's language.")
    return f"""You are conducting a live VOICE session, so write like SPEECH: short, plain,
no markdown, no bullet points unless absolutely needed. Use natural conversational flow.

ROLE: {role}

TOPIC: {topic or 'general software engineering for juniors'}
USER'S SELF-RATED LEVEL on this topic: {user_level}/5

LANGUAGE: {lang_hint}

USER PROFILE SNAPSHOT (for personalisation, do not recite):
{json.dumps({k: profile.get(k) for k in ('personal', 'skills') if k in profile}, indent=2)[:800]}

RULES:
- THIS IS A LIVE VOICE CALL. Reply in <=2 short sentences (max 25 words). NEVER more.
- Start with ONE sentence greeting + ONE first question (interview) OR "Tell me about {{topic}}" (teach).
- No lists, no markdown, no bullet points.
- If user types "next", move to new question. If "score", give 3-line scorecard.
"""


def run(topic: str, mode: str, lang: str, messages: list[dict[str, str]]) -> dict[str, Any]:
    """messages: [{role: 'user'|'assistant', content: str}, ...] — first call may be empty."""
    if not llm.have_provider():
        return {"error": "GEMINI_API_KEY not set"}
    system = _system(topic, mode, lang)
    if not messages:
        prompt = "Start the session now. One sentence only."
    else:
        # Convert to a single prompt — Gemini chat in llm.generate is single-shot, so
        # we serialize transcript.
        lines = []
        for m in messages:
            who = "USER" if m.get("role") == "user" else "YOU"
            lines.append(f"{who}: {m.get('content', '')}")
        prompt = "Transcript so far:\n" + "\n".join(lines) + "\n\nYour next turn (one short reply only):"
    try:
        # tier="cheap" routes Groq llama-70b first (~700ms TTFT vs Gemini ~1.5s).
        # max_tokens cut for snappier first audio chunk.
        text = llm.generate(prompt, system=system, max_tokens=180, temperature=0.6, tier="cheap")
    except llm.LLMError as e:
        return {"error": str(e)}
    return {"text": text}
