import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("plans")
      .withIndex("by_user_and_order", (q) => q.eq("userId", userId))
      .collect();
    return rows.sort((a, b) => a.order - b.order);
  },
});

export const add = mutation({
  args: {
    title: v.string(),
    skill: v.optional(v.string()),
    target: v.optional(v.string()),
    priority: v.optional(v.string()),
    due: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_user_and_order", (q) => q.eq("userId", userId))
      .collect();
    const minOrder = existing.reduce((m, r) => Math.min(m, r.order), 0);
    const id = await ctx.db.insert("plans", {
      userId,
      title: args.title,
      skill: args.skill,
      target: args.target,
      done: false,
      pinned: false,
      created_at: Date.now(),
      priority: args.priority,
      due: args.due,
      notes: args.notes,
      order: minOrder - 1,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("plans"),
    patch: v.object({
      title: v.optional(v.string()),
      skill: v.optional(v.string()),
      target: v.optional(v.string()),
      done: v.optional(v.boolean()),
      pinned: v.optional(v.boolean()),
      priority: v.optional(v.string()),
      due: v.optional(v.string()),
      notes: v.optional(v.string()),
      completed_at: v.optional(v.number()),
      status: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("NOT_FOUND");
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("plans") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("NOT_FOUND");
    await ctx.db.delete(id);
  },
});

export const reorder = mutation({
  args: { ids: v.array(v.id("plans")) },
  handler: async (ctx, { ids }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    for (let i = 0; i < ids.length; i++) {
      const row = await ctx.db.get(ids[i]);
      if (!row || row.userId !== userId) continue;
      await ctx.db.patch(ids[i], { order: i });
    }
  },
});
