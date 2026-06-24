import { internalMutation } from "./_generated/server";

// Convex free tier is ~0.5 GB. These mutations are scheduled by crons.ts
// to keep the long-tail tables bounded so storage stays well under the
// quota without manual intervention.

const DAY_MS = 24 * 60 * 60 * 1000;
const JOB_TTL_MS = 30 * DAY_MS;     // unused scraped jobs older than 30 days
const SCENE_TTL_MS = 90 * DAY_MS;   // sketches not touched in 90 days
const MAX_MESSAGES_PER_USER = 500;  // chat history cap

export const pruneOldJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - JOB_TTL_MS;
    // Build the keep-set: any job that has a job_action or application
    // (per any user). Those rows are tiny — collecting all is fine.
    const keep = new Set<string>();
    for (const a of await ctx.db.query("job_actions").collect()) {
      keep.add(a.job_external_id);
    }
    for (const a of await ctx.db.query("applications").collect()) {
      keep.add(a.job_external_id);
    }
    let deleted = 0;
    // Scan via posted_at index ascending — stop at cutoff.
    const old = await ctx.db
      .query("jobs_pool")
      .withIndex("by_posted_at", (q) => q.lt("posted_at", cutoff))
      .collect();
    for (const j of old) {
      if (keep.has(j._id as string)) continue;
      await ctx.db.delete(j._id);
      deleted += 1;
    }
    return { deleted, scanned: old.length };
  },
});

export const pruneOldMessages = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Group messages by userId via the by_user index. For each user, keep
    // the newest MAX, delete the rest.
    const users = new Set<string>();
    for (const m of await ctx.db.query("messages").collect()) {
      users.add(m.userId as string);
    }
    let deleted = 0;
    for (const userId of users) {
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_user", (q) => q.eq("userId", userId as never))
        .order("desc")
        .collect();
      if (msgs.length <= MAX_MESSAGES_PER_USER) continue;
      const toDelete = msgs.slice(MAX_MESSAGES_PER_USER);
      for (const m of toDelete) {
        await ctx.db.delete(m._id);
        deleted += 1;
      }
    }
    return { deleted };
  },
});

export const pruneStaleSketches = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - SCENE_TTL_MS;
    let deleted = 0;
    for (const s of await ctx.db.query("sketches").collect()) {
      if (s.updated_at >= cutoff) continue;
      // Keep the canonical /excalidraw scene ("main") regardless of age —
      // it's the user's primary canvas. Drop only per-skill side scenes.
      if (s.slug === "main") continue;
      await ctx.db.delete(s._id);
      deleted += 1;
    }
    return { deleted };
  },
});
