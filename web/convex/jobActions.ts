import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const VALID = new Set(["hidden", "saved"]);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { hidden: [], saved: [] };
    const rows = await ctx.db
      .query("job_actions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const hidden: string[] = [];
    const saved: string[] = [];
    for (const r of rows) {
      if (r.action === "hidden") hidden.push(r.job_external_id);
      else if (r.action === "saved") saved.push(r.job_external_id);
    }
    return { hidden, saved };
  },
});

export const setAction = mutation({
  args: {
    job_external_id: v.string(),
    action: v.union(v.literal("hidden"), v.literal("saved"), v.literal("none")),
  },
  handler: async (ctx, { job_external_id, action }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const existing = await ctx.db
      .query("job_actions")
      .withIndex("by_user_and_job_ext", (q) =>
        q.eq("userId", userId).eq("job_external_id", job_external_id),
      )
      .first();
    if (action === "none") {
      if (existing) await ctx.db.delete(existing._id);
      return { ok: true };
    }
    if (!VALID.has(action)) throw new Error("BAD_ACTION");
    if (existing) {
      await ctx.db.patch(existing._id, { action, updated_at: Date.now() });
    } else {
      await ctx.db.insert("job_actions", {
        userId,
        job_external_id,
        action,
        updated_at: Date.now(),
      });
    }
    return { ok: true };
  },
});
