import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("applications")
      .withIndex("by_user_and_applied_at", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return rows.map((a) => ({
      id: a._id,
      job_id: a.job_external_id,
      applied_at: new Date(a.applied_at).toISOString(),
      status: a.status,
      notes: a.notes ?? "",
      follow_up_at: a.follow_up_at ?? null,
      job: {
        id: a.job_external_id,
        title: a.job_title,
        company: a.job_company ?? null,
        source: a.job_source ?? "",
        source_url: a.job_source_url ?? "",
        posted_at: a.job_posted_at ?? null,
      },
    }));
  },
});

export const apply = mutation({
  args: {
    job_external_id: v.string(),
    job_title: v.string(),
    job_company: v.optional(v.string()),
    job_source: v.optional(v.string()),
    job_source_url: v.optional(v.string()),
    job_posted_at: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const existing = await ctx.db
      .query("applications")
      .withIndex("by_user_and_job_ext", (q) =>
        q.eq("userId", userId).eq("job_external_id", args.job_external_id),
      )
      .first();
    if (existing) {
      const patch: Record<string, unknown> = {};
      if (args.status) patch.status = args.status;
      if (args.notes) patch.notes = args.notes;
      if (Object.keys(patch).length) await ctx.db.patch(existing._id, patch);
      return { id: existing._id, duplicated: true };
    }
    const id = await ctx.db.insert("applications", {
      userId,
      job_external_id: args.job_external_id,
      job_title: args.job_title,
      job_company: args.job_company,
      job_source: args.job_source,
      job_source_url: args.job_source_url,
      job_posted_at: args.job_posted_at,
      status: args.status ?? "applied",
      applied_at: Date.now(),
      notes: args.notes,
    });
    return { id, duplicated: false };
  },
});

export const update = mutation({
  args: {
    id: v.id("applications"),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
    follow_up_at: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, notes, follow_up_at }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("NOT_FOUND");
    const patch: Record<string, unknown> = {};
    if (status) patch.status = status;
    if (notes !== undefined) patch.notes = notes;
    if (follow_up_at !== undefined) patch.follow_up_at = follow_up_at;
    if (Object.keys(patch).length) await ctx.db.patch(id, patch);
  },
});

export const setStatusByExternalId = mutation({
  args: {
    job_external_id: v.string(),
    status: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { job_external_id, status, notes }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db
      .query("applications")
      .withIndex("by_user_and_job_ext", (q) =>
        q.eq("userId", userId).eq("job_external_id", job_external_id),
      )
      .first();
    if (!row) throw new Error("NOT_FOUND");
    const patch: Record<string, unknown> = { status };
    if (notes !== undefined) patch.notes = notes;
    await ctx.db.patch(row._id, patch);
    return { ok: true, status };
  },
});

// Internal mutation used by trusted callers (Telegram webhook) where
// the user identity is established out-of-band (URL secret), not via
// ctx.auth. Idempotent on (userId, job_external_id).
export const _internalApply = internalMutation({
  args: {
    userId: v.id("users"),
    job_external_id: v.string(),
    job_title: v.string(),
    job_company: v.optional(v.string()),
    job_source: v.optional(v.string()),
    job_source_url: v.optional(v.string()),
    job_posted_at: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("applications")
      .withIndex("by_user_and_job_ext", (q) =>
        q.eq("userId", args.userId).eq("job_external_id", args.job_external_id),
      )
      .first();
    if (existing) {
      return { id: existing._id, duplicated: true };
    }
    const id = await ctx.db.insert("applications", {
      userId: args.userId,
      job_external_id: args.job_external_id,
      job_title: args.job_title,
      job_company: args.job_company,
      job_source: args.job_source,
      job_source_url: args.job_source_url,
      job_posted_at: args.job_posted_at,
      status: args.status ?? "applied",
      applied_at: Date.now(),
      notes: args.notes,
    });
    return { id, duplicated: false };
  },
});

export const remove = mutation({
  args: { id: v.id("applications") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("NOT_FOUND");
    await ctx.db.delete(id);
  },
});
