"""LaTeX CV renderer + optional pdflatex compile."""
from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .profile import load
from .cv import _split_bullets, _validate_template

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


_BASE_PACKAGES = r"""\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{textcomp}
\usepackage{amssymb}
\usepackage[hidelinks]{hyperref}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{xcolor}
\usepackage{paracol}
\usepackage{parskip}
\usepackage[expansion=false]{microtype}
\usepackage[none]{hyphenat}
\hyphenpenalty=10000
\exhyphenpenalty=10000
\tolerance=2000
\emergencystretch=3em
\sloppy
\raggedright
"""


def _preamble(template: str) -> str:
    """Return preamble + accent commands varying by template.

    Templates: classic, compact, modern, elegant, sidebar, minimal.
    All preambles assume \\usepackage{paracol} + \\definecolor{accent,ruleclr,muted}
    and define \\entryhead{role}{company}{location}{period}.
    """
    if template == "compact":
        return r"""\documentclass[10pt,a4paper]{article}
""" + _BASE_PACKAGES + r"""\usepackage[a4paper, margin=0.55in]{geometry}
\definecolor{accent}{HTML}{1F2937}
\definecolor{ruleclr}{HTML}{D1D5DB}
\definecolor{muted}{HTML}{6B7280}
\titleformat{\section}{\small\bfseries\color{accent}}{}{0pt}{\MakeUppercase}[\vspace{-1pt}{\color{ruleclr}\titlerule[0.6pt]}]
\titlespacing*{\section}{0pt}{12pt}{6pt}
\setlist[itemize]{leftmargin=12pt,nosep,topsep=3pt,partopsep=0pt,itemsep=3pt,label=\textcolor{accent}{\textbullet}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{18pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{4pt}
\renewcommand{\baselinestretch}{1.12}
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\bfseries\color{muted}\small #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{3pt}}
"""
    if template == "modern":
        # Bold sans-serif, vivid accent bars, generous spacing.
        return r"""\documentclass[11pt,a4paper]{article}
""" + _BASE_PACKAGES + r"""\usepackage[a4paper, margin=0.65in]{geometry}
\definecolor{accent}{HTML}{2563EB}
\definecolor{ruleclr}{HTML}{2563EB}
\definecolor{muted}{HTML}{475569}
\titleformat{\section}{\normalsize\bfseries\color{accent}}{}{0pt}{\MakeUppercase}[\vspace{-2pt}{\color{ruleclr}\titlerule[1.2pt]}]
\titlespacing*{\section}{0pt}{16pt}{8pt}
\setlist[itemize]{leftmargin=14pt,nosep,topsep=4pt,partopsep=0pt,itemsep=4pt,label={\color{accent}$\blacktriangleright$}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{22pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{5pt}
\renewcommand{\baselinestretch}{1.18}
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries\color{accent}#1}\hfill{\bfseries #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{5pt}}
"""
    if template == "elegant":
        # Serif, small caps, hairline rules, airy spacing.
        return r"""\documentclass[11pt,a4paper]{article}
""" + _BASE_PACKAGES + r"""\usepackage[a4paper, margin=0.75in]{geometry}
\definecolor{accent}{HTML}{0F172A}
\definecolor{ruleclr}{HTML}{94A3B8}
\definecolor{muted}{HTML}{475569}
\titleformat{\section}{\centering\normalsize\scshape\color{accent}}{}{0pt}{}[\vspace{-2pt}\begin{center}{\color{ruleclr}\rule{50pt}{0.4pt}}\end{center}\vspace{-6pt}]
\titlespacing*{\section}{0pt}{18pt}{8pt}
\setlist[itemize]{leftmargin=16pt,nosep,topsep=5pt,partopsep=0pt,itemsep=4pt,label=\textcolor{muted}{\textbullet}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{24pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{5pt}
\renewcommand{\baselinestretch}{1.22}
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\bfseries #2}\\\textit{\color{muted}#3}\hfill\textit{\color{muted}#4}\par\vspace{5pt}}
"""
    if template == "sidebar":
        return r"""\documentclass[10pt,a4paper]{article}
""" + _BASE_PACKAGES + r"""\usepackage[a4paper, margin=0.55in]{geometry}
\definecolor{accent}{HTML}{0EA5E9}
\definecolor{ruleclr}{HTML}{0EA5E9}
\definecolor{muted}{HTML}{475569}
\titleformat{\section}{\normalsize\bfseries\color{accent}}{}{0pt}{\MakeUppercase}[\vspace{-2pt}{\color{ruleclr}\titlerule[0.8pt]}]
\titlespacing*{\section}{0pt}{14pt}{7pt}
\setlist[itemize]{leftmargin=13pt,nosep,topsep=3pt,partopsep=0pt,itemsep=3pt,label={\color{accent}$\blacktriangleright$}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{18pt}\setlength{\columnseprule}{0.4pt}
\setlength{\parskip}{4pt}
\renewcommand{\baselinestretch}{1.14}
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries\color{accent}#1}\hfill{\bfseries #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{4pt}}
"""
    if template == "minimal":
        # No color, plain serif. ATS-safe, prints clean.
        return r"""\documentclass[11pt,a4paper]{article}
""" + _BASE_PACKAGES + r"""\usepackage[a4paper, margin=0.7in]{geometry}
\definecolor{accent}{HTML}{000000}
\definecolor{ruleclr}{HTML}{000000}
\definecolor{muted}{HTML}{333333}
\titleformat{\section}{\normalsize\bfseries}{}{0pt}{\MakeUppercase}[\vspace{-2pt}\hrule\vspace{1pt}]
\titlespacing*{\section}{0pt}{14pt}{7pt}
\setlist[itemize]{leftmargin=14pt,nosep,topsep=3pt,partopsep=0pt,itemsep=3pt,label=\textbullet}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{20pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{4pt}
\renewcommand{\baselinestretch}{1.18}
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\bfseries #2}\\\textit{#3}\hfill\textit{#4}\par\vspace{4pt}}
"""
    if template == "executive":
        # Deep charcoal, serif headings on sans body, formal corporate look.
        return r"""\documentclass[11pt,a4paper]{article}
""" + _BASE_PACKAGES + r"""\usepackage[a4paper, margin=0.7in]{geometry}
\definecolor{accent}{HTML}{111827}
\definecolor{ruleclr}{HTML}{9CA3AF}
\definecolor{muted}{HTML}{4B5563}
\titleformat{\section}{\large\bfseries\color{accent}}{}{0pt}{}[\vspace{-1pt}{\color{ruleclr}\titlerule[0.5pt]}\vspace{2pt}]
\titlespacing*{\section}{0pt}{16pt}{8pt}
\setlist[itemize]{leftmargin=14pt,nosep,topsep=4pt,partopsep=0pt,itemsep=4pt,label=\textcolor{accent}{\textendash}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{22pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{5pt}
\renewcommand{\baselinestretch}{1.2}
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\large\bfseries #1}\hfill{\bfseries\color{muted} #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{4pt}}
"""
    if template == "tech":
        # Monospace headings, teal accent, developer-flavored.
        return r"""\documentclass[10pt,a4paper]{article}
""" + _BASE_PACKAGES + r"""\usepackage[a4paper, margin=0.55in]{geometry}
\definecolor{accent}{HTML}{0D9488}
\definecolor{ruleclr}{HTML}{0D9488}
\definecolor{muted}{HTML}{475569}
\titleformat{\section}{\small\bfseries\ttfamily\color{accent}}{}{0pt}{}[\vspace{-2pt}{\color{ruleclr}\titlerule[0.6pt]}]
\titlespacing*{\section}{0pt}{14pt}{7pt}
\setlist[itemize]{leftmargin=14pt,nosep,topsep=3pt,partopsep=0pt,itemsep=3pt,label={\color{accent}\ttfamily\textgreater}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{18pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{4pt}
\renewcommand{\baselinestretch}{1.14}
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\ttfamily\small\color{muted} #2}\\\textit{\color{muted}\small #3}\hfill{\ttfamily\small\color{muted} #4}\par\vspace{4pt}}
"""
    if template == "academic":
        # Single-column friendly, serif, generous whitespace. Research/grad-school look.
        return r"""\documentclass[11pt,a4paper]{article}
""" + _BASE_PACKAGES + r"""\usepackage[a4paper, margin=0.85in]{geometry}
\definecolor{accent}{HTML}{1F2937}
\definecolor{ruleclr}{HTML}{CBD5E1}
\definecolor{muted}{HTML}{4B5563}
\titleformat{\section}{\normalsize\bfseries\color{accent}}{}{0pt}{}[\vspace{-1pt}{\color{ruleclr}\titlerule[0.4pt]}]
\titlespacing*{\section}{0pt}{18pt}{9pt}
\setlist[itemize]{leftmargin=14pt,nosep,topsep=4pt,partopsep=0pt,itemsep=4pt,label=\textcolor{muted}{\textbullet}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{26pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{6pt}
\renewcommand{\baselinestretch}{1.24}
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\bfseries #2}\\\textit{\color{muted}#3}\hfill\textit{\color{muted}#4}\par\vspace{5pt}}
"""
    # classic (default) — navy accent, balanced two-column with breathing room.
    return r"""\documentclass[11pt,a4paper]{article}
""" + _BASE_PACKAGES + r"""\usepackage[a4paper, margin=0.65in]{geometry}
\definecolor{accent}{HTML}{1E3A8A}
\definecolor{ruleclr}{HTML}{1E3A8A}
\definecolor{muted}{HTML}{475569}
\titleformat{\section}{\normalsize\bfseries\color{accent}}{}{0pt}{\MakeUppercase}[\vspace{-2pt}{\color{ruleclr}\titlerule[0.8pt]}]
\titlespacing*{\section}{0pt}{14pt}{7pt}
\setlist[itemize]{leftmargin=14pt,nosep,topsep=3pt,partopsep=0pt,itemsep=3pt,label=\textcolor{accent}{\textbullet}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{20pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{4pt}
\renewcommand{\baselinestretch}{1.16}
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\bfseries #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{4pt}}
"""


# Back-compat alias (used by tests/other modules).
PREAMBLE = _preamble("classic")


def render_tex(profile: dict[str, Any] | None = None, min_level: int = 3, template: str | None = None) -> str:
    p = profile or load()
    pers = p.get("personal", {})
    e = _escape
    tpl = _validate_template(template)
    preamble = _preamble(tpl)

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

    body: list[str] = [preamble, r"\begin{document}", ""]
    # Header banner — full width
    body.append(r"\begin{center}")
    body.append(rf"{{\LARGE\bfseries\color{{accent}} {name}}}\\[2pt]")
    if title_line:
        body.append(rf"{{\large\color{{muted}} {title_line}}}\\[4pt]")
    body.append(rf"\small {contact}")
    body.append(r"\end{center}")
    body.append(r"\vspace{2pt}{\color{ruleclr}\hrule height 0.6pt}\vspace{4pt}")
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
                header, bullets = _split_bullets(it.get("raw") or "")
                if header:
                    out.append(rf"\textbf{{{e(header)}}}\par\vspace{{1pt}}")
                if bullets:
                    out.append(r"\begin{itemize}")
                    for b in bullets:
                        out.append(rf"  \item {e(b)}")
                    out.append(r"\end{itemize}")
                if not header and not bullets:
                    out.append(rf"\textbullet\ {e(it.get('raw',''))}\par")
                out.append(r"\vspace{4pt}")
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
        # Comma-separated list per tier — denser, easier to read in narrow sidebar
        # than a tall ragged bullet column.
        sorted_tiers = sorted(tiers.keys(), reverse=True)
        for lvl in sorted_tiers:
            label = LEVEL_LABEL.get(lvl, "")
            skills_csv = ", ".join(e(s) for s in tiers[lvl])
            if len(sorted_tiers) > 1:
                out.append(rf"\textbf{{{e(label)}}}: {skills_csv}\par\vspace{{2pt}}")
            else:
                out.append(rf"{skills_csv}\par")
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


def compile_pdf(tex_source: str) -> bytes | None | tuple[None, str]:
    """Compile .tex → PDF bytes via pdflatex.

    Returns:
        - bytes on success
        - None if pdflatex binary missing (server-side issue, not user error)
        - (None, error_log) tuple if pdflatex ran but failed — log surfaces to client
    """
    if not shutil.which("pdflatex"):
        return None
    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        tex_path = tdp / "cv.tex"
        tex_path.write_text(tex_source, encoding="utf-8")
        last_stderr = b""
        last_stdout = b""
        for _ in range(2):  # twice for references
            r = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "cv.tex"],
                cwd=tdp,
                capture_output=True,
                timeout=60,
            )
            last_stderr, last_stdout = r.stderr, r.stdout
            if r.returncode != 0:
                # Pull the error region from the .log if it exists.
                log = tdp / "cv.log"
                err = ""
                if log.exists():
                    txt = log.read_text(errors="replace")
                    # Show lines after the first "!" (LaTeX error marker)
                    idx = txt.find("\n!")
                    err = txt[idx:idx + 2000] if idx != -1 else txt[-2000:]
                if not err:
                    err = (last_stderr or last_stdout).decode(errors="replace")[-2000:]
                return (None, err)
        pdf = tdp / "cv.pdf"
        if pdf.exists():
            return pdf.read_bytes()
    return (None, "pdflatex finished but produced no PDF.")
