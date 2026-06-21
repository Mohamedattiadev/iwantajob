// Pure transform of the profile blob → ATS-friendly Markdown CV.
// Mirrors scraper/src/jobscraper/cv.py:render_markdown so we can drop
// the FastAPI endpoint without changing what the user sees.

export type Profile = {
  personal?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    links?: { github?: string; linkedin?: string; portfolio?: string };
    summary?: string;
  };
  skills?: Record<string, number>;
  experience?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  education?: Array<Record<string, unknown>>;
  languages?: Array<unknown>;
  certifications?: Array<unknown>;
};

const LEVEL_LABEL: Record<number, string> = {
  0: "",
  1: "Familiar",
  2: "Basic",
  3: "Working",
  4: "Strong",
  5: "Expert",
};

const BULLET_RE = /\s*[●•▪◆■]\s*/;

export function splitBullets(raw: string): { header: string; bullets: string[] } {
  if (!raw) return { header: "", bullets: [] };
  const s = raw.trim();
  const parts = s
    .split(BULLET_RE)
    .map((p) => p.replace(/^[\s\n\t\-:]+|[\s\n\t\-:]+$/g, ""))
    .filter((p) => p.length > 0);
  if (parts.length === 0) return { header: s, bullets: [] };
  if (parts.length === 1) return { header: parts[0], bullets: [] };
  return { header: parts[0], bullets: parts.slice(1) };
}

function str(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function arr(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function joinFiltered(parts: Array<string | undefined>, sep: string): string {
  return parts.filter((p): p is string => Boolean(p)).join(sep);
}

export function renderMarkdown(profile: Profile, minLevel = 3): string {
  const pers = profile.personal ?? {};
  const lines: string[] = [];

  lines.push(`# ${pers.name || "Your Name"}`);
  const contact: string[] = [];
  if (pers.email) contact.push(pers.email);
  if (pers.phone) contact.push(pers.phone);
  if (pers.location) contact.push(pers.location);
  const links = pers.links ?? {};
  if (links.github) contact.push(`[GitHub](${links.github})`);
  if (links.linkedin) contact.push(`[LinkedIn](${links.linkedin})`);
  if (links.portfolio) contact.push(`[Portfolio](${links.portfolio})`);
  if (contact.length) lines.push(contact.join(" · "));
  lines.push("");

  // Skills
  const skillsMap = profile.skills ?? {};
  const relevant = Object.entries(skillsMap)
    .filter(([, lvl]) => typeof lvl === "number" && lvl >= minLevel)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (relevant.length) {
    lines.push("## Skills");
    const tiers = new Map<number, string[]>();
    for (const [skill, lvl] of relevant) {
      if (!tiers.has(lvl)) tiers.set(lvl, []);
      tiers.get(lvl)!.push(skill);
    }
    const tierKeys = [...tiers.keys()].sort((a, b) => b - a);
    for (const lvl of tierKeys) {
      const label = LEVEL_LABEL[lvl] ?? "";
      const joined = tiers.get(lvl)!.join(", ");
      lines.push(label ? `- **${label}**: ${joined}` : `- ${joined}`);
    }
    lines.push("");
  }

  // Experience
  const exp = arr(profile.experience);
  if (exp.length) {
    lines.push("## Experience");
    for (const eRaw of exp) {
      const e = eRaw as Record<string, unknown>;
      if ("raw" in e) {
        const { header, bullets } = splitBullets(str(e.raw));
        if (header) lines.push(`**${header}**`);
        for (const b of bullets) lines.push(`- ${b}`);
        if (!header && bullets.length === 0) lines.push(`- ${str(e.raw)}`);
      } else {
        const title = joinFiltered([str(e.role), str(e.company)], " — ");
        const period = joinFiltered([str(e.start), str(e.end)], " ").trim();
        if (title || period) lines.push(`**${title}** _${period}_`);
        if (e.location) lines.push(`_${str(e.location)}_`);
        for (const b of arr(e.bullets)) lines.push(`- ${str(b)}`);
      }
      lines.push("");
    }
  }

  // Projects
  const proj = arr(profile.projects);
  if (proj.length) {
    lines.push("## Projects");
    for (const prRaw of proj) {
      const pr = prRaw as Record<string, unknown>;
      if ("raw" in pr) {
        const { header, bullets } = splitBullets(str(pr.raw));
        if (header) lines.push(`**${header}**`);
        for (const b of bullets) lines.push(`- ${b}`);
        if (!header && bullets.length === 0) lines.push(`- ${str(pr.raw)}`);
      } else {
        let head = str(pr.name);
        const link = str(pr.link);
        if (link) head = `[${head}](${link})`;
        lines.push(`**${head}**`);
        if (pr.summary) lines.push(str(pr.summary));
        for (const b of arr(pr.bullets)) lines.push(`- ${str(b)}`);
        const sk = arr(pr.skills);
        if (sk.length) lines.push(`_Tech: ${sk.map(str).join(", ")}_`);
      }
      lines.push("");
    }
  }

  // Education
  const edu = arr(profile.education);
  if (edu.length) {
    lines.push("## Education");
    for (const edRaw of edu) {
      const ed = edRaw as Record<string, unknown>;
      if ("raw" in ed) {
        const { header, bullets } = splitBullets(str(ed.raw));
        if (header) lines.push(`**${header}**`);
        for (const b of bullets) lines.push(`- ${b}`);
        if (!header && bullets.length === 0) lines.push(`- ${str(ed.raw)}`);
      } else {
        const title = joinFiltered([str(ed.degree), str(ed.school)], " — ");
        const period = joinFiltered([str(ed.start), str(ed.end)], " ").trim();
        if (title || period) lines.push(`**${title}** _${period}_`);
        if (ed.gpa) lines.push(`GPA: ${str(ed.gpa)}`);
      }
      lines.push("");
    }
  }

  // Languages
  const langs = arr(profile.languages);
  if (langs.length) {
    lines.push("## Languages");
    for (const lng of langs) {
      if (lng && typeof lng === "object") {
        const o = lng as Record<string, unknown>;
        const line = `${str(o.name)}: ${str(o.level)}`.replace(/: $/, "");
        lines.push(`- ${line}`);
      } else {
        lines.push(`- ${str(lng)}`);
      }
    }
    lines.push("");
  }

  // Certifications
  const certs = arr(profile.certifications);
  if (certs.length) {
    lines.push("## Certifications");
    for (const c of certs) {
      if (c && typeof c === "object") {
        const o = c as Record<string, unknown>;
        let line = str(o.name);
        if (o.issuer) line += ` — ${str(o.issuer)}`;
        if (o.year) line += ` (${str(o.year)})`;
        lines.push(`- ${line}`);
      } else {
        lines.push(`- ${str(c)}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\s+$/g, "") + "\n";
}

// ---------- HTML render (mirrors scraper/cv.py render_html) ----------

export const CV_TEMPLATES: Array<{ id: string; name: string; desc: string }> = [
  { id: "compact",   name: "Compact",   desc: "Tight one-page. Default for fresh uploads." },
  { id: "classic",   name: "Classic",   desc: "Navy accent. Balanced. Safe default." },
  { id: "modern",    name: "Modern",    desc: "Bold blue rule. Sharp sans-serif." },
  { id: "executive", name: "Executive", desc: "Charcoal serif. Senior-leadership feel." },
  { id: "academic",  name: "Academic",  desc: "Serif single-column. Research / grad-school." },
  { id: "tech",      name: "Tech",      desc: "Teal monospace headings. Developer feel." },
  { id: "elegant",   name: "Elegant",   desc: "Serif small-caps. Centered hairline rules." },
  { id: "sidebar",   name: "Sidebar",   desc: "Sky accent. Hairline column divider." },
  { id: "minimal",   name: "Minimal",   desc: "Black-and-white serif. ATS-safe." },
  { id: "banner",    name: "Banner",    desc: "Navy full-width header band. Bold ID." },
  { id: "mono",      name: "Mono",      desc: "All-monospace, green. Retro CRT / dev." },
  { id: "warm",      name: "Warm",      desc: "Burgundy italic. Editorial / agency." },
  { id: "neon",      name: "Neon",      desc: "Magenta + cyan. Designer / portfolio." },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMd(s: string): string {
  // Apply on already-escaped content. Order matters: links first so the
  // bracketed text isn't matched by ** / _ patterns inside.
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) =>
      `<a href="${escapeHtml(href)}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function mdToHtml(md: string): string {
  const out: string[] = [];
  let inList = false;
  for (const line of md.split("\n")) {
    if (line.startsWith("# ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inlineMd(escapeHtml(line.slice(2)))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    if (!line.trim()) { out.push(""); continue; }
    out.push(`<p>${inlineMd(escapeHtml(line))}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

const TEMPLATE_CSS: Record<string, string> = {
  classic: `
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
  `,
  compact: `
    @page { size: A4; margin: 12mm; }
    body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
           max-width: 740px; margin: 18px auto; padding: 0 18px;
           color: #111; line-height: 1.28; font-size: 11.5px; }
    h1   { font-size: 20px; margin: 0 0 1px; letter-spacing: -0.01em; font-weight: 700; }
    h1 + p { color: #555; font-size: 10.5px; margin: 0 0 8px; }
    h2   { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em;
           color: #333; margin: 9px 0 2px; border-bottom: 1px solid #ccc; padding-bottom: 1px; }
    p    { margin: 2px 0; }
    ul   { margin: 2px 0 5px 16px; padding: 0; }
    li   { margin: 0.5px 0; }
    a    { color: #1a4dad; text-decoration: none; }
    strong { color: #000; }
    em   { color: #555; font-style: normal; }
  `,
  modern: `
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
  `,
  elegant: `
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
  `,
  sidebar: `
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
  `,
  minimal: `
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
  `,
  executive: `
    body { font-family: "Inter", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
           max-width: 760px; margin: 40px auto; padding: 0 28px;
           color: #111827; line-height: 1.55; font-size: 13.5px; }
    h1   { font-family: "Georgia", serif; font-size: 30px; margin: 0 0 4px; font-weight: 700; color: #111827; }
    h1 + p { color: #4B5563; font-size: 12.5px; margin: 0 0 20px; padding-bottom: 10px;
             border-bottom: 1px solid #9CA3AF; }
    h2   { font-family: "Georgia", serif; font-size: 14px; color: #111827;
           margin: 22px 0 8px; border-bottom: 0.5px solid #9CA3AF; padding-bottom: 3px; font-weight: 700; }
    p    { margin: 5px 0; }
    ul   { margin: 5px 0 12px 18px; padding: 0; list-style: none; }
    li   { margin: 3px 0; position: relative; padding-left: 14px; }
    li::before { content: "–"; color: #111827; position: absolute; left: 0; }
    a    { color: #111827; text-decoration: underline; }
    strong { color: #111827; }
    em   { color: #4B5563; font-style: italic; }
  `,
  tech: `
    body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
           max-width: 740px; margin: 32px auto; padding: 0 24px;
           color: #0f172a; line-height: 1.5; font-size: 13px; }
    h1   { font-size: 26px; margin: 0 0 2px; font-weight: 700; letter-spacing: -0.01em; }
    h1 + p { color: #475569; font-size: 12px; margin: 0 0 16px; }
    h2   { font-family: ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace;
           font-size: 11px; color: #0d9488; margin: 18px 0 6px;
           border-bottom: 0.5px solid #0d9488; padding-bottom: 2px; text-transform: lowercase; }
    h2::before { content: "> "; color: #0d9488; }
    p    { margin: 4px 0; }
    ul   { margin: 4px 0 10px 16px; padding: 0; list-style: none; }
    li   { margin: 2px 0; position: relative; padding-left: 14px; font-family: -apple-system, "Segoe UI", sans-serif; }
    li::before { content: ">"; color: #0d9488; position: absolute; left: 0;
                 font-family: ui-monospace, monospace; font-weight: 600; }
    a    { color: #0d9488; text-decoration: none; }
    strong { color: #0f172a; }
    em   { color: #475569; font-style: normal; }
  `,
  banner: `
    @page { size: A4; margin: 12mm; }
    body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
           max-width: 760px; margin: 0 auto; padding: 0 24px 16px;
           color: #111; line-height: 1.4; font-size: 12.5px; }
    h1   { background: #1E3A8A; color: #fff; margin: 0 -24px 12px;
           padding: 16px 24px 14px; font-size: 26px; font-weight: 700; letter-spacing: -0.01em; }
    h1 + p { color: #cbd5e1; background: #1E3A8A; margin: -12px -24px 14px;
             padding: 0 24px 12px; font-size: 11.5px; }
    h1 + p a { color: #cbd5e1; }
    h2   { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em;
           color: #1E3A8A; margin: 14px 0 4px;
           border-bottom: 1px solid #1E3A8A; padding-bottom: 2px; }
    p    { margin: 3px 0; }
    ul   { margin: 3px 0 8px 18px; padding: 0; }
    li   { margin: 1.5px 0; }
    a    { color: #1E3A8A; text-decoration: none; }
    strong { color: #000; }
    em   { color: #475569; font-style: normal; }
  `,
  mono: `
    @page { size: A4; margin: 12mm; }
    body { font-family: ui-monospace, "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace;
           max-width: 760px; margin: 18px auto; padding: 0 22px;
           color: #111; line-height: 1.35; font-size: 11.5px; }
    h1   { font-size: 22px; margin: 0 0 2px; font-weight: 700; color: #166534; }
    h1 + p { color: #4B5563; font-size: 11px; margin: 0 0 12px; }
    h2   { font-size: 11px; color: #166534; margin: 12px 0 3px;
           border-bottom: 0.5px solid #86EFAC; padding-bottom: 1px; }
    h2::before { content: "# "; color: #166534; }
    p    { margin: 2px 0; }
    ul   { margin: 2px 0 6px 16px; padding: 0; list-style: none; }
    li   { margin: 1px 0; position: relative; padding-left: 12px; }
    li::before { content: "#"; color: #166534; position: absolute; left: 0; font-weight: 600; }
    a    { color: #166534; text-decoration: none; }
    strong { color: #000; }
    em   { color: #4B5563; font-style: normal; }
  `,
  warm: `
    @page { size: A4; margin: 12mm; }
    body { font-family: "Georgia", "Times New Roman", serif;
           max-width: 740px; margin: 24px auto; padding: 0 26px;
           color: #1c1917; line-height: 1.45; font-size: 12.5px; }
    h1   { font-size: 28px; margin: 0 0 3px; font-weight: 700; color: #9F1239; letter-spacing: 0.005em; }
    h1 + p { color: #57534E; font-size: 11.5px; margin: 0 0 14px; font-style: italic; }
    h2   { font-size: 13px; font-style: italic; color: #9F1239;
           margin: 14px 0 4px; border-bottom: 1.4px solid #F4C2C2; padding-bottom: 2px; font-weight: 700; }
    p    { margin: 3px 0; }
    ul   { margin: 3px 0 8px 18px; padding: 0; }
    li   { margin: 2px 0; }
    li::marker { color: #9F1239; }
    a    { color: #9F1239; text-decoration: none; }
    strong { color: #1c1917; }
    em   { color: #57534E; font-style: italic; }
  `,
  neon: `
    @page { size: A4; margin: 12mm; }
    body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
           max-width: 760px; margin: 18px auto; padding: 0 22px;
           color: #0f172a; line-height: 1.38; font-size: 12px; }
    h1   { font-size: 26px; margin: 0 0 2px; font-weight: 800; letter-spacing: -0.01em;
           background: linear-gradient(90deg, #D946EF 0%, #06B6D4 100%);
           -webkit-background-clip: text; background-clip: text; color: transparent; }
    h1 + p { color: #475569; font-size: 11.5px; margin: 0 0 12px;
             padding-bottom: 6px; border-bottom: 1.4px solid #06B6D4; }
    h2   { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.18em;
           color: #D946EF; margin: 12px 0 3px; font-weight: 700;
           border-bottom: 1.4px solid #06B6D4; padding-bottom: 1px; }
    p    { margin: 2px 0; }
    ul   { margin: 2px 0 6px 16px; padding: 0; list-style: none; }
    li   { margin: 1.5px 0; position: relative; padding-left: 12px; }
    li::before { content: "●"; color: #06B6D4; position: absolute; left: 0; font-size: 9px; top: 3px; }
    a    { color: #D946EF; text-decoration: none; }
    strong { color: #0f172a; }
    em   { color: #475569; font-style: normal; font-weight: 500; }
  `,
  academic: `
    body { font-family: "Georgia", "Times New Roman", serif;
           max-width: 740px; margin: 50px auto; padding: 0 32px;
           color: #1a1a1a; line-height: 1.65; font-size: 13.5px; }
    h1   { font-size: 28px; margin: 0 0 4px; font-weight: 400; text-align: center; }
    h1 + p { color: #555; font-size: 12px; margin: 0 0 24px; text-align: center; font-style: italic; }
    h2   { font-size: 14px; margin: 22px 0 6px; font-weight: 700; color: #1a1a1a; }
    p    { margin: 6px 0; }
    ul   { margin: 6px 0 14px 22px; padding: 0; }
    li   { margin: 3px 0; }
    a    { color: #1a1a1a; text-decoration: underline; }
    strong { color: #1a1a1a; }
    em   { color: #555; font-style: italic; }
  `,
};

export function renderHtml(profile: Profile, minLevel = 3, template = "classic"): string {
  const tpl = TEMPLATE_CSS[template] ? template : "classic";
  const md = renderMarkdown(profile, minLevel);
  const body = mdToHtml(md);
  const name = profile.personal?.name || "CV";
  const css = TEMPLATE_CSS[tpl];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(name)} — CV</title>
<style>
${css}
  @media print { body { margin: 0; padding: 20px; max-width: none; } }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
