import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { aiText } from "./aiClient";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

// Stable short hash for description — used to skip re-extraction when
// scraper re-upserts the same posting and to invalidate when text changes.
function fastHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

const SYSTEM_PROMPT = `You are extracting hard requirements from a job posting.
Return STRICT JSON only — no prose, no markdown — in this exact shape:
{
  "languages": [{"code": "<ISO 639-1, lowercase>", "level": "A1|A2|B1|B2|C1|C2|native"}],
  "seniority": "intern|working-student|junior|mid|senior|any",
  "onsite_city": "<city if STRICTLY onsite is required, else null>",
  "remote_ok": true|false|null,
  "years_min": <integer or null>,
  "other": ["<short dealbreaker, max 6 words>", ...]
}

Rules:
- Only include a language if the posting REQUIRES it (e.g. "fluent German", "C1+", "verhandlungssicher", "muttersprachlich"). Skip "nice to have".
- "verhandlungssicher" / "fließend" / "fluent" => C1. "muttersprachlich" / "native" => native. "gute Kenntnisse" => B2. "Grundkenntnisse" => A2.
- onsite_city = city name ONLY if remote is explicitly excluded AND a specific city is required. Otherwise null.
- remote_ok: true if "remote" / "fully remote" / "work from anywhere" stated, false if "onsite only" / "no remote", null if unclear.
- seniority: pick the single best bucket. "Berufseinsteiger" / "Fresher" / "Graduate" => junior. "Werkstudent" => working-student. "Praktikum" / "Intern" => intern.
- years_min: integer years explicitly required (e.g. "3+ years"). null if not stated.
- other: short dealbreaker requirements that are not skills (e.g. "EU work permit", "valid driving license", "willing to travel 50%"). Max 4 items.
- Return JSON only — nothing else.`;

type ExtractedReqs = {
  languages: Array<{ code: string; level: string }>;
  seniority?: string;
  onsite_city?: string | null;
  remote_ok?: boolean | null;
  years_min?: number | null;
  other?: string[];
};

function parseModelJson(raw: string): ExtractedReqs | null {
  let stripped = raw.trim();
  if (stripped.startsWith("```")) {
    stripped = stripped.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  try {
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed === "object") return parsed as ExtractedReqs;
  } catch {}
  return null;
}

export const _patchReqs = internalMutation({
  args: {
    jobId: v.id("jobs_pool"),
    req_languages: v.array(v.object({ code: v.string(), level: v.string() })),
    req_seniority: v.optional(v.string()),
    req_onsite_city: v.optional(v.string()),
    req_remote_ok: v.optional(v.boolean()),
    req_years_min: v.optional(v.number()),
    req_other: v.optional(v.array(v.string())),
    req_extracted_at: v.number(),
    req_model: v.string(),
    req_description_hash: v.string(),
  },
  handler: async (ctx, args) => {
    const { jobId, ...patch } = args;
    await ctx.db.patch(jobId, patch);
    return { ok: true };
  },
});

export const _getJob = internalQuery({
  args: { jobId: v.id("jobs_pool") },
  handler: async (ctx, { jobId }) => {
    const j = await ctx.db.get(jobId);
    if (!j) return null;
    return {
      title: j.title,
      company: j.company ?? null,
      location: j.location ?? null,
      description: j.description ?? "",
      req_description_hash: j.req_description_hash ?? null,
    };
  },
});

// Extract requirements for one job. Idempotent — skips if hash matches.
// Used by the scraper hook and the backfill batch.
export const extractRequirements = internalAction({
  args: { jobId: v.id("jobs_pool"), force: v.optional(v.boolean()) },
  handler: async (
    ctx,
    { jobId, force },
  ): Promise<{ ok: boolean; skipped?: boolean; error?: string }> => {
    const job = await ctx.runQuery(internal.jobFit._getJob, { jobId });
    if (!job) return { ok: false, error: "job not found" };
    const desc = job.description || "";
    if (desc.length < 80) {
      return { ok: false, skipped: true, error: "description too short" };
    }
    const hash = fastHash(desc.slice(0, 8000));
    if (!force && job.req_description_hash === hash) {
      return { ok: true, skipped: true };
    }
    const userPrompt = `JOB TITLE: ${job.title}
COMPANY: ${job.company ?? "n/a"}
LOCATION: ${job.location ?? "n/a"}

DESCRIPTION:
${desc.slice(0, 6000)}`;
    const ai = await aiText(ctx, {
      system: SYSTEM_PROMPT,
      user: userPrompt,
      temperature: 0.1,
      maxTokens: 400,
      json: true,
    });
    if (!ai.text) return { ok: false, error: ai.error || "extractor failed" };
    const parsed = parseModelJson(ai.text);
    if (!parsed) return { ok: false, error: "non-JSON model response" };

    const langs = Array.isArray(parsed.languages)
      ? parsed.languages
          .filter(
            (l): l is { code: string; level: string } =>
              !!l && typeof l.code === "string" && typeof l.level === "string",
          )
          .map((l) => ({ code: l.code.toLowerCase().slice(0, 5), level: l.level }))
          .slice(0, 6)
      : [];
    const seniority =
      typeof parsed.seniority === "string" ? parsed.seniority.toLowerCase() : undefined;
    const onsiteCity =
      typeof parsed.onsite_city === "string" && parsed.onsite_city.trim()
        ? parsed.onsite_city.trim()
        : undefined;
    const remoteOk =
      typeof parsed.remote_ok === "boolean" ? parsed.remote_ok : undefined;
    const yearsMin =
      typeof parsed.years_min === "number" && parsed.years_min > 0
        ? Math.floor(parsed.years_min)
        : undefined;
    const other = Array.isArray(parsed.other)
      ? parsed.other.filter((x): x is string => typeof x === "string").slice(0, 4)
      : undefined;

    await ctx.runMutation(internal.jobFit._patchReqs, {
      jobId,
      req_languages: langs,
      req_seniority: seniority,
      req_onsite_city: onsiteCity,
      req_remote_ok: remoteOk,
      req_years_min: yearsMin,
      req_other: other,
      req_extracted_at: Date.now(),
      req_model: ai.provider ?? MODEL,
      req_description_hash: hash,
    });
    return { ok: true };
  },
});

// One-shot 2-line summary per job. Cached forever on the doc — re-run
// only via explicit force. Same Gemini-then-OpenRouter pattern used by
// chat.translate so a busy free tier doesn't break the feature.
const SUMMARY_PROMPT = `Summarize this job posting in exactly 2 short lines, max 220 chars total.
Line 1: role + main stack/domain.
Line 2: who they want (level, key reqs) + standout perk if any.
No bullets, no preamble, no quotes. Plain text only.`;

export const summarize = action({
  args: { jobId: v.id("jobs_pool"), force: v.optional(v.boolean()) },
  handler: async (
    ctx,
    { jobId, force },
  ): Promise<{ tldr: string; cached?: boolean; error?: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const job = await ctx.runQuery(internal.jobFit._getJobForSummary, { jobId });
    if (!job) return { tldr: "", error: "job not found" };
    if (!force && job.tldr) return { tldr: job.tldr, cached: true };
    const desc = (job.description || "").slice(0, 5000);
    if (desc.length < 60) return { tldr: "", error: "description too short" };
    const userPrompt = `TITLE: ${job.title}\nCOMPANY: ${job.company ?? "n/a"}\n\n${desc}`;
    const ai = await aiText(ctx, {
      system: SUMMARY_PROMPT,
      user: userPrompt,
      temperature: 0.2,
      maxTokens: 120,
    });
    const tldr = ai.text.slice(0, 280);
    if (!tldr) return { tldr: "", error: ai.error || "summarize failed" };
    await ctx.runMutation(internal.jobFit._patchTldr, { jobId, tldr });
    return { tldr };
  },
});

export const _getJobForSummary = internalQuery({
  args: { jobId: v.id("jobs_pool") },
  handler: async (ctx, { jobId }) => {
    const j = await ctx.db.get(jobId);
    if (!j) return null;
    return {
      title: j.title,
      company: j.company ?? null,
      description: j.description ?? "",
      tldr: j.tldr ?? null,
    };
  },
});

export const _patchTldr = internalMutation({
  args: { jobId: v.id("jobs_pool"), tldr: v.string() },
  handler: async (ctx, { jobId, tldr }) => {
    await ctx.db.patch(jobId, { tldr, tldr_at: Date.now() });
    return { ok: true };
  },
});

// Batch backfill — iterate jobs missing extraction. Caller invokes
// repeatedly until `processed === 0`.
export const _listMissing = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const all = await ctx.db
      .query("jobs_pool")
      .withIndex("by_posted_at")
      .order("desc")
      .take(2000);
    const missing = all
      .filter((j) => !j.req_extracted_at && (j.description ?? "").length >= 80)
      .slice(0, limit)
      .map((j) => j._id);
    return { ids: missing, total: missing.length };
  },
});

export const backfillBatch = action({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { limit },
  ): Promise<{ processed: number; ok: number; failed: number; errors: string[] }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const { ids } = await ctx.runQuery(internal.jobFit._listMissing, {
      limit: Math.min(limit ?? 20, 40),
    });
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const id of ids as Id<"jobs_pool">[]) {
      try {
        const res = await ctx.runAction(internal.jobFit.extractRequirements, {
          jobId: id,
        });
        if (res.ok) ok += 1;
        else {
          failed += 1;
          if (errors.length < 3 && res.error) errors.push(res.error);
        }
      } catch (e) {
        failed += 1;
        if (errors.length < 3) errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return { processed: ids.length, ok, failed, errors };
  },
});
