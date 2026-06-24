import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { resolveGeminiKey } from "./userSettings";

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
    const key = await resolveGeminiKey(ctx);
    if (!key) return { ok: false, error: "GEMINI_API_KEY not set" };
    const userPrompt = `JOB TITLE: ${job.title}
COMPANY: ${job.company ?? "n/a"}
LOCATION: ${job.location ?? "n/a"}

DESCRIPTION:
${desc.slice(0, 6000)}`;
    const r = await fetch(ENDPOINT(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + userPrompt }] },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 400,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      return { ok: false, error: `Gemini ${r.status}: ${body.slice(0, 200)}` };
    }
    const data = await r.json();
    const parts = (data.candidates ?? [{}])[0]?.content?.parts ?? [];
    let text = "";
    for (const p of parts as Array<Record<string, unknown>>) {
      if (typeof p.text === "string") text += p.text;
    }
    const parsed = parseModelJson(text);
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
      req_model: MODEL,
      req_description_hash: hash,
    });
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
