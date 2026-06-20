import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: { type: v.optional(v.string()) },
  handler: async (ctx, { type }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = type
      ? await ctx.db
          .query("conversations")
          .withIndex("by_user_and_type", (q) =>
            q.eq("userId", userId).eq("type", type),
          )
          .collect()
      : await ctx.db
          .query("conversations")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect();
    rows.sort((a, b) => b.updated_at - a.updated_at);
    const out = [];
    for (const c of rows) {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_conv", (q) => q.eq("conversationId", c._id))
        .collect();
      out.push({
        id: c._id,
        type: c.type,
        title: c.title,
        meta: c.meta_json ? safeParse(c.meta_json) : {},
        created_at: new Date(c.created_at).toISOString(),
        updated_at: new Date(c.updated_at).toISOString(),
        message_count: msgs.length,
      });
    }
    return out;
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const c = await ctx.db.get(id);
    if (!c || c.userId !== userId) return null;
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_conv", (q) => q.eq("conversationId", id))
      .collect();
    msgs.sort((a, b) => a.created_at - b.created_at);
    return {
      id: c._id,
      type: c.type,
      title: c.title,
      meta: c.meta_json ? safeParse(c.meta_json) : {},
      messages: msgs.map((m) => ({
        id: m._id,
        role: m.role,
        content: m.content,
        meta: m.meta_json ? safeParse(m.meta_json) : {},
        created_at: new Date(m.created_at).toISOString(),
      })),
    };
  },
});

export const create = mutation({
  args: {
    type: v.string(),
    title: v.optional(v.string()),
    meta: v.optional(v.string()),
  },
  handler: async (ctx, { type, title, meta }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    if (type !== "assistant" && type !== "interview") {
      throw new Error("INVALID_TYPE");
    }
    const now = Date.now();
    const id = await ctx.db.insert("conversations", {
      userId,
      type,
      title: (title ?? "New chat").slice(0, 200),
      meta_json: meta ?? "{}",
      created_at: now,
      updated_at: now,
    });
    return {
      id,
      type,
      title: title ?? "New chat",
      meta: meta ? safeParse(meta) : {},
    };
  },
});

export const addMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.string(),
    content: v.string(),
    meta: v.optional(v.string()),
  },
  handler: async (ctx, { conversationId, role, content, meta }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const c = await ctx.db.get(conversationId);
    if (!c || c.userId !== userId) throw new Error("NOT_FOUND");
    const now = Date.now();
    const id = await ctx.db.insert("messages", {
      conversationId,
      userId,
      role,
      content,
      meta_json: meta ?? "{}",
      created_at: now,
    });
    await ctx.db.patch(conversationId, { updated_at: now });
    return { id };
  },
});

export const rename = mutation({
  args: { id: v.id("conversations"), title: v.string() },
  handler: async (ctx, { id, title }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const c = await ctx.db.get(id);
    if (!c || c.userId !== userId) throw new Error("NOT_FOUND");
    await ctx.db.patch(id, {
      title: (title || "Untitled").slice(0, 200),
      updated_at: Date.now(),
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const c = await ctx.db.get(id);
    if (!c || c.userId !== userId) throw new Error("NOT_FOUND");
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_conv", (q) => q.eq("conversationId", id))
      .collect();
    for (const m of msgs) await ctx.db.delete(m._id);
    await ctx.db.delete(id);
    return { ok: true };
  },
});

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}
