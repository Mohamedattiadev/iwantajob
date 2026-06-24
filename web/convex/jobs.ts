import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

// Alias map: canonical skill name -> additional spellings that should
// count as a match. Lowercase. Word-boundary applied at match time.
const SKILL_ALIASES: Record<string, string[]> = {
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  "node.js": ["nodejs", "node"],
  python: ["py", "python3"],
  postgresql: ["postgres", "psql"],
  "c#": ["csharp", "c sharp", ".net"],
  "c++": ["cpp", "cplusplus"],
  golang: ["go"],
  kubernetes: ["k8s"],
  "react.js": ["react", "reactjs"],
  react: ["reactjs"],
  "vue.js": ["vue", "vuejs"],
  "next.js": ["next", "nextjs"],
  tensorflow: ["tf"],
};

// Build word-boundary regex for a needle. Handles `.` `+` `#` properly
// (e.g. "C++", "C#", "Node.js") since `\b` doesn't fire around them.
function needleRegex(raw: string): RegExp {
  const esc = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const left = /^[\w]/.test(raw) ? "(?<![\\w])" : "(?<![\\w.+#])";
  const right = /[\w]$/.test(raw) ? "(?![\\w])" : "(?![\\w.+#])";
  return new RegExp(`${left}${esc}${right}`, "i");
}

function skillMatches(text: string, skill: string): boolean {
  const low = skill.toLowerCase();
  if (needleRegex(low).test(text)) return true;
  const aliases = SKILL_ALIASES[low];
  if (!aliases) return false;
  return aliases.some((a) => needleRegex(a).test(text));
}

// Skill scoring: count how many of the user's skills appear in the
// job's text. Returns 0..100. Word-boundary + alias-aware.
function scoreJob(
  job: { title: string; description?: string },
  userSkills: Record<string, number>,
): number {
  if (!userSkills || Object.keys(userSkills).length === 0) return 50;
  const text = `${job.title} ${job.description ?? ""}`;
  let hits = 0;
  let weight = 0;
  for (const [skill, lvl] of Object.entries(userSkills)) {
    if (typeof lvl !== "number" || lvl < 1) continue;
    if (skillMatches(text, skill)) {
      hits += 1;
      weight += lvl;
    }
  }
  if (hits === 0) return 20;
  const base = Math.min(60, hits * 12);
  const lvlBonus = Math.min(40, weight * 4);
  return Math.min(100, base + lvlBonus);
}

// ---- Fit checker ----------------------------------------------------------

const LEVEL_RANK: Record<string, number> = {
  a1: 1, a2: 2, b1: 3, b2: 4, c1: 5, c2: 6, native: 7, fluent: 5,
};

const LANG_NAME_TO_CODE: Record<string, string> = {
  english: "en", englisch: "en",
  german: "de", deutsch: "de", germany: "de",
  french: "fr", französisch: "fr", francais: "fr",
  spanish: "es", spanisch: "es", espanol: "es",
  italian: "it", italienisch: "it",
  portuguese: "pt", portugiesisch: "pt",
  dutch: "nl", niederländisch: "nl",
  russian: "ru", russisch: "ru",
  chinese: "zh", mandarin: "zh",
  japanese: "ja", japanisch: "ja",
  arabic: "ar", arabisch: "ar",
  polish: "pl", turkish: "tr", swedish: "sv", danish: "da", norwegian: "no",
  finnish: "fi", greek: "el", hebrew: "he", korean: "ko", hindi: "hi",
};

function langToCode(name: string): string {
  const n = name.trim().toLowerCase();
  if (n.length === 2) return n;
  return LANG_NAME_TO_CODE[n] ?? n.slice(0, 2);
}

function levelRank(level: string): number {
  const k = level.trim().toLowerCase();
  return LEVEL_RANK[k] ?? 0;
}

const SENIORITY_RANK: Record<string, number> = {
  intern: 0, "working-student": 1, "working student": 1, werkstudent: 1,
  junior: 2, mid: 3, senior: 4, any: 0,
};

type FitProfile = {
  languages: Array<{ name: string; level: string }>;
  workTypes: string[];
  yearsExperience: number;
  currentCity: string;
  openToRelocation: boolean;
  openToRemote: boolean;
};

type JobReqs = {
  req_languages?: Array<{ code: string; level: string }>;
  req_seniority?: string;
  req_onsite_city?: string;
  req_remote_ok?: boolean;
  req_years_min?: number;
  req_other?: string[];
  req_extracted_at?: number;
};

export type FitResult = {
  has_reqs: boolean;
  fits: boolean;
  reasons: string[];
};

function computeFit(job: JobReqs, profile: FitProfile): FitResult {
  if (!job.req_extracted_at) return { has_reqs: false, fits: true, reasons: [] };
  const reasons: string[] = [];

  // Build user language lookup by code -> max rank.
  const userLangs = new Map<string, number>();
  for (const l of profile.languages) {
    const code = langToCode(l.name);
    const rank = levelRank(l.level);
    const prev = userLangs.get(code) ?? 0;
    if (rank > prev) userLangs.set(code, rank);
  }
  for (const req of job.req_languages ?? []) {
    const code = req.code.toLowerCase();
    const needed = levelRank(req.level);
    const have = userLangs.get(code) ?? 0;
    if (needed > have) {
      const haveLabel = have
        ? Object.entries(LEVEL_RANK).find(([, r]) => r === have)?.[0]?.toUpperCase() ?? "?"
        : null;
      reasons.push(
        `needs ${code.toUpperCase()} ${req.level.toUpperCase()}${haveLabel ? ` (you ${haveLabel})` : " (missing)"}`,
      );
    }
  }

  // Seniority — only block if user explicitly listed workTypes that exclude
  // this one. If workTypes empty, treat as no preference.
  if (job.req_seniority && profile.workTypes.length > 0) {
    const reqS = job.req_seniority.toLowerCase();
    const userWants = new Set(profile.workTypes.map((s) => s.toLowerCase()));
    if (!userWants.has(reqS) && reqS !== "any") {
      reasons.push(`role is ${reqS}, you target ${[...userWants].join("/")}`);
    }
  }

  // Onsite city — block if strict onsite city differs from user city AND
  // user not open to relocation.
  if (job.req_onsite_city && job.req_remote_ok === false) {
    const userCity = profile.currentCity.toLowerCase();
    const jobCity = job.req_onsite_city.toLowerCase();
    if (!profile.openToRelocation && userCity && !userCity.includes(jobCity) && !jobCity.includes(userCity)) {
      reasons.push(`onsite in ${job.req_onsite_city}`);
    }
  }

  // Years of experience.
  if (job.req_years_min != null && job.req_years_min > profile.yearsExperience) {
    reasons.push(`needs ${job.req_years_min}y exp (you ${profile.yearsExperience}y)`);
  }

  return { has_reqs: true, fits: reasons.length === 0, reasons };
}

function seniorityBucket(title: string): "junior" | "senior" | "unknown" {
  const t = title.toLowerCase();
  if (/\b(senior|sr\.?|staff|principal|lead|architect|head of|director|vp )\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|intern|graduate|entry[- ]level|trainee)\b/.test(t)) return "junior";
  return "unknown";
}

export const list = query({
  args: {
    q: v.optional(v.string()),
    source: v.optional(v.string()),
    skill: v.optional(v.string()),
    seniority: v.optional(v.string()),
    min_score: v.optional(v.number()),
    limit: v.optional(v.number()),
    // view: "all" excludes hidden, "saved" returns only saved,
    // "hidden" returns only hidden. Default "all".
    view: v.optional(v.union(v.literal("all"), v.literal("saved"), v.literal("hidden"))),
    hide_misfits: v.optional(v.boolean()),
    hide_skills: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    const view = args.view ?? "all";
    const hiddenSet = new Set<string>();
    const savedSet = new Set<string>();
    if (userId) {
      const actions = await ctx.db
        .query("job_actions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const a of actions) {
        if (a.action === "hidden") hiddenSet.add(a.job_external_id);
        else if (a.action === "saved") savedSet.add(a.job_external_id);
      }
    }
    const userSkills: Record<string, number> = {};
    const fitProfile: FitProfile = {
      languages: [],
      workTypes: [],
      yearsExperience: 0,
      currentCity: "",
      openToRelocation: false,
      openToRemote: true,
    };
    if (userId) {
      const profRows = await ctx.db
        .query("proficiency")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      if (profRows.length > 0) {
        for (const r of profRows) userSkills[r.skill] = r.level;
      }
      const profile = await ctx.db
        .query("profile")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (profile) {
        try {
          const p = JSON.parse(profile.data_json);
          if (profRows.length === 0) {
            Object.assign(userSkills, (p?.skills ?? {}) as Record<string, number>);
          }
          if (Array.isArray(p?.languages)) {
            fitProfile.languages = p.languages.filter(
              (l: { name?: unknown; level?: unknown }) =>
                typeof l?.name === "string" && typeof l?.level === "string",
            );
          }
          const personal = p?.personal ?? {};
          if (typeof personal.location === "string") {
            fitProfile.currentCity = personal.location;
          }
          if (Array.isArray(personal.workTypes)) {
            fitProfile.workTypes = personal.workTypes.filter(
              (x: unknown) => typeof x === "string",
            );
          }
          if (typeof personal.yearsExperience === "number") {
            fitProfile.yearsExperience = personal.yearsExperience;
          }
          if (typeof personal.openToRelocation === "boolean") {
            fitProfile.openToRelocation = personal.openToRelocation;
          }
          if (typeof personal.openToRemote === "boolean") {
            fitProfile.openToRemote = personal.openToRemote;
          }
        } catch { /* ignore */ }
      }
    }

    const limit = Math.min(args.limit ?? 100, 500);
    const minScore = args.min_score ?? 0;
    const q = (args.q ?? "").trim().toLowerCase();
    const wantSource = (args.source ?? "").trim();
    const wantSkill = (args.skill ?? "").trim().toLowerCase();
    const wantSeniority = (args.seniority ?? "any").trim();
    const hideSkills = (args.hide_skills ?? [])
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const rows = wantSource
      ? await ctx.db
          .query("jobs_pool")
          .withIndex("by_source", (qq) => qq.eq("source", wantSource))
          .order("desc")
          .take(2000)
      : await ctx.db
          .query("jobs_pool")
          .withIndex("by_posted_at")
          .order("desc")
          .take(2000);

    const out = [];
    for (const r of rows) {
      const rid = r._id as string;
      if (view === "all" && hiddenSet.has(rid)) continue;
      if (view === "saved" && !savedSet.has(rid)) continue;
      if (view === "hidden" && !hiddenSet.has(rid)) continue;
      const score = scoreJob(r, userSkills);
      if (score < minScore) continue;
      if (q) {
        const hay = `${r.title} ${r.company ?? ""} ${r.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (wantSkill) {
        const hay = `${r.title} ${r.description ?? ""}`;
        if (!skillMatches(hay, wantSkill)) continue;
      }
      if (hideSkills.length > 0) {
        const hay = `${r.title} ${r.description ?? ""}`;
        if (hideSkills.some((s) => skillMatches(hay, s))) continue;
      }
      if (wantSeniority && wantSeniority !== "any") {
        const bucket = seniorityBucket(r.title);
        if (wantSeniority === "junior_or_unknown") {
          if (bucket === "senior") continue;
        } else if (bucket !== wantSeniority) {
          continue;
        }
      }
      const titleDesc = `${r.title} ${r.description ?? ""}`;
      const matchedSkills: Array<{ skill: string; category: string; level: number }> = [];
      const missedUserSkills: Array<{ skill: string; level: number }> = [];
      for (const [sk, lvl] of Object.entries(userSkills)) {
        if (skillMatches(titleDesc, sk)) {
          matchedSkills.push({ skill: sk, category: "skill", level: lvl });
        } else if (typeof lvl === "number" && lvl >= 1) {
          missedUserSkills.push({ skill: sk, level: lvl });
        }
      }
      const fit = computeFit(r, fitProfile);
      if (args.hide_misfits && fit.has_reqs && !fit.fits) continue;
      out.push({
        id: r._id as string,
        source: r.source,
        source_url: r.source_url,
        title: r.title,
        company: r.company ?? null,
        location: r.location ?? null,
        remote: r.remote ?? false,
        posted_at: r.posted_at ? new Date(r.posted_at).toISOString() : null,
        seniority: seniorityBucket(r.title),
        salary_min: r.salary_min ?? null,
        salary_max: r.salary_max ?? null,
        currency: r.currency ?? null,
        skills: matchedSkills,
        missed_skills: missedUserSkills,
        description_excerpt: (r.description ?? "").slice(0, 240),
        score,
        fit_has_reqs: fit.has_reqs,
        fit_ok: fit.fits,
        fit_reasons: fit.reasons,
        req_languages: r.req_languages ?? null,
        req_seniority: r.req_seniority ?? null,
        req_onsite_city: r.req_onsite_city ?? null,
        req_years_min: r.req_years_min ?? null,
        req_other: r.req_other ?? null,
        tldr: r.tldr ?? null,
      });
      if (out.length >= limit) break;
    }
    out.sort((a, b) => b.score - a.score);
    const sources = Array.from(new Set(out.map((j) => j.source)));
    const skillFacets = Array.from(
      new Set(out.flatMap((j) => j.skills.map((s) => s.skill))),
    ).slice(0, 40);
    return {
      total: out.length,
      offset: 0,
      limit,
      items: out,
      facets: { sources, skills: skillFacets },
    };
  },
});

export const _getById = query({
  args: { id: v.id("jobs_pool") },
  handler: async (ctx, { id }) => {
    const j = await ctx.db.get(id);
    if (!j) return null;
    return {
      title: j.title,
      company: j.company ?? null,
      location: j.location ?? null,
      source: j.source,
      source_url: j.source_url,
      description: j.description ?? "",
      posted_at: j.posted_at ? new Date(j.posted_at).toISOString() : null,
    };
  },
});

const REAL_THRESHOLD = 50;

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    let userSkills: Record<string, number> = {};
    if (userId) {
      const profRows = await ctx.db
        .query("proficiency")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      if (profRows.length > 0) {
        for (const r of profRows) userSkills[r.skill] = r.level;
      } else {
        // Backfill read-path: proficiency empty but profile blob may have
        // skills. Use those so existing users aren't broken until their
        // next profile.save triggers the proficiency sync.
        const profile = await ctx.db
          .query("profile")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();
        if (profile) {
          try {
            const p = JSON.parse(profile.data_json);
            userSkills = (p?.skills ?? {}) as Record<string, number>;
          } catch {
            userSkills = {};
          }
        }
      }
    }
    const have = new Set(Object.keys(userSkills).map((s) => s.toLowerCase()));

    const sample = await ctx.db
      .query("jobs_pool")
      .withIndex("by_posted_at")
      .order("desc")
      .take(2000);

    const bySource: Record<string, number> = {};
    const bySeniority: Record<string, number> = {};
    const skillCounts: Record<string, number> = {};
    const skillOrig: Record<string, string> = {};
    let targetCount = 0;
    let realCount = 0;

    for (const j of sample) {
      bySource[j.source] = (bySource[j.source] ?? 0) + 1;
      const bucket = seniorityBucket(j.title);
      const senKey = bucket === "unknown" ? "unknown" : bucket;
      if (bucket !== "senior") {
        bySeniority[senKey] = (bySeniority[senKey] ?? 0) + 1;
        targetCount += 1;
        const score = scoreJob(j, userSkills);
        if (score >= REAL_THRESHOLD) {
          realCount += 1;
          const text = `${j.title} ${j.description ?? ""}`;
          for (const sk of Object.keys(userSkills)) {
            if (skillMatches(text, sk)) {
              const key = sk.toLowerCase();
              skillCounts[key] = (skillCounts[key] ?? 0) + 1;
              skillOrig[key] = sk;
            }
          }
        }
      }
    }

    const by_source = Object.entries(bySource)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const by_seniority = Object.entries(bySeniority)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const top_skills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([key, count]) => ({
        skill: skillOrig[key] ?? key,
        count,
        category: "skill",
        have: have.has(key),
      }));

    return {
      total: sample.length,
      target: targetCount,
      real: realCount,
      by_source,
      by_seniority,
      top_skills,
      generated_at: new Date().toISOString(),
    };
  },
});

// Internal upsert used by collectors. Dedupes on (source, source_id).
type CollectedJob = {
  source: string;
  source_id: string;
  source_url: string;
  title: string;
  company?: string;
  location?: string;
  remote?: boolean;
  posted_at?: number;
  description?: string;
  employment_type?: string;
  salary_min?: number;
  salary_max?: number;
  currency?: string;
};

export const _upsertBatch = internalMutation({
  args: {
    jobs: v.array(
      v.object({
        source: v.string(),
        source_id: v.string(),
        source_url: v.string(),
        title: v.string(),
        company: v.optional(v.string()),
        location: v.optional(v.string()),
        remote: v.optional(v.boolean()),
        posted_at: v.optional(v.number()),
        description: v.optional(v.string()),
        employment_type: v.optional(v.string()),
        salary_min: v.optional(v.number()),
        salary_max: v.optional(v.number()),
        currency: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { jobs }) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    // Cap per-batch extractor scheduling so a 200-job upsert doesn't push
    // 200 LLM calls into the queue at once. Excess get picked up by the
    // backfill action later.
    const SCHEDULE_CAP = 20;
    let scheduled = 0;
    for (const j of jobs) {
      const existing = await ctx.db
        .query("jobs_pool")
        .withIndex("by_source_and_id", (q) =>
          q.eq("source", j.source).eq("source_id", j.source_id),
        )
        .first();
      let jobId: Id<"jobs_pool">;
      let needsExtract = false;
      if (existing) {
        await ctx.db.patch(existing._id, { ...j, fetched_at: now });
        updated += 1;
        jobId = existing._id;
        if (!existing.req_extracted_at && (j.description ?? "").length >= 80) {
          needsExtract = true;
        }
      } else {
        jobId = await ctx.db.insert("jobs_pool", { ...j, fetched_at: now });
        inserted += 1;
        if ((j.description ?? "").length >= 80) needsExtract = true;
      }
      if (needsExtract && scheduled < SCHEDULE_CAP) {
        // Stagger ~3s apart to stay under Gemini free-tier RPM.
        await ctx.scheduler.runAfter(
          scheduled * 3000,
          internal.jobFit.extractRequirements,
          { jobId },
        );
        scheduled += 1;
      }
    }
    return { inserted, updated, scheduled };
  },
});

// Ops helper — wipe the entire pool. Behind an auth check.
export const wipePool = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const all = await ctx.db.query("jobs_pool").collect();
    for (const r of all) await ctx.db.delete(r._id);
    return { deleted: all.length };
  },
});

// ---- Collectors (V8 runtime; use fetch + minimal HTML strip). ----

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function collectRemoteOK(): Promise<CollectedJob[]> {
  const r = await fetch("https://remoteok.com/api", {
    headers: { "User-Agent": "Mozilla/5.0 (iwantajob/1.0)" },
  });
  if (!r.ok) return [];
  const data = (await r.json()) as Array<Record<string, unknown>>;
  const out: CollectedJob[] = [];
  for (const it of data) {
    if (!it || typeof it !== "object" || it.id == null) continue;
    let posted: number | undefined;
    if (it.date && typeof it.date === "string") {
      const t = Date.parse(it.date);
      if (!Number.isNaN(t)) posted = t;
    } else if (it.epoch != null) {
      const ep = Number(it.epoch);
      if (Number.isFinite(ep)) posted = ep * 1000;
    }
    const tags = Array.isArray(it.tags) ? (it.tags as unknown[]).map(String).join(" ") : "";
    let desc = stripHtml(String(it.description ?? ""));
    if (tags) desc = `${desc}\n\nTags: ${tags}`;
    out.push({
      source: "remoteok",
      source_id: String(it.id),
      source_url:
        (it.url as string) || `https://remoteok.com/remote-jobs/${it.id}`,
      title: String(it.position ?? "(no title)"),
      company: it.company ? String(it.company) : undefined,
      location: (it.location as string) || "Remote",
      remote: true,
      posted_at: posted,
      description: desc,
      salary_min: it.salary_min ? Number(it.salary_min) : undefined,
      salary_max: it.salary_max ? Number(it.salary_max) : undefined,
      currency: it.salary_min ? "USD" : undefined,
    });
  }
  return out;
}

async function collectArbeitnow(): Promise<CollectedJob[]> {
  const out: CollectedJob[] = [];
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(
      `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
    );
    if (!r.ok) break;
    const payload = (await r.json()) as { data?: Array<Record<string, unknown>> };
    const data = payload.data ?? [];
    if (data.length === 0) break;
    for (const it of data) {
      const slug = (it.slug as string) || (it.url as string);
      if (!slug) continue;
      let posted: number | undefined;
      if (it.created_at != null) {
        const ep = Number(it.created_at);
        if (Number.isFinite(ep)) posted = ep * 1000;
      }
      const tags = Array.isArray(it.tags)
        ? (it.tags as unknown[]).map(String).join(" ")
        : "";
      let desc = stripHtml(String(it.description ?? ""));
      if (tags) desc = `${desc}\n\nTags: ${tags}`;
      out.push({
        source: "arbeitnow",
        source_id: String(slug),
        source_url: (it.url as string) || `https://arbeitnow.com/jobs/${slug}`,
        title: String(it.title ?? "(no title)"),
        company: it.company_name ? String(it.company_name) : undefined,
        location: it.location ? String(it.location) : undefined,
        remote: Boolean(it.remote),
        posted_at: posted,
        description: desc,
        employment_type: Array.isArray(it.job_types)
          ? (it.job_types as unknown[]).map(String).join(",")
          : undefined,
      });
    }
  }
  return out;
}

async function collectHN(): Promise<CollectedJob[]> {
  const storyR = await fetch(
    "https://hn.algolia.com/api/v1/search?query=Ask+HN+Who+is+hiring&tags=story&hitsPerPage=5",
  );
  if (!storyR.ok) return [];
  const stories = (await storyR.json()) as { hits?: Array<Record<string, unknown>> };
  const story = (stories.hits ?? []).find(
    (h) =>
      String(h.title ?? "").toLowerCase().includes("who is hiring") &&
      h.author === "whoishiring",
  );
  if (!story) return [];
  const sid = String(story.objectID);
  const commentsR = await fetch(
    `https://hn.algolia.com/api/v1/search?tags=comment,story_${sid}&hitsPerPage=1000`,
  );
  if (!commentsR.ok) return [];
  const cdata = (await commentsR.json()) as { hits?: Array<Record<string, unknown>> };
  const out: CollectedJob[] = [];
  for (const h of cdata.hits ?? []) {
    const text = stripHtml(String(h.comment_text ?? ""));
    if (text.length < 80) continue;
    const head = text.split(".")[0].slice(0, 200);
    const company =
      head.includes("|") ? head.split("|")[0].trim().slice(0, 100) : undefined;
    let posted: number | undefined;
    if (h.created_at) {
      const t = Date.parse(String(h.created_at).replace("Z", "+00:00"));
      if (!Number.isNaN(t)) posted = t;
    }
    out.push({
      source: "hn",
      source_id: String(h.objectID),
      source_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      title: head,
      company,
      remote: text.toLowerCase().includes("remote"),
      posted_at: posted,
      description: text,
    });
  }
  return out;
}

const WWR_FEEDS = [
  "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
];

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function pickTag(item: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = item.match(re);
  return m ? decodeXmlEntities(m[1]).trim() : "";
}

async function collectWeWantRecruits(): Promise<CollectedJob[]> {
  const out: CollectedJob[] = [];
  const seen = new Set<string>();
  for (const url of WWR_FEEDS) {
    let xml = "";
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (iwantajob/1.0)" },
      });
      if (!r.ok) continue;
      xml = await r.text();
    } catch {
      continue;
    }
    const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
    for (const item of items) {
      const guid = pickTag(item, "guid") || pickTag(item, "link");
      if (!guid || seen.has(guid)) continue;
      seen.add(guid);
      const link = pickTag(item, "link") || guid;
      let title = pickTag(item, "title");
      let company: string | undefined;
      if (title.includes(":")) {
        const [head, ...rest] = title.split(":");
        company = head.trim() || undefined;
        const tail = rest.join(":").trim();
        if (tail) title = tail;
      }
      const pub = pickTag(item, "pubDate");
      let posted: number | undefined;
      if (pub) {
        const t = Date.parse(pub);
        if (!Number.isNaN(t)) posted = t;
      }
      const desc = stripHtml(pickTag(item, "description"));
      out.push({
        source: "wwr",
        source_id: guid,
        source_url: link,
        title,
        company,
        location: "Remote",
        remote: true,
        posted_at: posted,
        description: desc,
      });
    }
  }
  return out;
}

export const runAllCollectors = action({
  args: {},
  handler: async (ctx) => {
    const results: Record<string, { collected: number; error?: string }> = {};
    const collectors: Array<[string, () => Promise<CollectedJob[]>]> = [
      ["remoteok", collectRemoteOK],
      ["arbeitnow", collectArbeitnow],
      ["hn", collectHN],
      ["wwr", collectWeWantRecruits],
    ];
    for (const [name, fn] of collectors) {
      try {
        const jobs = await fn();
        if (jobs.length > 0) {
          // Convex mutations have arg-size limits; batch in chunks.
          for (let i = 0; i < jobs.length; i += 200) {
            await ctx.runMutation(internal.jobs._upsertBatch, {
              jobs: jobs.slice(i, i + 200),
            });
          }
        }
        results[name] = { collected: jobs.length };
      } catch (e) {
        results[name] = {
          collected: 0,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
    return results;
  },
});
