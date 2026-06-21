import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

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

export const save = mutation({
  args: { data: v.string() },
  handler: async (ctx, { data }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    try {
      JSON.parse(data);
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
    return JSON.parse(data);
  },
});
