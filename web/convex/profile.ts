import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

const DEFAULT_PROFILE = {
  personal: { name: "", email: "", phone: "", location: "", links: {}, summary: "" },
  education: [] as unknown[],
  experience: [] as unknown[],
  projects: [] as unknown[],
  skills: {} as Record<string, number>,
  languages: [] as unknown[],
  certifications: [] as unknown[],
};

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return DEFAULT_PROFILE;
    const row = await ctx.db
      .query("profile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!row) return DEFAULT_PROFILE;
    try {
      return JSON.parse(row.data_json);
    } catch {
      return DEFAULT_PROFILE;
    }
  },
});

export const getOnboarded = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("profile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return !!row?.onboarded;
  },
});

export const setOnboarded = mutation({
  args: { value: v.boolean() },
  handler: async (ctx, { value }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const existing = await ctx.db
      .query("profile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { onboarded: value, updated_at: Date.now() });
    } else {
      await ctx.db.insert("profile", {
        userId,
        data_json: JSON.stringify(DEFAULT_PROFILE),
        updated_at: Date.now(),
        onboarded: value,
      });
    }
    return value;
  },
});

// Sync skills from profile blob into proficiency table so reads
// (jobs scoring, learn page) don't depend on the JSON document.
// Preserves any per-skill level already in proficiency (don't clobber
// user-set 0–5 ratings) and inserts missing ones at the parsed level.
async function syncSkillsToProficiency(
  ctx: MutationCtx,
  userId: Id<"users">,
  skills: Record<string, unknown> | undefined | null,
): Promise<void> {
  if (!skills || typeof skills !== "object") return;
  const rows = await ctx.db
    .query("proficiency")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const existing = new Map(rows.map((r) => [r.skill, r]));
  for (const [name, lvlRaw] of Object.entries(skills)) {
    const skill = String(name).trim();
    if (!skill) continue;
    const lvl = typeof lvlRaw === "number" && Number.isFinite(lvlRaw)
      ? Math.max(0, Math.min(5, Math.round(lvlRaw)))
      : 3;
    const row = existing.get(skill);
    if (row) {
      // Keep user's chosen level; only insert if missing.
      continue;
    }
    await ctx.db.insert("proficiency", { userId, skill, level: lvl });
  }
}

export const save = mutation({
  args: { data: v.string() },
  handler: async (ctx, { data }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    let parsed: { skills?: Record<string, unknown> };
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error("INVALID_JSON");
    }
    const existing = await ctx.db
      .query("profile")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { data_json: data, updated_at: Date.now() });
    } else {
      await ctx.db.insert("profile", { userId, data_json: data, updated_at: Date.now() });
    }
    await syncSkillsToProficiency(ctx, userId, parsed.skills);
    return parsed;
  },
});
