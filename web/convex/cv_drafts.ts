import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Tailored CV drafts. `name` holds the job external id (`jobs_pool` id),
// `markdown` stores a JSON-serialized snapshot of accepted tailored entries
// so the user can recover any prior tailoring without rerunning Gemini.

export const save = mutation({
  args: {
    jobId: v.string(),
    payload_json: v.string(),
  },
  handler: async (ctx, { jobId, payload_json }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const existing = await ctx.db
      .query("cv_drafts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const match = existing.find((d) => d.name === jobId);
    const now = Date.now();
    if (match) {
      await ctx.db.patch(match._id, { markdown: payload_json, updated_at: now });
      return { id: match._id };
    }
    const id = await ctx.db.insert("cv_drafts", {
      userId,
      name: jobId,
      markdown: payload_json,
      updated_at: now,
    });
    return { id };
  },
});

export const get = query({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const rows = await ctx.db
      .query("cv_drafts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const match = rows.find((d) => d.name === jobId);
    if (!match) return null;
    return { id: match._id, payload_json: match.markdown, updated_at: match.updated_at };
  },
});
