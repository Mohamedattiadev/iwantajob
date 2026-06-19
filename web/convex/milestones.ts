import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const listBySkill = query({
  args: { skill: v.string() },
  handler: async (ctx, { skill }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("milestones")
      .withIndex("by_user_and_skill_and_order", (q) =>
        q.eq("userId", userId).eq("skill", skill),
      )
      .collect();
    return rows.sort((a, b) => a.order - b.order);
  },
});

export const add = mutation({
  args: { skill: v.string(), text: v.string() },
  handler: async (ctx, { skill, text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("EMPTY");
    const existing = await ctx.db
      .query("milestones")
      .withIndex("by_user_and_skill", (q) => q.eq("userId", userId).eq("skill", skill))
      .collect();
    const order = existing.reduce((m, r) => Math.max(m, r.order), -1) + 1;
    const id = await ctx.db.insert("milestones", {
      userId,
      skill,
      text: trimmed,
      done: false,
      order,
    });
    return id;
  },
});

export const toggle = mutation({
  args: { id: v.id("milestones") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("NOT_FOUND");
    await ctx.db.patch(id, { done: !row.done });
  },
});

export const updateText = mutation({
  args: { id: v.id("milestones"), text: v.string() },
  handler: async (ctx, { id, text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("NOT_FOUND");
    const trimmed = text.trim();
    if (!trimmed) return;
    await ctx.db.patch(id, { text: trimmed });
  },
});

export const remove = mutation({
  args: { id: v.id("milestones") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("NOT_FOUND");
    await ctx.db.delete(id);
  },
});

export const replaceForSkill = mutation({
  args: { skill: v.string(), texts: v.array(v.string()) },
  handler: async (ctx, { skill, texts }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const existing = await ctx.db
      .query("milestones")
      .withIndex("by_user_and_skill", (q) => q.eq("userId", userId).eq("skill", skill))
      .collect();
    for (const r of existing) await ctx.db.delete(r._id);
    let order = 0;
    for (const text of texts) {
      const trimmed = text.trim();
      if (!trimmed) continue;
      await ctx.db.insert("milestones", {
        userId,
        skill,
        text: trimmed,
        done: false,
        order: order++,
      });
    }
  },
});

export const seedIfEmpty = mutation({
  args: { skill: v.string(), texts: v.array(v.string()) },
  handler: async (ctx, { skill, texts }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const existing = await ctx.db
      .query("milestones")
      .withIndex("by_user_and_skill", (q) => q.eq("userId", userId).eq("skill", skill))
      .first();
    if (existing) return;
    let order = 0;
    for (const text of texts) {
      const trimmed = text.trim();
      if (!trimmed) continue;
      await ctx.db.insert("milestones", {
        userId,
        skill,
        text: trimmed,
        done: false,
        order: order++,
      });
    }
  },
});
