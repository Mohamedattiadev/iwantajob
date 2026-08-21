import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Response-rate tracking per company/source, computed from the user's own
// application history — no new data source needed, this is a closed loop
// on data the app already has. "Responded" means a human on the other end
// did something (interview, offer, or even a rejection) — "ghosted" means
// explicitly marked as such in the tracker. Applications still sitting in
// "applied" are excluded from the rate (too early to judge either way).

type Bucket = { applied: number; responded: number; ghosted: number; pending: number };

function emptyBucket(): Bucket {
  return { applied: 0, responded: 0, ghosted: 0, pending: 0 };
}

function bump(bucket: Bucket, status: string) {
  bucket.applied += 1;
  if (status === "interviewing" || status === "offer" || status === "rejected") {
    bucket.responded += 1;
  } else if (status === "ghost") {
    bucket.ghosted += 1;
  } else {
    bucket.pending += 1;
  }
}

function toRows(map: Map<string, Bucket>) {
  return Array.from(map.entries())
    .map(([name, b]) => {
      const sample = b.responded + b.ghosted;
      return {
        name,
        applied: b.applied,
        responded: b.responded,
        ghosted: b.ghosted,
        pending: b.pending,
        sample_size: sample,
        response_rate: sample > 0 ? b.responded / sample : null,
      };
    })
    .sort((a, b) => {
      // Worst-response-rate-first among judged samples; all-pending rows
      // (response_rate null) sort last since there's nothing to warn about
      // yet.
      if (a.response_rate === null && b.response_rate === null) return b.applied - a.applied;
      if (a.response_rate === null) return 1;
      if (b.response_rate === null) return -1;
      return a.response_rate - b.response_rate;
    });
}

export const companyStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { by_company: [], by_source: [] };
    const rows = await ctx.db
      .query("applications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const byCompany = new Map<string, Bucket>();
    const bySource = new Map<string, Bucket>();
    for (const r of rows) {
      const company = (r.job_company ?? "Unknown").trim() || "Unknown";
      const source = (r.job_source ?? "unknown").trim() || "unknown";
      if (!byCompany.has(company)) byCompany.set(company, emptyBucket());
      if (!bySource.has(source)) bySource.set(source, emptyBucket());
      bump(byCompany.get(company)!, r.status);
      bump(bySource.get(source)!, r.status);
    }

    return { by_company: toRows(byCompany), by_source: toRows(bySource) };
  },
});
