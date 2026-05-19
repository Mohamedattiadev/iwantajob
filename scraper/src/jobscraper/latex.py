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


def _escape(s: str) -> str:
    if not s:
        return ""
    # LaTeX special characters
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
    }
    out = []
    for ch in s:
        out.append(repl.get(ch, ch))
    return "".join(out)


PREAMBLE = r"""\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[a4paper, margin=0.7in]{geometry}
\usepackage[hidelinks]{hyperref}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}
\definecolor{accent}{HTML}{1a4dad}
\titleformat{\section}{\large\bfseries\color{black!85}}{}{0pt}{}[\titlerule]
\titlespacing*{\section}{0pt}{12pt}{6pt}
\setlist[itemize]{leftmargin=*,nosep,topsep=2pt,partopsep=0pt,itemsep=2pt}
\pagenumbering{gobble}
\setlength{\parindent}{0pt}
\renewcommand{\baselinestretch}{1.08}
\hypersetup{colorlinks=true,urlcolor=accent}
"""


def render_tex(profile: dict[str, Any] | None = None, min_level: int = 3) -> str:
    p = profile or load()
    pers = p.get("personal", {})
    e = _escape

    name = e(pers.get("name") or "Your Name")
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
    body.append(rf"\begin{{center}}{{\LARGE\bfseries {name}}}\\[4pt]")
    body.append(rf"\small {contact}")
    body.append(r"\end{center}")
    body.append("")

    if pers.get("summary"):
        body.append(r"\section*{Summary}")
        body.append(e(pers["summary"]))
        body.append("")

    # Skills tiered
    skills_map: dict[str, int] = p.get("skills") or {}
    relevant = sorted(
        ((s, lvl) for s, lvl in skills_map.items() if lvl >= min_level),
        key=lambda x: (-x[1], x[0]),
    )
    if relevant:
        body.append(r"\section*{Skills}")
        tiers: dict[int, list[str]] = {}
        for s, lvl in relevant:
            tiers.setdefault(lvl, []).append(s)
        body.append(r"\begin{itemize}")
        for lvl in sorted(tiers.keys(), reverse=True):
            label = LEVEL_LABEL.get(lvl, "")
            joined = ", ".join(e(s) for s in tiers[lvl])
            body.append(rf"  \item \textbf{{{e(label)}:}} {joined}")
        body.append(r"\end{itemize}")
        body.append("")

    def _section(title: str, items: list, key_field: str = "raw") -> None:
        if not items:
            return
        body.append(rf"\section*{{{e(title)}}}")
        body.append(r"\begin{itemize}")
        for it in items:
            if isinstance(it, dict) and "raw" in it:
                body.append(rf"  \item {e(it['raw'])}")
            elif isinstance(it, dict):
                head_parts = []
                for k in ("role", "company", "name", "school", "degree"):
                    if it.get(k):
                        head_parts.append(it[k])
                period = " ".join(filter(None, [it.get("start"), it.get("end")])).strip()
                line = " --- ".join(head_parts)
                if line:
                    body.append(rf"  \item \textbf{{{e(line)}}} \hfill \textit{{{e(period)}}}")
                for b in it.get("bullets") or []:
                    body.append(rf"  \item[--] {e(b)}")
            else:
                body.append(rf"  \item {e(str(it))}")
        body.append(r"\end{itemize}")
        body.append("")

    _section("Experience", p.get("experience") or [])
    _section("Projects", p.get("projects") or [])
    _section("Education", p.get("education") or [])

    langs = p.get("languages") or []
    if langs:
        body.append(r"\section*{Languages}")
        items = []
        for lng in langs:
            if isinstance(lng, dict):
                items.append(rf"\textbf{{{e(lng.get('name',''))}:}} {e(lng.get('level',''))}")
            else:
                items.append(e(str(lng)))
        body.append(r" \ \textbar\ ".join(items))
        body.append("")

    certs = p.get("certifications") or []
    if certs:
        body.append(r"\section*{Certifications}")
        body.append(r"\begin{itemize}")
        for c in certs:
            if isinstance(c, dict):
                line = c.get("name", "")
                if c.get("issuer"):
                    line += f" — {c['issuer']}"
                if c.get("year"):
                    line += f" ({c['year']})"
                body.append(rf"  \item {e(line)}")
            else:
                body.append(rf"  \item {e(str(c))}")
        body.append(r"\end{itemize}")
        body.append("")

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
