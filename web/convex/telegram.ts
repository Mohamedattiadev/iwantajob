import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptUserSecretsInAction } from "./userSettings";

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { available: false, has_token: false, has_chat_id: false };
    const row = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const has_token = Boolean(row?.telegram_token_encrypted);
    const has_chat_id = Boolean(row?.telegram_chat_id);
    return { available: has_token && has_chat_id, has_token, has_chat_id };
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildBrief(args: {
  title: string;
  company: string | null;
  location: string | null;
  source: string;
  description: string;
  matchedSkills: string[];
  userName: string;
  userStrong: string[];
}): string {
  const lines: string[] = [];
  lines.push(`Role: ${args.title} at ${args.company ?? "Unknown"}.`);
  if (args.matchedSkills.length) {
    lines.push(`Matched skills: ${args.matchedSkills.slice(0, 6).join(", ")}.`);
  }
  if (args.userStrong.length) {
    lines.push(`Your strong stack: ${args.userStrong.slice(0, 6).join(", ")}.`);
  }
  lines.push("Recommendation: review posting, tailor CV bullet to top skill, apply.");
  return lines.join("\n");
}

export const sendApplyBrief = action({
  args: { jobId: v.id("jobs_pool") },
  handler: async (
    ctx,
    { jobId },
  ): Promise<{ ok: boolean; error?: string; message_id?: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false, error: "UNAUTHENTICATED" };

    const secrets = await decryptUserSecretsInAction(ctx);
    if (!secrets.telegram_token || !secrets.telegram_chat_id) {
      return {
        ok: false,
        error: "Telegram not configured. Set bot token + chat id in settings.",
      };
    }

    const job = await ctx.runQuery(api.jobs._getById, { id: jobId });
    if (!job) return { ok: false, error: "job not found" };

    const profile = await ctx.runQuery(api.profile.get, {});
    const userSkills = (profile?.skills ?? {}) as Record<string, number>;
    const text = `${job.title} ${job.description ?? ""}`.toLowerCase();
    const matched: string[] = [];
    const strong: string[] = [];
    for (const [sk, lvl] of Object.entries(userSkills)) {
      if (typeof lvl !== "number") continue;
      if (lvl >= 3) strong.push(sk);
      if (text.includes(sk.toLowerCase())) matched.push(sk);
    }
    const brief = buildBrief({
      title: job.title,
      company: job.company ?? null,
      location: job.location ?? null,
      source: job.source,
      description: job.description ?? "",
      matchedSkills: matched,
      userName: String(profile?.personal?.name ?? ""),
      userStrong: strong,
    });

    const msg =
      `<b>🎯 Apply request</b>\n` +
      `<b>${escapeHtml(job.title)}</b>\n` +
      `${escapeHtml(job.company ?? "Unknown")} · ` +
      `${escapeHtml(job.location ?? "—")} · <i>${escapeHtml(job.source)}</i>\n\n` +
      `<pre>${escapeHtml(brief)}</pre>\n` +
      `<a href="${escapeHtml(job.source_url)}">Open posting</a>`;

    const r = await fetch(
      `https://api.telegram.org/bot${secrets.telegram_token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: secrets.telegram_chat_id,
          text: msg,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      },
    );
    if (!r.ok) {
      const body = await r.text();
      return {
        ok: false,
        error: `Telegram API ${r.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = (await r.json()) as {
      ok: boolean;
      result?: { message_id?: number };
      description?: string;
    };
    if (!data.ok) {
      return { ok: false, error: data.description ?? "telegram rejected" };
    }

    // Auto-record the application — keeps parity with the FastAPI flow
    // where Confirm callback recorded it. The Confirm/Cancel callback
    // path is not wired (no webhook in Convex yet); the message is
    // informational + manual apply.
    await ctx.runMutation(api.applications.apply, {
      job_external_id: String(jobId),
      job_title: job.title,
      job_company: job.company ?? undefined,
      job_source: job.source,
      job_source_url: job.source_url,
      job_posted_at: job.posted_at ?? undefined,
      status: "applied",
      notes: "via telegram",
    });

    return { ok: true, message_id: data.result?.message_id };
  },
});
