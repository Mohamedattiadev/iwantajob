import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("proficiency")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const setLevel = mutation({
  args: { skill: v.string(), level: v.number() },
  handler: async (ctx, { skill, level }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const existing = await ctx.db
      .query("proficiency")
      .withIndex("by_user_and_skill", (q) => q.eq("userId", userId).eq("skill", skill))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { level });
    } else {
      await ctx.db.insert("proficiency", { userId, skill, level });
    }
  },
});

export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const rows = await ctx.db
      .query("proficiency")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
  },
});
