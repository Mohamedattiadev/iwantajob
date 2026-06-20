import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("sketches")
      .withIndex("by_user_and_slug", (q) => q.eq("userId", userId).eq("slug", slug))
      .first();
    return row ? { data_json: row.data_json, updated_at: row.updated_at } : null;
  },
});

export const save = mutation({
  args: { slug: v.string(), data: v.string() },
  handler: async (ctx, { slug, data }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const existing = await ctx.db
      .query("sketches")
      .withIndex("by_user_and_slug", (q) => q.eq("userId", userId).eq("slug", slug))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { data_json: data, updated_at: now });
    } else {
      await ctx.db.insert("sketches", { userId, slug, data_json: data, updated_at: now });
    }
    return { ok: true, bytes: data.length };
  },
});
