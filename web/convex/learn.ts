import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { SKILLS, extractSkills } from "./skills";

const REAL_THRESHOLD = 50;
const SAMPLE_SIZE = 2000;

function seniorityBucket(title: string): "junior" | "mid" | "senior" | "intern" | "unknown" {
  const t = (title || "").toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return "intern";
  if (/\b(senior|sr\.?|lead|staff|principal)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|entry[- ]level|graduate|new grad)\b/.test(t)) return "junior";
  if (/\bmid[- ]level\b/.test(t)) return "mid";
  return "unknown";
}

function scoreJob(j: { title: string; description?: string }, userSkills: Record<string, number>): number {
  const text = `${j.title} ${j.description ?? ""}`.toLowerCase();
  let score = 0;
  for (const sk of Object.keys(userSkills)) {
    if (text.includes(sk.toLowerCase())) score += 10;
  }
  return Math.min(100, score);
}

export const gaps = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    let userSkills: Record<string, number> = {};
    if (userId) {
      const row = await ctx.db
        .query("profile")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (row) {
        try {
          const p = JSON.parse(row.data_json) as { skills?: Record<string, number> };
          userSkills = p.skills ?? {};
        } catch {
          /* empty profile is fine */
        }
      }
    }
    const knownLower = new Set(Object.keys(userSkills).map((s) => s.toLowerCase()));

    const sample = await ctx.db
      .query("jobs_pool")
      .withIndex("by_posted_at")
      .order("desc")
      .take(SAMPLE_SIZE);

    // Junior-or-unknown jobs. If user has rated skills, narrow by score;
    // otherwise show full pool so first-session users still see gaps.
    const hasSkills = Object.keys(userSkills).length > 0;
    const real: typeof sample = [];
    for (const j of sample) {
      const b = seniorityBucket(j.title);
      if (b === "senior" || b === "mid") continue;
      if (hasSkills && scoreJob(j, userSkills) < REAL_THRESHOLD) continue;
      real.push(j);
    }

    // Skill frequency across the relevant job pool using the canonical
    // SKILLS dictionary (so we surface market terms the user doesn't even
    // know to look for).
    const counts = new Map<string, { count: number; category: string }>();
    for (const j of real) {
      const text = `${j.title} ${j.description ?? ""}`;
      const hit = extractSkills(text);
      for (const { skill, category } of hit) {
        const cur = counts.get(skill);
        if (cur) cur.count += 1;
        else counts.set(skill, { count: 1, category });
      }
    }

    const total_real = Math.max(1, real.length);
    type Row = { skill: string; count: number; pct: number; category: string };
    const rows: Row[] = Array.from(counts.entries())
      .map(([skill, { count, category }]) => ({
        skill,
        count,
        pct: Math.round((1000 * count) / total_real) / 10,
        category,
      }))
      .sort((a, b) => b.count - a.count);

    const gaps: Row[] = [];
    const have: Row[] = [];
    for (const r of rows) {
      if (knownLower.has(r.skill.toLowerCase())) have.push(r);
      else gaps.push(r);
    }

    const by_category: Record<string, Row[]> = {};
    for (const g of gaps) {
      (by_category[g.category] ??= []).push(g);
    }

    return {
      total_real: real.length,
      gaps: gaps.slice(0, 30),
      have,
      by_category,
      // Echo the dictionary size so the client can show "X skills tracked".
      tracked_skills: SKILLS.length,
    };
  },
});
