"""CV ingestion + generation."""
from __future__ import annotations

import io
import re
from datetime import datetime, timezone
from typing import Any

from pypdf import PdfReader

from .extractor import extract_skills
from .profile import load, save


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(\+?\d[\d\s\-().]{7,}\d)")
LINK_RE = re.compile(r"https?://[^\s)]+")
GITHUB_RE = re.compile(r"github\.com/([A-Za-z0-9_-]+)", re.IGNORECASE)
LINKEDIN_RE = re.compile(r"linkedin\.com/in/([A-Za-z0-9_-]+)", re.IGNORECASE)


def parse_pdf_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            continue
    return "\n".join(parts)


def parse_pdf(data: bytes) -> dict[str, Any]:
    """Parse uploaded CV PDF. Returns a dict mergeable into profile JSON.

    Heuristic; not exhaustive. Pulls obvious facts; rest stays for user edit.
    """
    text = parse_pdf_text(data)
    return parse_text(text)


def parse_text(text: str) -> dict[str, Any]:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    blob = "\n".join(lines)

    # Personal
    email = EMAIL_RE.search(blob)
    phone = PHONE_RE.search(blob)
    gh = GITHUB_RE.search(blob)
    li = LINKEDIN_RE.search(blob)

    # Best-guess name = first non-empty line that looks like a person's name
    name = ""
    for l in lines[:5]:
        if EMAIL_RE.search(l) or PHONE_RE.search(l):
            continue
        # Mostly letters and spaces, 2+ tokens
        if 2 <= len(l.split()) <= 6 and re.match(r"^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$", l):
            name = l
            break

    # Skills via the same extractor used for jobs
    found = extract_skills(blob)
    skills_map: dict[str, int] = {}
    for canonical, _cat in found:
        # Default to 3 (Comfortable) — user will adjust on /learn. Better than auto-5.
        skills_map[canonical] = 3

    # Sections (very rough — headings followed by lines)
    sections = _section_blocks(lines)

    education: list[dict[str, Any]] = []
    for line in sections.get("education", []):
        education.append({"raw": line})

    experience: list[dict[str, Any]] = []
    for line in sections.get("experience", []):
        experience.append({"raw": line})

    projects: list[dict[str, Any]] = []
    for line in sections.get("projects", []) or sections.get("academic projects", []):
        projects.append({"raw": line})

    languages: list[dict[str, Any]] = []
    for line in sections.get("languages", []):
        # parse "Arabic: Native" style
        m = re.match(r"^[•\-\*]?\s*([A-Za-z]+)\s*[:\-]\s*(.+)$", line)
        if m:
            languages.append({"name": m.group(1).strip(), "level": m.group(2).strip()})
        else:
            languages.append({"name": line, "level": ""})

    return {
        "personal": {
            "name": name,
            "email": email.group(0) if email else "",
            "phone": phone.group(0) if phone else "",
            "location": "",
            "links": {
                "github": f"https://github.com/{gh.group(1)}" if gh else "",
                "linkedin": f"https://linkedin.com/in/{li.group(1)}" if li else "",
                "portfolio": "",
            },
            "summary": "",
        },
        "education": education,
        "experience": experience,
        "projects": projects,
        "skills": skills_map,
        "languages": languages,
        "certifications": [],
        "_meta": {
            "parsed_at": datetime.now(timezone.utc).isoformat(),
            "raw_text_chars": len(blob),
            "skills_detected": len(skills_map),
        },
    }


# Common CV section headings (lower case)
_SECTION_KEYS = [
    "education",
    "experience",
    "academic projects",
    "projects",
    "technical skills",
    "skills",
    "certifications",
    "certifications & additional work",
    "languages",
    "hobbies",
    "personal information",
]


def _section_blocks(lines: list[str]) -> dict[str, list[str]]:
    """Split text into rough sections by heading."""
    out: dict[str, list[str]] = {}
    current: str | None = None
    for l in lines:
        low = l.strip().lower().rstrip(":")
        if low in _SECTION_KEYS:
            current = low
            out.setdefault(current, [])
            continue
        if current:
            out[current].append(l)
    return out


# ---------- CV generation ----------

LEVEL_LABEL = {
    0: "",
    1: "Familiar",
    2: "Basic",
    3: "Working",
    4: "Strong",
    5: "Expert",
}


# ---------- Entry normalization (handles "raw" CV blobs with ● / • bullets) ----------

_BULLET_RE = re.compile(r"\s*[●•▪◆■]\s*")

def _split_bullets(raw: str) -> tuple[str, list[str]]:
    """Split a free-form CV entry into (header_line, bullets).

    Many imported entries look like:
        "Full-Stack Dev (X) - 5mo 2024 ● did this ● did that ● fixed bug"
    We want one header + a real bulleted list — that's what makes templates
    render cleanly instead of one squashed paragraph.
    """
    if not raw:
        return "", []
    s = raw.strip()
    # Split on bullet glyphs.
    parts = _BULLET_RE.split(s)
    parts = [p.strip(" \n\t-:") for p in parts if p and p.strip()]
    if not parts:
        return s, []
    if len(parts) == 1:
        # No glyph bullets — try splitting long sentences on '. ' fallback off.
        return parts[0], []
    return parts[0], parts[1:]


TEMPLATES = ("classic", "compact", "modern", "elegant", "sidebar", "minimal", "executive", "tech", "academic")
DEFAULT_TEMPLATE = "classic"


def _validate_template(name: str | None) -> str:
    return name if name in TEMPLATES else DEFAULT_TEMPLATE


def render_markdown(profile: dict[str, Any] | None = None, min_level: int = 3) -> str:
    p = profile or load()
    pers = p.get("personal", {})
    lines: list[str] = []

    name = pers.get("name") or "Your Name"
    lines.append(f"# {name}")
    contact = []
    if pers.get("email"):
        contact.append(pers["email"])
    if pers.get("phone"):
        contact.append(pers["phone"])
    if pers.get("location"):
        contact.append(pers["location"])
    links = pers.get("links") or {}
    if links.get("github"):
        contact.append(f"[GitHub]({links['github']})")
    if links.get("linkedin"):
        contact.append(f"[LinkedIn]({links['linkedin']})")
    if links.get("portfolio"):
        contact.append(f"[Portfolio]({links['portfolio']})")
    if contact:
        lines.append(" · ".join(contact))
    lines.append("")

    # Summary intentionally omitted — saves vertical space, helps fit one page.
    # Recruiters skim skills+experience; summary rarely earns its real estate.

    # Skills (ATS friendly: comma-separated, grouped)
    skills_map: dict[str, int] = p.get("skills") or {}
    relevant = sorted(
        ((s, lvl) for s, lvl in skills_map.items() if lvl >= min_level),
        key=lambda x: (-x[1], x[0]),
    )
    if relevant:
        lines.append("## Skills")
        # Group by tier
        tiers: dict[int, list[str]] = {}
        for s, lvl in relevant:
            tiers.setdefault(lvl, []).append(s)
        for lvl in sorted(tiers.keys(), reverse=True):
            label = LEVEL_LABEL.get(lvl, "")
            joined = ", ".join(tiers[lvl])
            lines.append(f"- **{label}**: {joined}" if label else f"- {joined}")
        lines.append("")

    # Experience
    exp = p.get("experience") or []
    if exp:
        lines.append("## Experience")
        for e in exp:
            if "raw" in e:
                header, bullets = _split_bullets(e.get("raw") or "")
                if header:
                    lines.append(f"**{header}**")
                for b in bullets:
                    lines.append(f"- {b}")
                if not header and not bullets:
                    lines.append(f"- {e.get('raw','')}")
            else:
                title = " — ".join(filter(None, [e.get("role"), e.get("company")]))
                period = " ".join(filter(None, [e.get("start"), e.get("end")])).strip()
                if title or period:
                    lines.append(f"**{title}** _{period}_")
                if e.get("location"):
                    lines.append(f"_{e['location']}_")
                for b in e.get("bullets") or []:
                    lines.append(f"- {b}")
            lines.append("")

    # Projects
    proj = p.get("projects") or []
    if proj:
        lines.append("## Projects")
        for pr in proj:
            if "raw" in pr:
                header, bullets = _split_bullets(pr.get("raw") or "")
                if header:
                    lines.append(f"**{header}**")
                for b in bullets:
                    lines.append(f"- {b}")
                if not header and not bullets:
                    lines.append(f"- {pr.get('raw','')}")
            else:
                head = pr.get("name", "")
                link = pr.get("link")
                if link:
                    head = f"[{head}]({link})"
                lines.append(f"**{head}**")
                if pr.get("summary"):
                    lines.append(pr["summary"])
                for b in pr.get("bullets") or []:
                    lines.append(f"- {b}")
                if pr.get("skills"):
                    lines.append(f"_Tech: {', '.join(pr['skills'])}_")
            lines.append("")

    # Education
    edu = p.get("education") or []
    if edu:
        lines.append("## Education")
        for ed in edu:
            if "raw" in ed:
                header, bullets = _split_bullets(ed.get("raw") or "")
                if header:
                    lines.append(f"**{header}**")
                for b in bullets:
                    lines.append(f"- {b}")
                if not header and not bullets:
                    lines.append(f"- {ed.get('raw','')}")
            else:
                title = " — ".join(filter(None, [ed.get("degree"), ed.get("school")]))
                period = " ".join(filter(None, [ed.get("start"), ed.get("end")])).strip()
                if title or period:
                    lines.append(f"**{title}** _{period}_")
                if ed.get("gpa"):
                    lines.append(f"GPA: {ed['gpa']}")
            lines.append("")

    # Languages
    langs = p.get("languages") or []
    if langs:
        lines.append("## Languages")
        for lng in langs:
            if isinstance(lng, dict):
                lines.append(f"- {lng.get('name', '')}: {lng.get('level', '')}".rstrip(": "))
            else:
                lines.append(f"- {lng}")
        lines.append("")

    # Certifications
    certs = p.get("certifications") or []
    if certs:
        lines.append("## Certifications")
        for c in certs:
            if isinstance(c, dict):
                line = c.get("name", "")
                if c.get("issuer"):
                    line += f" — {c['issuer']}"
                if c.get("year"):
                    line += f" ({c['year']})"
                lines.append(f"- {line}")
            else:
                lines.append(f"- {c}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def render_html(profile: dict[str, Any] | None = None, min_level: int = 3, template: str | None = None) -> str:
    tpl = _validate_template(template)
    md = render_markdown(profile, min_level)
    # Minimal markdown → HTML (headings, bold, italic, links, bullets). Keep deps light.
    html = _md_to_html(md)
    name = (profile or load()).get("personal", {}).get("name") or "CV"
    return _html_doc(html, name=name, template=tpl)


def _md_to_html(md: str) -> str:
    import html as _html

    def link_repl(m: re.Match) -> str:
        return f'<a href="{_html.escape(m.group(2))}">{_html.escape(m.group(1))}</a>'

    out: list[str] = []
    in_list = False
    for line in md.splitlines():
        if line.startswith("# "):
            out.append(f"<h1>{_html.escape(line[2:])}</h1>")
            continue
        if line.startswith("## "):
            if in_list:
                out.append("</ul>"); in_list = False
            out.append(f"<h2>{_html.escape(line[3:])}</h2>")
            continue
        if line.startswith("- "):
            if not in_list:
                out.append("<ul>"); in_list = True
            content = _html.escape(line[2:])
            content = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", content)
            content = re.sub(r"_([^_]+)_", r"<em>\1</em>", content)
            content = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link_repl, content)
            out.append(f"<li>{content}</li>")
            continue
        if in_list:
            out.append("</ul>"); in_list = False
        if not line.strip():
            out.append("")
            continue
        content = _html.escape(line)
        content = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", content)
        content = re.sub(r"_([^_]+)_", r"<em>\1</em>", content)
        content = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link_repl, content)
        out.append(f"<p>{content}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


_TEMPLATE_CSS: dict[str, str] = {
    "classic": """
        body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
               max-width: 760px; margin: 40px auto; padding: 0 24px;
               color: #111; line-height: 1.55; font-size: 14px; }
        h1   { font-size: 30px; margin: 0 0 6px; letter-spacing: -0.015em; font-weight: 700; }
        h1 + p { color: #555; font-size: 13px; margin: 0 0 18px; }
        h2   { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em;
               color: #555; margin: 26px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        p    { margin: 6px 0; }
        ul   { margin: 6px 0 14px 20px; padding: 0; }
        li   { margin: 3px 0; }
        a    { color: #1a4dad; text-decoration: none; }
        strong { color: #000; }
        em   { color: #555; font-style: normal; }
    """,
    "compact": """
        body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
               max-width: 740px; margin: 28px auto; padding: 0 22px;
               color: #111; line-height: 1.38; font-size: 12.5px; }
        h1   { font-size: 22px; margin: 0 0 2px; letter-spacing: -0.01em; font-weight: 700; }
        h1 + p { color: #555; font-size: 11.5px; margin: 0 0 12px; }
        h2   { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.15em;
               color: #333; margin: 14px 0 4px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
        p    { margin: 3px 0; }
        ul   { margin: 3px 0 8px 18px; padding: 0; }
        li   { margin: 1.5px 0; }
        a    { color: #1a4dad; text-decoration: none; }
        strong { color: #000; }
        em   { color: #555; font-style: normal; }
    """,
    "modern": """
        body { font-family: "Inter", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
               max-width: 780px; margin: 36px auto; padding: 0 28px;
               color: #1a1d24; line-height: 1.55; font-size: 13.5px; }
        h1   { font-size: 32px; margin: 0 0 4px; letter-spacing: -0.02em; font-weight: 800;
               background: linear-gradient(90deg, #6d28d9 0%, #db2777 100%);
               -webkit-background-clip: text; background-clip: text; color: transparent; }
        h1 + p { color: #525866; font-size: 12.5px; margin: 0 0 22px; padding-bottom: 14px;
                 border-bottom: 2px solid #6d28d9; }
        h2   { font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em;
               color: #6d28d9; margin: 22px 0 6px; font-weight: 700; }
        h2::before { content: ""; display: inline-block; width: 18px; height: 2px;
                     background: #6d28d9; vertical-align: middle; margin-right: 10px; }
        p    { margin: 5px 0; }
        ul   { margin: 5px 0 12px 18px; padding: 0; list-style: none; }
        li   { margin: 3px 0; position: relative; padding-left: 14px; }
        li::before { content: "▸"; color: #6d28d9; position: absolute; left: 0; font-weight: 700; }
        a    { color: #6d28d9; text-decoration: none; border-bottom: 1px dotted #6d28d9; }
        strong { color: #1a1d24; }
        em   { color: #525866; font-style: normal; font-weight: 500; }
    """,
    "elegant": """
        body { font-family: "Georgia", "Times New Roman", serif;
               max-width: 720px; margin: 50px auto; padding: 0 28px;
               color: #1a1a1a; line-height: 1.62; font-size: 13.5px; }
        h1   { font-size: 34px; margin: 0 0 4px; letter-spacing: 0.01em; font-weight: 400;
               text-align: center; font-variant: small-caps; }
        h1 + p { color: #444; font-size: 12.5px; margin: 0 0 26px; text-align: center;
                 font-style: italic; padding-bottom: 18px;
                 border-bottom: 1px solid #aaa; }
        h2   { font-size: 13px; text-transform: uppercase; letter-spacing: 0.22em;
               color: #1a1a1a; margin: 22px 0 8px; text-align: center; font-weight: 400;
               border: none; }
        h2::after { content: ""; display: block; width: 40px; height: 1px;
                    background: #1a1a1a; margin: 6px auto 0; }
        p    { margin: 6px 0; }
        ul   { margin: 6px 0 14px 22px; padding: 0; }
        li   { margin: 4px 0; }
        a    { color: #5a3a8c; text-decoration: none; }
        strong { color: #1a1a1a; font-weight: 700; }
        em   { color: #555; font-style: italic; }
    """,
    "sidebar": """
        body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
               max-width: 800px; margin: 36px auto; padding: 0 28px;
               color: #0f172a; line-height: 1.55; font-size: 13.5px; }
        h1   { font-size: 30px; margin: 0 0 4px; letter-spacing: -0.015em; font-weight: 800; color: #0ea5e9; }
        h1 + p { color: #475569; font-size: 13px; margin: 0 0 22px; padding-bottom: 12px;
                 border-bottom: 1px solid #e2e8f0; }
        h2   { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.16em;
               color: #0ea5e9; margin: 22px 0 8px; font-weight: 700;
               border-left: 3px solid #0ea5e9; padding-left: 10px; }
        p    { margin: 5px 0; }
        ul   { margin: 5px 0 12px 18px; padding: 0; list-style: none; }
        li   { margin: 3px 0; position: relative; padding-left: 14px; }
        li::before { content: "›"; color: #0ea5e9; position: absolute; left: 0; font-weight: 700; }
        a    { color: #0284c7; text-decoration: none; }
        strong { color: #0f172a; }
        em   { color: #475569; font-style: normal; }
    """,
    "minimal": """
        body { font-family: "Times New Roman", Times, serif;
               max-width: 720px; margin: 40px auto; padding: 0 28px;
               color: #000; line-height: 1.5; font-size: 14px; }
        h1   { font-size: 26px; margin: 0 0 2px; font-weight: 700; }
        h1 + p { color: #333; font-size: 12.5px; margin: 0 0 18px; }
        h2   { font-size: 13px; text-transform: uppercase; letter-spacing: 0.10em;
               color: #000; margin: 18px 0 6px; border-bottom: 1px solid #000; padding-bottom: 2px; }
        p    { margin: 4px 0; }
        ul   { margin: 4px 0 10px 20px; padding: 0; }
        li   { margin: 2px 0; }
        a    { color: #000; text-decoration: underline; }
        strong { color: #000; }
        em   { color: #333; font-style: italic; }
    """,
}


def _html_doc(body: str, name: str, template: str = "classic") -> str:
    css = _TEMPLATE_CSS.get(template, _TEMPLATE_CSS["classic"])
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{name} — CV</title>
<style>
{css}
  @media print {{ body {{ margin: 0; padding: 20px; max-width: none; }} }}
</style>
</head>
<body>
{body}
</body>
</html>
"""


# ---------- Sync skills with proficiency map ----------

def update_skill(skill: str, level: int) -> dict[str, Any]:
    """Called when user rates a skill in /learn → also store in profile."""
    p = load()
    skills = p.get("skills") or {}
    if level <= 0:
        skills.pop(skill, None)
    else:
        skills[skill] = max(0, min(5, level))
    p["skills"] = skills
    save(p)
    return p
