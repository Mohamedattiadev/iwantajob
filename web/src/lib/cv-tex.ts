// Pure profile → LaTeX source. Mirrors scraper/jobscraper/latex.py:render_tex
// so we can drop the FastAPI .tex endpoint. The output is identical for the
// same profile + template, so downstream pdflatex compile (whether FastAPI,
// tectonic on Vercel, or local) keeps working unchanged.

import type { Profile } from "./api";
import { splitBullets } from "./cv-render";

const LEVEL_LABEL: Record<number, string> = {
  1: "Familiar",
  2: "Basic",
  3: "Working",
  4: "Strong",
  5: "Expert",
};

const VALID_TEMPLATES = new Set([
  "classic", "compact", "modern", "elegant", "sidebar", "minimal",
  "executive", "tech", "academic", "banner", "mono", "warm", "neon",
]);

function validateTemplate(name: string | undefined): string {
  return name && VALID_TEMPLATES.has(name) ? name : "classic";
}

const LATEX_REPLACEMENTS: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  "$": "\\$",
  "#": "\\#",
  "_": "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  "●": "\\textbullet{}",
  "•": "\\textbullet{}",
  "◦": "\\textopenbullet{}",
  "▪": "\\textbullet{}",
  "—": "---",
  "–": "--",
  "“": "``",
  "”": "''",
  "‘": "`",
  "’": "'",
  "→": "$\\rightarrow$",
  "←": "$\\leftarrow$",
  "≥": "$\\geq$",
  "≤": "$\\leq$",
  "✓": "$\\checkmark$",
  "★": "$\\star$",
  "·": "\\textperiodcentered{}",
};

function stripLeadingBullets(s: string): string {
  return s.replace(/^[\s●•◦▪\-*]+/, "").trim();
}

function escapeTex(input: string | undefined | null): string {
  if (!input) return "";
  let s = String(input);
  if (/^[●•◦▪]/.test(s)) s = stripLeadingBullets(s);
  let out = "";
  for (const ch of s) {
    if (LATEX_REPLACEMENTS[ch] !== undefined) {
      out += LATEX_REPLACEMENTS[ch];
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code > 127 && !(code >= 0x00C0 && code <= 0x024F)) {
      out += "?";
    } else {
      out += ch;
    }
  }
  return out;
}

const BASE_PACKAGES = String.raw`\usepackage[utf8]{inputenc}
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
`;

function preamble(template: string): string {
  if (template === "compact") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.4in, top=0.35in, bottom=0.35in]{geometry}
\usepackage{anyfontsize}
\AtBeginDocument{\fontsize{9.5pt}{11.2pt}\selectfont}
\definecolor{accent}{HTML}{1F2937}
\definecolor{ruleclr}{HTML}{D1D5DB}
\definecolor{muted}{HTML}{6B7280}
\titleformat{\section}{\small\bfseries\color{accent}}{}{0pt}{\MakeUppercase}[\vspace{-2pt}{\color{ruleclr}\titlerule[0.5pt]}]
\titlespacing*{\section}{0pt}{6pt}{2pt}
\setlist[itemize]{leftmargin=10pt,nosep,topsep=1pt,partopsep=0pt,itemsep=1pt,parsep=0pt,label=\textcolor{accent}{\textbullet}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{16pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{2pt}
\renewcommand{\baselinestretch}{1.02}
\raggedbottom
\sloppy
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\bfseries\color{muted}\small #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{1pt}}
`;
  }
  if (template === "modern") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.5in]{geometry}
\definecolor{accent}{HTML}{2563EB}
\definecolor{ruleclr}{HTML}{2563EB}
\definecolor{muted}{HTML}{475569}
\titleformat{\section}{\small\bfseries\color{accent}}{}{0pt}{\MakeUppercase}[\vspace{-2pt}{\color{ruleclr}\titlerule[1pt]}]
\titlespacing*{\section}{0pt}{8pt}{3pt}
\setlist[itemize]{leftmargin=12pt,nosep,topsep=2pt,partopsep=0pt,itemsep=1.5pt,parsep=0pt,label={\color{accent}$\blacktriangleright$}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{18pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{3pt}
\renewcommand{\baselinestretch}{1.08}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries\color{accent}#1}\hfill{\bfseries #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{2pt}}
`;
  }
  if (template === "elegant") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.55in]{geometry}
\definecolor{accent}{HTML}{0F172A}
\definecolor{ruleclr}{HTML}{94A3B8}
\definecolor{muted}{HTML}{475569}
\titleformat{\section}{\centering\small\scshape\color{accent}}{}{0pt}{}[\vspace{-3pt}\begin{center}{\color{ruleclr}\rule{40pt}{0.4pt}}\end{center}\vspace{-8pt}]
\titlespacing*{\section}{0pt}{8pt}{2pt}
\setlist[itemize]{leftmargin=14pt,nosep,topsep=2pt,partopsep=0pt,itemsep=1.5pt,parsep=0pt,label=\textcolor{muted}{\textbullet}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{20pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{3pt}
\renewcommand{\baselinestretch}{1.1}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\bfseries #2}\\\textit{\color{muted}#3}\hfill\textit{\color{muted}#4}\par\vspace{2pt}}
`;
  }
  if (template === "sidebar") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.45in]{geometry}
\definecolor{accent}{HTML}{0EA5E9}
\definecolor{ruleclr}{HTML}{0EA5E9}
\definecolor{muted}{HTML}{475569}
\titleformat{\section}{\small\bfseries\color{accent}}{}{0pt}{\MakeUppercase}[\vspace{-2pt}{\color{ruleclr}\titlerule[0.7pt]}]
\titlespacing*{\section}{0pt}{7pt}{2pt}
\setlist[itemize]{leftmargin=11pt,nosep,topsep=2pt,partopsep=0pt,itemsep=1.5pt,parsep=0pt,label={\color{accent}$\blacktriangleright$}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{16pt}\setlength{\columnseprule}{0.4pt}
\setlength{\parskip}{2pt}
\renewcommand{\baselinestretch}{1.06}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries\color{accent}#1}\hfill{\bfseries #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{2pt}}
`;
  }
  if (template === "minimal") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.5in]{geometry}
\definecolor{accent}{HTML}{000000}
\definecolor{ruleclr}{HTML}{000000}
\definecolor{muted}{HTML}{333333}
\titleformat{\section}{\small\bfseries}{}{0pt}{\MakeUppercase}[\vspace{-2pt}\hrule\vspace{1pt}]
\titlespacing*{\section}{0pt}{7pt}{2pt}
\setlist[itemize]{leftmargin=12pt,nosep,topsep=2pt,partopsep=0pt,itemsep=1.5pt,parsep=0pt,label=\textbullet}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{18pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{2pt}
\renewcommand{\baselinestretch}{1.08}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\bfseries #2}\\\textit{#3}\hfill\textit{#4}\par\vspace{2pt}}
`;
  }
  if (template === "executive") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.5in]{geometry}
\definecolor{accent}{HTML}{111827}
\definecolor{ruleclr}{HTML}{9CA3AF}
\definecolor{muted}{HTML}{4B5563}
\titleformat{\section}{\normalsize\bfseries\color{accent}}{}{0pt}{}[\vspace{-1pt}{\color{ruleclr}\titlerule[0.4pt]}\vspace{1pt}]
\titlespacing*{\section}{0pt}{8pt}{3pt}
\setlist[itemize]{leftmargin=12pt,nosep,topsep=2pt,partopsep=0pt,itemsep=2pt,parsep=0pt,label=\textcolor{accent}{\textendash}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{18pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{3pt}
\renewcommand{\baselinestretch}{1.1}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\normalsize\bfseries #1}\hfill{\bfseries\color{muted} #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{2pt}}
`;
  }
  if (template === "tech") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.45in]{geometry}
\definecolor{accent}{HTML}{0D9488}
\definecolor{ruleclr}{HTML}{0D9488}
\definecolor{muted}{HTML}{475569}
\titleformat{\section}{\small\bfseries\ttfamily\color{accent}}{}{0pt}{}[\vspace{-2pt}{\color{ruleclr}\titlerule[0.5pt]}]
\titlespacing*{\section}{0pt}{7pt}{2pt}
\setlist[itemize]{leftmargin=12pt,nosep,topsep=2pt,partopsep=0pt,itemsep=1.5pt,parsep=0pt,label={\color{accent}\ttfamily\textgreater}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{16pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{2pt}
\renewcommand{\baselinestretch}{1.06}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\ttfamily\small\color{muted} #2}\\\textit{\color{muted}\small #3}\hfill{\ttfamily\small\color{muted} #4}\par\vspace{2pt}}
`;
  }
  if (template === "academic") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.55in]{geometry}
\definecolor{accent}{HTML}{1F2937}
\definecolor{ruleclr}{HTML}{CBD5E1}
\definecolor{muted}{HTML}{4B5563}
\titleformat{\section}{\small\bfseries\color{accent}}{}{0pt}{}[\vspace{-2pt}{\color{ruleclr}\titlerule[0.4pt]}]
\titlespacing*{\section}{0pt}{8pt}{2pt}
\setlist[itemize]{leftmargin=14pt,nosep,topsep=2pt,partopsep=0pt,itemsep=1.5pt,parsep=0pt,label=\textcolor{muted}{\textbullet}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{20pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{3pt}
\renewcommand{\baselinestretch}{1.1}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\bfseries #2}\\\textit{\color{muted}#3}\hfill\textit{\color{muted}#4}\par\vspace{2pt}}
`;
  }
  if (template === "banner") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.5in, top=0.3in]{geometry}
\usepackage{tcolorbox}
\definecolor{accent}{HTML}{1E3A8A}
\definecolor{ruleclr}{HTML}{1E3A8A}
\definecolor{muted}{HTML}{475569}
\definecolor{bannerbg}{HTML}{1E3A8A}
\titleformat{\section}{\small\bfseries\color{accent}}{}{0pt}{\MakeUppercase}[\vspace{-2pt}{\color{ruleclr}\titlerule[0.8pt]}]
\titlespacing*{\section}{0pt}{7pt}{2pt}
\setlist[itemize]{leftmargin=12pt,nosep,topsep=2pt,partopsep=0pt,itemsep=1.5pt,parsep=0pt,label=\textcolor{accent}{\textbullet}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{18pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{3pt}
\renewcommand{\baselinestretch}{1.08}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\bfseries\color{muted}\small #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{2pt}}
`;
  }
  if (template === "mono") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.5in]{geometry}
\renewcommand{\familydefault}{\ttdefault}
\definecolor{accent}{HTML}{166534}
\definecolor{ruleclr}{HTML}{86EFAC}
\definecolor{muted}{HTML}{4B5563}
\titleformat{\section}{\small\bfseries\color{accent}}{}{0pt}{}[\vspace{-2pt}{\color{ruleclr}\titlerule[0.6pt]}]
\titlespacing*{\section}{0pt}{8pt}{2pt}
\setlist[itemize]{leftmargin=12pt,nosep,topsep=2pt,partopsep=0pt,itemsep=1.5pt,parsep=0pt,label={\color{accent}\#}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{16pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{3pt}
\renewcommand{\baselinestretch}{1.08}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\small\color{muted} #2}\\{\small\color{muted} #3}\hfill{\small\color{muted} #4}\par\vspace{2pt}}
`;
  }
  if (template === "warm") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.55in]{geometry}
\definecolor{accent}{HTML}{9F1239}
\definecolor{ruleclr}{HTML}{F4C2C2}
\definecolor{muted}{HTML}{57534E}
\titleformat{\section}{\normalsize\bfseries\itshape\color{accent}}{}{0pt}{}[\vspace{-2pt}{\color{ruleclr}\titlerule[1.4pt]}]
\titlespacing*{\section}{0pt}{8pt}{3pt}
\setlist[itemize]{leftmargin=14pt,nosep,topsep=2pt,partopsep=0pt,itemsep=1.5pt,parsep=0pt,label=\textcolor{accent}{\textbullet}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{20pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{3pt}
\renewcommand{\baselinestretch}{1.08}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries\color{accent}#1}\hfill{\bfseries #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{2pt}}
`;
  }
  if (template === "neon") {
    return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.5in]{geometry}
\definecolor{accent}{HTML}{D946EF}
\definecolor{ruleclr}{HTML}{06B6D4}
\definecolor{muted}{HTML}{475569}
\titleformat{\section}{\small\bfseries\color{accent}}{}{0pt}{\MakeUppercase}[\vspace{-2pt}{\color{ruleclr}\titlerule[1.2pt]}]
\titlespacing*{\section}{0pt}{7pt}{2pt}
\setlist[itemize]{leftmargin=12pt,nosep,topsep=2pt,partopsep=0pt,itemsep=1.5pt,parsep=0pt,label={\color{ruleclr}$\bullet$}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{16pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{2pt}
\renewcommand{\baselinestretch}{1.06}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries\color{accent}#1}\hfill{\bfseries\color{ruleclr}#2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{2pt}}
`;
  }
  // classic — extra breathing room vs the dense templates
  return String.raw`\documentclass[10pt,a4paper]{article}
` + BASE_PACKAGES + String.raw`\usepackage[a4paper, margin=0.55in]{geometry}
\definecolor{accent}{HTML}{1E3A8A}
\definecolor{ruleclr}{HTML}{1E3A8A}
\definecolor{muted}{HTML}{475569}
\titleformat{\section}{\small\bfseries\color{accent}}{}{0pt}{\MakeUppercase}[\vspace{-2pt}{\color{ruleclr}\titlerule[0.7pt]}]
\titlespacing*{\section}{0pt}{11pt}{4pt}
\setlist[itemize]{leftmargin=12pt,nosep,topsep=3pt,partopsep=0pt,itemsep=3pt,parsep=0pt,label=\textcolor{accent}{\textbullet}}
\pagenumbering{gobble}\setlength{\parindent}{0pt}\setlength{\columnsep}{20pt}\setlength{\columnseprule}{0pt}
\setlength{\parskip}{5pt}
\renewcommand{\baselinestretch}{1.18}
\raggedbottom
\hypersetup{colorlinks=true,urlcolor=accent}
\newcommand{\entryhead}[4]{{\bfseries #1}\hfill{\bfseries #2}\\\textit{\color{muted}\small #3}\hfill\textit{\color{muted}\small #4}\par\vspace{3pt}}
`;
}

type Entry = Record<string, unknown>;

function joinFiltered(parts: Array<unknown>, sep: string): string {
  return parts
    .map((p) => (typeof p === "string" ? p : ""))
    .filter((p) => p.length > 0)
    .join(sep);
}

function entriesBlock(title: string, items: unknown[]): string[] {
  if (!items.length) return [];
  const out: string[] = [`\\section*{${escapeTex(title)}}`];
  for (const itRaw of items) {
    if (itRaw && typeof itRaw === "object") {
      const it = itRaw as Entry;
      const hasStructured = ["role", "company", "name", "school", "degree", "bullets"].some(
        (k) => it[k],
      );
      if ("raw" in it && !hasStructured) {
        const { header, bullets } = splitBullets(String(it.raw ?? ""));
        if (header) out.push(`\\textbf{${escapeTex(header)}}\\par\\vspace{1pt}`);
        if (bullets.length) {
          out.push("\\begin{itemize}");
          for (const b of bullets) out.push(`  \\item ${escapeTex(b)}`);
          out.push("\\end{itemize}");
        }
        if (!header && bullets.length === 0) {
          out.push(`\\textbullet\\ ${escapeTex(String(it.raw ?? ""))}\\par`);
        }
        out.push("\\vspace{4pt}");
        continue;
      }
      const left = String(it.role ?? it.name ?? it.degree ?? "");
      const right = String(it.company ?? it.school ?? "");
      const subLeft = String(it.location ?? "");
      const period = joinFiltered([it.start, it.end], " -- ").trim();
      out.push(
        `\\entryhead{${escapeTex(left)}}{${escapeTex(right)}}{${escapeTex(subLeft)}}{${escapeTex(period)}}`,
      );
      const bullets = Array.isArray(it.bullets) ? (it.bullets as unknown[]) : [];
      if (bullets.length) {
        out.push("\\begin{itemize}");
        for (const b of bullets) out.push(`  \\item ${escapeTex(String(b))}`);
        out.push("\\end{itemize}");
      }
      out.push("\\vspace{4pt}");
    } else {
      out.push(`\\textbullet\\ ${escapeTex(String(itRaw))}\\par`);
    }
  }
  out.push("");
  return out;
}

function skillsBlock(profile: Profile, minLevel: number): string[] {
  const skillsMap = (profile.skills ?? {}) as Record<string, number>;
  const relevant = Object.entries(skillsMap)
    .filter(([, lvl]) => lvl >= minLevel)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!relevant.length) return [];
  const out: string[] = ["\\section*{Skills}"];
  const tiers = new Map<number, string[]>();
  for (const [s, lvl] of relevant) {
    if (!tiers.has(lvl)) tiers.set(lvl, []);
    tiers.get(lvl)!.push(s);
  }
  const tierKeys = [...tiers.keys()].sort((a, b) => b - a);
  for (const lvl of tierKeys) {
    const label = LEVEL_LABEL[lvl] ?? "";
    const csv = tiers.get(lvl)!.map((s) => escapeTex(s)).join(", ");
    if (tierKeys.length > 1) {
      out.push(`\\textbf{${escapeTex(label)}}: ${csv}\\par\\vspace{2pt}`);
    } else {
      out.push(`${csv}\\par`);
    }
  }
  out.push("");
  return out;
}

function certsBlock(profile: Profile): string[] {
  const certs = (profile.certifications ?? []) as unknown[];
  if (!certs.length) return [];
  const out: string[] = ["\\section*{Certifications}", "\\begin{itemize}"];
  for (const c of certs) {
    if (c && typeof c === "object") {
      const o = c as Entry;
      let line = String(o.name ?? "");
      if (o.issuer) line += ` — ${String(o.issuer)}`;
      if (o.year) line += ` (${String(o.year)})`;
      out.push(`  \\item ${escapeTex(line)}`);
    } else {
      out.push(`  \\item ${escapeTex(String(c))}`);
    }
  }
  out.push("\\end{itemize}");
  out.push("");
  return out;
}

function langsBlock(profile: Profile): string[] {
  const langs = (profile.languages ?? []) as unknown[];
  if (!langs.length) return [];
  const out: string[] = ["\\section*{Languages}", "\\begin{itemize}"];
  for (const lng of langs) {
    if (lng && typeof lng === "object") {
      const o = lng as Entry;
      let line = String(o.name ?? "");
      if (o.level) line += ` — ${String(o.level)}`;
      out.push(`  \\item ${escapeTex(line)}`);
    } else {
      out.push(`  \\item ${escapeTex(String(lng))}`);
    }
  }
  out.push("\\end{itemize}");
  out.push("");
  return out;
}

export function renderTex(profile: Profile, minLevel = 3, template = "classic"): string {
  const tpl = validateTemplate(template);
  const pers = profile.personal ?? {};
  const name = escapeTex(pers.name || "Your Name");
  const titleLine = escapeTex(
    (pers as { headline?: string; title?: string }).headline
      ?? (pers as { title?: string }).title
      ?? "",
  );

  const contactBits: string[] = [];
  if (pers.email) contactBits.push(`\\href{mailto:${pers.email}}{${escapeTex(pers.email)}}`);
  if (pers.phone) contactBits.push(escapeTex(pers.phone));
  if (pers.location) contactBits.push(escapeTex(pers.location));
  const links = pers.links ?? {};
  if (links.github) contactBits.push(`\\href{${links.github}}{GitHub}`);
  if (links.linkedin) contactBits.push(`\\href{${links.linkedin}}{LinkedIn}`);
  if (links.portfolio) contactBits.push(`\\href{${links.portfolio}}{Portfolio}`);
  const contact = contactBits.join(" \\ \\textbar\\ ");

  const body: string[] = [preamble(tpl), "\\begin{document}", ""];

  if (tpl === "banner") {
    body.push(
      "\\noindent\\begin{tcolorbox}[colback=bannerbg,colframe=bannerbg,boxrule=0pt,arc=0pt,left=10pt,right=10pt,top=6pt,bottom=6pt]",
    );
    body.push(`{\\LARGE\\bfseries\\color{white} ${name}}\\\\[2pt]`);
    if (titleLine) body.push(`{\\small\\color{white!85} ${titleLine}}\\\\[2pt]`);
    body.push(`{\\footnotesize\\color{white!90} ${contact}}`);
    body.push("\\end{tcolorbox}");
    body.push("\\vspace{4pt}");
  } else {
    body.push("\\begin{center}");
    body.push(`{\\LARGE\\bfseries\\color{accent} ${name}}\\\\[2pt]`);
    if (titleLine) body.push(`{\\large\\color{muted} ${titleLine}}\\\\[4pt]`);
    body.push(`\\small ${contact}`);
    body.push("\\end{center}");
    body.push("\\vspace{2pt}{\\color{ruleclr}\\hrule height 0.6pt}\\vspace{4pt}");
  }
  body.push("");

  body.push("\\columnratio{0.66}");
  body.push("\\begin{paracol}{2}");
  body.push(...entriesBlock("Work Experience", (profile.experience ?? []) as unknown[]));
  body.push(...entriesBlock("Projects", (profile.projects ?? []) as unknown[]));
  body.push("\\switchcolumn");
  body.push(...skillsBlock(profile, minLevel));
  body.push(...entriesBlock("Education", (profile.education ?? []) as unknown[]));
  body.push(...certsBlock(profile));
  body.push(...langsBlock(profile));
  body.push("\\end{paracol}");
  body.push("\\end{document}");
  return body.join("\n");
}
