"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(\+?\d[\d\s\-().]{7,}\d)/;
const GITHUB_RE = /github\.com\/([A-Za-z0-9_-]+)/i;
const LINKEDIN_RE = /linkedin\.com\/in\/([A-Za-z0-9_-]+)/i;
const PORTFOLIO_HOSTS = /\b(?:vercel\.app|netlify\.app|github\.io|notion\.site|portfolio)\b/i;

const SECTION_KEYS = [
  "education",
  "experience",
  "work experience",
  "professional experience",
  "academic projects",
  "projects",
  "technical skills",
  "skills",
  "certifications",
  "certifications & additional work",
  "languages",
  "hobbies",
  "personal information",
];

function sectionBlocks(lines: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let current: string | null = null;
  for (const l of lines) {
    const low = l.trim().toLowerCase().replace(/:$/, "");
    if (SECTION_KEYS.includes(low)) {
      current = normalizeSection(low);
      out[current] = out[current] ?? [];
      continue;
    }
    if (current) out[current].push(l);
  }
  return out;
}

function normalizeSection(key: string): string {
  if (key === "work experience" || key === "professional experience") return "experience";
  if (key === "academic projects") return "projects";
  if (key === "technical skills") return "skills";
  if (key === "certifications & additional work") return "certifications";
  return key;
}

async function extractPdfText(buf: Buffer): Promise<string> {
  // unpdf is built for serverless/edge — no DOMMatrix, no canvas, just text.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(doc, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : (text ?? "");
}

async function extractDocxText(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const r = await mammoth.extractRawText({ buffer: buf });
  return r.value ?? "";
}

type GeminiProfile = {
  personal?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    summary?: string;
    links?: { github?: string; linkedin?: string; portfolio?: string };
  };
  skills?: string[];
  experience?: Array<{ raw?: string; role?: string; company?: string; start?: string; end?: string; bullets?: string[] }>;
  projects?: Array<{ raw?: string; name?: string; bullets?: string[] }>;
  education?: Array<{ raw?: string; degree?: string; school?: string; start?: string; end?: string; gpa?: string }>;
  languages?: Array<{ name?: string; level?: string }>;
  certifications?: Array<{ name?: string; issuer?: string; year?: string } | string>;
};

async function geminiExtractProfile(text: string): Promise<GeminiProfile> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return {};
  const trimmed = text.length > 24000 ? text.slice(0, 24000) : text;
  const prompt = `Extract a CV / resume into STRICT JSON. PDF text was flattened to one line so use semantic cues (section keywords, capitalized headings, bullet markers like ● • -) to split. Return ONLY this shape:

{
  "personal": {"name":"", "email":"", "phone":"", "location":"", "summary":"", "links":{"github":"", "linkedin":"", "portfolio":""}},
  "skills": ["<canonical name>", ...],
  "experience": [{"raw": "<one entry as single string with bullets joined by ● >"}],
  "projects":   [{"raw": "<same>"}],
  "education":  [{"raw": "<same>"}],
  "languages":  [{"name":"", "level":""}],
  "certifications": ["<one cert per item>"]
}

Rules:
- Use canonical skill names (e.g. "JavaScript" not "js", "Node.js" not "nodejs", "PostgreSQL" not "postgres"). Include languages, frameworks, libraries, databases, cloud, devops, AI/ML, methodologies. Exclude soft skills.
- For experience/projects/education entries, emit one object per role/project/school. Put the headline first, then ● bullets joined by " ● ". Example: "Engineer at Acme 2024-present ● built X ● fixed Y".
- Preserve the candidate's wording. Don't paraphrase.
- If a field is missing, return "" (not null). If a section has no entries, return [].
- Phone may have multiple numbers — keep them in one string separated by " / ".
- Max 60 skills, 10 experience, 10 projects, 10 education, 10 languages, 20 certifications.

CV TEXT:
${trimmed}`;
  const r = await fetch(ENDPOINT(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4000,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!r.ok) return {};
  const data = await r.json();
  const parts = (data.candidates ?? [{}])[0]?.content?.parts ?? [];
  let raw = "";
  for (const p of parts as Array<Record<string, unknown>>) {
    if (typeof p.text === "string") raw += p.text;
  }
  raw = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(raw) as GeminiProfile;
  } catch {
    return {};
  }
}

function parseFromText(text: string): {
  personal: Record<string, unknown>;
  education: Array<{ raw: string }>;
  experience: Array<{ raw: string }>;
  projects: Array<{ raw: string }>;
  languages: Array<{ name: string; level: string }>;
} {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const blob = lines.join("\n");

  const email = EMAIL_RE.exec(blob);
  const phone = PHONE_RE.exec(blob);
  const gh = GITHUB_RE.exec(blob);
  const li = LINKEDIN_RE.exec(blob);
  const portfolioMatch = blob.match(/https?:\/\/[^\s)]+/g)?.find(
    (u) => PORTFOLIO_HOSTS.test(u) && !/github\.com|linkedin\.com/i.test(u),
  );

  let name = "";
  for (const l of lines.slice(0, 5)) {
    if (EMAIL_RE.test(l) || PHONE_RE.test(l)) continue;
    const tokens = l.split(/\s+/);
    if (tokens.length >= 2 && tokens.length <= 6 && /^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$/.test(l)) {
      name = l;
      break;
    }
  }

  const sections = sectionBlocks(lines);
  const toRaw = (xs: string[] | undefined) => (xs ?? []).map((raw) => ({ raw }));

  const languages: Array<{ name: string; level: string }> = [];
  for (const line of sections.languages ?? []) {
    const m = line.match(/^[•\-*]?\s*([A-Za-z]+)\s*[:\-]\s*(.+)$/);
    if (m) languages.push({ name: m[1].trim(), level: m[2].trim() });
    else languages.push({ name: line, level: "" });
  }

  return {
    personal: {
      name,
      email: email?.[0] ?? "",
      phone: phone?.[0] ?? "",
      location: "",
      links: {
        github: gh ? `https://github.com/${gh[1]}` : "",
        linkedin: li ? `https://linkedin.com/in/${li[1]}` : "",
        portfolio: portfolioMatch ?? "",
      },
      summary: "",
    },
    education: toRaw(sections.education),
    experience: toRaw(sections.experience),
    projects: toRaw(sections.projects),
    languages,
  };
}

type Profile = {
  personal?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    summary?: string;
    links?: Record<string, string>;
  };
  education?: unknown[];
  experience?: unknown[];
  projects?: unknown[];
  skills?: Record<string, number>;
  languages?: unknown[];
  certifications?: unknown[];
};

function mergeProfile(
  current: Profile,
  regexParsed: ReturnType<typeof parseFromText>,
  gemini: GeminiProfile,
): Profile {
  const merged: Profile = { ...current };

  // ---- personal: gemini wins, regex backstops, current preserved if set ----
  const curPers = (current.personal ?? {}) as Record<string, unknown>;
  const regexPers = regexParsed.personal as Record<string, unknown>;
  const gemPers = (gemini.personal ?? {}) as Record<string, unknown>;
  const nextPers: Record<string, unknown> = { ...curPers };
  for (const k of ["name", "email", "phone", "location", "summary"]) {
    if (curPers[k]) continue;
    const v = (gemPers[k] as string) || (regexPers[k] as string) || "";
    if (v) nextPers[k] = v;
  }
  const curLinks = (curPers.links ?? {}) as Record<string, string>;
  const gemLinks = ((gemPers.links ?? {}) as Record<string, string>);
  const regexLinks = (regexPers.links ?? {}) as Record<string, string>;
  const nextLinks: Record<string, string> = { ...curLinks };
  for (const lk of ["github", "linkedin", "portfolio"]) {
    if (curLinks[lk]) continue;
    const v = gemLinks[lk] || regexLinks[lk] || "";
    if (v) nextLinks[lk] = v;
  }
  nextPers.links = nextLinks;
  merged.personal = nextPers as Profile["personal"];

  // ---- arrays: adopt gemini if current empty (else preserve user edits) ----
  const adopt = (k: "experience" | "projects" | "education" | "languages", gem: unknown[] | undefined) => {
    const cur = (current[k] ?? []) as unknown[];
    if (cur.length > 0) return;
    if (gem && gem.length > 0) merged[k] = gem as Profile[typeof k];
    else if (k !== "languages") {
      const regex = (regexParsed as unknown as Record<string, unknown[]>)[k];
      if (regex && regex.length > 0) merged[k] = regex as Profile[typeof k];
    }
  };
  adopt("experience", gemini.experience);
  adopt("projects", gemini.projects);
  adopt("education", gemini.education);
  adopt("languages", gemini.languages);

  // certifications: gemini-only (regex parser doesn't extract them)
  const curCerts = (current.certifications ?? []) as unknown[];
  if (curCerts.length === 0 && gemini.certifications && gemini.certifications.length > 0) {
    merged.certifications = gemini.certifications as Profile["certifications"];
  }

  // ---- skills: merge, default new ones to level 3 ----
  const curSkills = (current.skills ?? {}) as Record<string, number>;
  const nextSkills: Record<string, number> = { ...curSkills };
  for (const s of gemini.skills ?? []) {
    const name = String(s).trim();
    if (!name) continue;
    if ((nextSkills[name] ?? 0) < 3) nextSkills[name] = 3;
  }
  merged.skills = nextSkills;

  return merged;
}

export const upload = action({
  args: { filename: v.string(), data: v.bytes() },
  handler: async (
    ctx,
    { filename, data },
  ): Promise<{ profile: Profile; meta: { parsed_at: string; raw_text_chars: number; skills_detected: number } }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");

    const buf = Buffer.from(data);
    if (buf.length === 0) throw new Error("empty upload");

    const lower = filename.toLowerCase();
    const isPdf = lower.endsWith(".pdf") || buf.subarray(0, 4).toString("ascii") === "%PDF";
    const isDocx = lower.endsWith(".docx") || buf.subarray(0, 2).toString("ascii") === "PK";

    let text = "";
    if (isPdf) text = await extractPdfText(buf);
    else if (isDocx) text = await extractDocxText(buf);
    else text = buf.toString("utf-8");

    if (!text.trim()) throw new Error("could not extract text from upload");

    const parsed = parseFromText(text);
    const gemini = await geminiExtractProfile(text);

    const current = (await ctx.runQuery(api.profile.get)) as Profile;
    const merged = mergeProfile(current, parsed, gemini);
    await ctx.runMutation(api.profile.save, { data: JSON.stringify(merged) });

    return {
      profile: merged,
      meta: {
        parsed_at: new Date().toISOString(),
        raw_text_chars: text.length,
        skills_detected: (gemini.skills ?? []).length,
      },
    };
  },
});
