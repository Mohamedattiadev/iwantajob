"""LaTeX CV renderer + optional pdflatex compile."""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .profile import load

LEVEL_LABEL = {
    1: "Familiar",
    2: "Basic",
    3: "Working",
    4: "Strong",
    5: "Expert",
}


def _strip_leading_bullets(s: str) -> str:
    return re.sub(r"^[\s●•◦▪\-\*]+", "", s or "").strip()


def _escape(s: str) -> str:
    if not s:
        return ""
    s = _strip_leading_bullets(s) if any(s.startswith(c) for c in "●•◦▪") else s
    # LaTeX special characters + common unicode that pdflatex chokes on
    repl = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
        # Unicode bullets and dashes — pdflatex with pdftex.def chokes
        "●": r"\textbullet{}",
        "•": r"\textbullet{}",
        "◦": r"\textopenbullet{}",
        "▪": r"\textbullet{}",
        "—": "---",
        "–": "--",
        "“": "``",
        "”": "''",
        "‘": "`",
        "’": "'",
        "→": r"$\rightarrow$",
        "←": r"$\leftarrow$",
        "≥": r"$\geq$",
        "≤": r"$\leq$",
        "✓": r"$\checkmark$",
        "★": r"$\star$",
        "·": r"\textperiodcentered{}",
    }
    out = []
    for ch in s:
        if ch in repl:
            out.append(repl[ch])
        elif ord(ch) > 127 and ord(ch) not in range(0x00C0, 0x024F):
            # Drop other non-ASCII outside common Latin extended ranges
            out.append("?")
        else:
            out.append(ch)
    return "".join(out)


PREAMBLE = r"""\documentclass[10pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{textcomp}
\usepackage[a4paper, margin=0.55in]{geometry}
\usepackage[hidelinks]{hyperref}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}
\usepackage{paracol}
\definecolor{accent}{HTML}{0F2A47}
\definecolor{ruleclr}{HTML}{222222}
\definecolor{muted}{HTML}{555555}
\titleformat{\section}{\large\bfseries\color{accent}}{}{0pt}{\MakeUppercase}[\vspace{-4pt}{\color{ruleclr}\titlerule[0.9pt]}]
\titlespacing*{\section}{0pt}{10pt}{4pt}
\setlist[itemize]{leftmargin=12pt,nosep,topsep=2pt,partopsep=0pt,itemsep=2pt,label=\textbullet}
\pagenumbering{gobble}
\setlength{\parindent}{0pt}
\setlength{\columnsep}{18pt}
\setlength{\columnseprule}{0pt}
\renewcommand{\baselinestretch}{1.10}
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{\textbf{#1}\hfill\textbf{#2}\\\textit{\color{muted}#3}\hfill\textit{\color{muted}#4}\par\vspace{2pt}}
"""


def render_tex(profile: dict[str, Any] | None = None, min_level: int = 3) -> str:
    p = profile or load()
    pers = p.get("personal", {})
    e = _escape

    name = e(pers.get("name") or "Your Name")
    title_line = e(pers.get("headline") or pers.get("title") or "")

    contact_bits: list[str] = []
    if pers.get("email"):
        contact_bits.append(rf"\href{{mailto:{pers['email']}}}{{{e(pers['email'])}}}")
    if pers.get("phone"):
        contact_bits.append(e(pers["phone"]))
    if pers.get("location"):
        contact_bits.append(e(pers["location"]))
    links = pers.get("links") or {}
    if links.get("github"):
        contact_bits.append(rf"\href{{{links['github']}}}{{GitHub}}")
    if links.get("linkedin"):
        contact_bits.append(rf"\href{{{links['linkedin']}}}{{LinkedIn}}")
    if links.get("portfolio"):
        contact_bits.append(rf"\href{{{links['portfolio']}}}{{Portfolio}}")
    contact = r" \ \textbar\ ".join(contact_bits)

    body: list[str] = [PREAMBLE, r"\begin{document}", ""]
    # Header banner — full width
    body.append(r"\begin{center}")
    body.append(rf"{{\Huge\bfseries\color{{accent}} {name}}}\\[3pt]")
    if title_line:
        body.append(rf"{{\large\color{{muted}} {title_line}}}\\[4pt]")
    body.append(rf"\small {contact}")
    body.append(r"\end{center}")
    body.append(r"\vspace{4pt}{\color{ruleclr}\hrule height 1pt}\vspace{6pt}")
    body.append("")

    # Pre-compute section blocks for left/right columns
    def _summary_block() -> list[str]:
        if not pers.get("summary"):
            return []
        return [r"\section*{Summary}", e(pers["summary"]), ""]

    def _entries_block(title: str, items: list) -> list[str]:
        if not items:
            return []
        out = [rf"\section*{{{e(title)}}}"]
        for it in items:
            if isinstance(it, dict) and "raw" in it and not any(
                it.get(k) for k in ("role", "company", "name", "school", "degree", "bullets")
            ):
                out.append(rf"\textbullet\ {e(it['raw'])}\par")
                continue
            if isinstance(it, dict):
                left = it.get("role") or it.get("name") or it.get("degree") or ""
                right = it.get("company") or it.get("school") or ""
                sub_left = it.get("location") or ""
                period = " -- ".join(filter(None, [it.get("start"), it.get("end")])).strip()
                out.append(rf"\entryhead{{{e(left)}}}{{{e(right)}}}{{{e(sub_left)}}}{{{e(period)}}}")
                bullets = it.get("bullets") or []
                if bullets:
                    out.append(r"\begin{itemize}")
                    for b in bullets:
                        out.append(rf"  \item {e(b)}")
                    out.append(r"\end{itemize}")
                out.append(r"\vspace{4pt}")
            else:
                out.append(rf"\textbullet\ {e(str(it))}\par")
        out.append("")
        return out

    def _skills_block() -> list[str]:
        skills_map: dict[str, int] = p.get("skills") or {}
        relevant = sorted(
            ((s, lvl) for s, lvl in skills_map.items() if lvl >= min_level),
            key=lambda x: (-x[1], x[0]),
        )
        if not relevant:
            return []
        out = [r"\section*{Skills}"]
        tiers: dict[int, list[str]] = {}
        for s, lvl in relevant:
            tiers.setdefault(lvl, []).append(s)
        for lvl in sorted(tiers.keys(), reverse=True):
            label = LEVEL_LABEL.get(lvl, "")
            out.append(rf"\textbf{{{e(label)}}}\\")
            out.append(r"\begin{itemize}")
            for s in tiers[lvl]:
                out.append(rf"  \item {e(s)}")
            out.append(r"\end{itemize}")
        out.append("")
        return out

    def _education_block() -> list[str]:
        return _entries_block("Education", p.get("education") or [])

    def _certs_block() -> list[str]:
        certs = p.get("certifications") or []
        if not certs:
            return []
        out = [r"\section*{Certifications}", r"\begin{itemize}"]
        for c in certs:
            if isinstance(c, dict):
                line = c.get("name", "")
                if c.get("issuer"):
                    line += f" — {c['issuer']}"
                if c.get("year"):
                    line += f" ({c['year']})"
                out.append(rf"  \item {e(line)}")
            else:
                out.append(rf"  \item {e(str(c))}")
        out.append(r"\end{itemize}")
        out.append("")
        return out

    def _langs_block() -> list[str]:
        langs = p.get("languages") or []
        if not langs:
            return []
        out = [r"\section*{Languages}", r"\begin{itemize}"]
        for lng in langs:
            if isinstance(lng, dict):
                line = lng.get("name", "")
                if lng.get("level"):
                    line += f" — {lng['level']}"
                out.append(rf"  \item {e(line)}")
            else:
                out.append(rf"  \item {e(str(lng))}")
        out.append(r"\end{itemize}")
        out.append("")
        return out

    # Two-column layout: 65% left (main), 35% right (sidebar)
    body.append(r"\columnratio{0.66}")
    body.append(r"\begin{paracol}{2}")

    # LEFT column: summary, experience, projects
    body.extend(_summary_block())
    body.extend(_entries_block("Work Experience", p.get("experience") or []))
    body.extend(_entries_block("Projects", p.get("projects") or []))

    body.append(r"\switchcolumn")

    # RIGHT column: skills, education, certifications, languages
    body.extend(_skills_block())
    body.extend(_education_block())
    body.extend(_certs_block())
    body.extend(_langs_block())

    body.append(r"\end{paracol}")
    body.append(r"\end{document}")
    return "\n".join(body)


def compile_pdf(tex_source: str) -> bytes | None:
    """Compile .tex → PDF bytes via pdflatex. Returns None if pdflatex missing."""
    if not shutil.which("pdflatex"):
        return None
    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        tex_path = tdp / "cv.tex"
        tex_path.write_text(tex_source, encoding="utf-8")
        for _ in range(2):  # twice for references
            r = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "cv.tex"],
                cwd=tdp,
                capture_output=True,
                timeout=60,
            )
            if r.returncode != 0:
                return None
        pdf = tdp / "cv.pdf"
        if pdf.exists():
            return pdf.read_bytes()
    return None
