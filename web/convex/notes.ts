import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const GENERIC_TEMPLATE = (skill: string, category: string) => `# ${skill}

> ${category}

## Why this matters
This skill appears in real junior job listings you're targeting. Use this page to capture what you learn — concepts, gotchas, code snippets, links.

## Core concepts (fill in as you learn)
- [ ] ...
- [ ] ...
- [ ] ...

## Hands-on (the only thing that actually teaches you)
1. ...
2. ...
3. ...

## Common gotchas
- ...

## Resources
<!-- Paste good links here as you find them. -->

## Your notes
<!-- Free-form. -->
`;

export const get = query({
  args: { skill: v.string(), category: v.optional(v.string()) },
  handler: async (ctx, { skill, category }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const cat = category ?? "skill";
    const row = await ctx.db
      .query("notes")
      .withIndex("by_user_and_skill", (q) => q.eq("userId", userId).eq("skill", skill))
      .first();
    return {
      skill,
      category: row?.category ?? cat,
      content: row?.content ?? GENERIC_TEMPLATE(skill, cat),
    };
  },
});

export const save = mutation({
  args: { skill: v.string(), content: v.string(), category: v.optional(v.string()) },
  handler: async (ctx, { skill, content, category }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const cat = category ?? "skill";
    const existing = await ctx.db
      .query("notes")
      .withIndex("by_user_and_skill", (q) => q.eq("userId", userId).eq("skill", skill))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { content, updated_at: Date.now() });
    } else {
      await ctx.db.insert("notes", {
        userId,
        skill,
        category: cat,
        content,
        updated_at: Date.now(),
      });
    }
    return { ok: true, bytes: content.length };
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => ({
      skill: r.skill,
      lines: (r.content.match(/\n/g)?.length ?? 0) + 1,
      bytes: r.content.length,
    }));
  },
});

export const reset = mutation({
  args: { skill: v.string(), category: v.optional(v.string()) },
  handler: async (ctx, { skill, category }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const cat = category ?? "skill";
    const content = GENERIC_TEMPLATE(skill, cat);
    const existing = await ctx.db
      .query("notes")
      .withIndex("by_user_and_skill", (q) => q.eq("userId", userId).eq("skill", skill))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { content, updated_at: Date.now() });
    } else {
      await ctx.db.insert("notes", {
        userId,
        skill,
        category: cat,
        content,
        updated_at: Date.now(),
      });
    }
    return { content };
  },
});
