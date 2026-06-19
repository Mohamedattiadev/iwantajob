import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const listBySkill = query({
  args: { skill: v.string() },
  handler: async (ctx, { skill }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("resources")
      .withIndex("by_user_and_skill", (q) => q.eq("userId", userId).eq("skill", skill))
      .collect();
  },
});

export const add = mutation({
  args: {
    skill: v.string(),
    title: v.string(),
    url: v.string(),
    kind: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const existing = await ctx.db
      .query("resources")
      .withIndex("by_user_and_skill", (q) => q.eq("userId", userId).eq("skill", args.skill))
      .collect();
    if (existing.some((r) => r.url === args.url)) return;
    await ctx.db.insert("resources", { userId, ...args });
  },
});

export const removeByUrl = mutation({
  args: { skill: v.string(), url: v.string() },
  handler: async (ctx, { skill, url }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const rows = await ctx.db
      .query("resources")
      .withIndex("by_user_and_skill", (q) => q.eq("userId", userId).eq("skill", skill))
      .collect();
    for (const r of rows) {
      if (r.url === url) await ctx.db.delete(r._id);
    }
  },
});
