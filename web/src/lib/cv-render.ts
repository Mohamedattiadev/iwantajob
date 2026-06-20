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

function splitBullets(raw: string): { header: string; bullets: string[] } {
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
