import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

// Skill scoring: count how many of the user's skills appear in the
// job's text. Returns 0..100. Cheap, deterministic, runs at read time.
function scoreJob(
  job: { title: string; description?: string },
  userSkills: Record<string, number>,
): number {
  if (!userSkills || Object.keys(userSkills).length === 0) return 50;
  const text = `${job.title} ${job.description ?? ""}`.toLowerCase();
  let hits = 0;
  let weight = 0;
  for (const [skill, lvl] of Object.entries(userSkills)) {
    if (typeof lvl !== "number" || lvl < 1) continue;
    const needle = skill.toLowerCase();
    if (text.includes(needle)) {
      hits += 1;
      weight += lvl;
    }
  }
  if (hits === 0) return 20;
  const base = Math.min(60, hits * 12);
  const lvlBonus = Math.min(40, weight * 4);
  return Math.min(100, base + lvlBonus);
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const profile = userId
      ? await ctx.db
          .query("profile")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first()
      : null;
    let userSkills: Record<string, number> = {};
    if (profile) {
      try {
        const p = JSON.parse(profile.data_json);
        userSkills = (p?.skills ?? {}) as Record<string, number>;
      } catch {
        userSkills = {};
      }
    }

    const limit = Math.min(args.limit ?? 100, 500);
    const minScore = args.min_score ?? 0;
    const q = (args.q ?? "").trim().toLowerCase();
    const wantSource = (args.source ?? "").trim();
    const wantSkill = (args.skill ?? "").trim().toLowerCase();
    const wantSeniority = (args.seniority ?? "any").trim();

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
      const score = scoreJob(r, userSkills);
      if (score < minScore) continue;
      if (q) {
        const hay = `${r.title} ${r.company ?? ""} ${r.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (wantSkill) {
        const hay = `${r.title} ${r.description ?? ""}`.toLowerCase();
        if (!hay.includes(wantSkill)) continue;
      }
      if (wantSeniority && wantSeniority !== "any") {
        const bucket = seniorityBucket(r.title);
        if (wantSeniority === "junior_or_unknown") {
          if (bucket === "senior") continue;
        } else if (bucket !== wantSeniority) {
          continue;
        }
      }
      const titleDesc = `${r.title} ${r.description ?? ""}`.toLowerCase();
      const matchedSkills: Array<{ skill: string; category: string }> = [];
      for (const sk of Object.keys(userSkills)) {
        if (titleDesc.includes(sk.toLowerCase())) {
          matchedSkills.push({ skill: sk, category: "skill" });
        }
      }
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
        description_excerpt: (r.description ?? "").slice(0, 240),
        score,
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

export const stats = query({
  args: {},
  handler: async (ctx) => {
    // Cheap totals — used for dashboard header.
    const sample = await ctx.db.query("jobs_pool").take(2000);
    const bySource: Record<string, number> = {};
    for (const j of sample) bySource[j.source] = (bySource[j.source] ?? 0) + 1;
    return { total: sample.length, by_source: bySource };
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
    for (const j of jobs) {
      const existing = await ctx.db
        .query("jobs_pool")
        .withIndex("by_source_and_id", (q) =>
          q.eq("source", j.source).eq("source_id", j.source_id),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { ...j, fetched_at: now });
        updated += 1;
      } else {
        await ctx.db.insert("jobs_pool", { ...j, fetched_at: now });
        inserted += 1;
      }
    }
    return { inserted, updated };
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

async function collectWeWantRecruits(): Promise<CollectedJob[]> {
  // WeWantRecruits has no public JSON API; HTML scrape is fragile and
  // out of scope for the V8 runtime. Stubbed out — port later when we
  // either move to a Node action or find an alternate JSON feed.
  return [];
}

export const runAllCollectors = action({
  args: {},
  handler: async (ctx) => {
    const results: Record<string, { collected: number; error?: string }> = {};
    const collectors: Array<[string, () => Promise<CollectedJob[]>]> = [
      ["remoteok", collectRemoteOK],
      ["arbeitnow", collectArbeitnow],
      ["hn", collectHN],
      ["wewantrecruits", collectWeWantRecruits],
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
