import { v } from "convex/values";
import { action, query, httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptUserSecretsInAction, openSealed } from "./userSettings";
import type { Id } from "./_generated/dataModel";

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

    const reply_markup = {
      inline_keyboard: [
        [
          { text: "✅ Confirm apply", callback_data: `apply:confirm:${jobId}` },
          { text: "✖ Skip", callback_data: `apply:cancel:${jobId}` },
        ],
      ],
    };

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
          reply_markup,
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

    return { ok: true, message_id: data.result?.message_id };
  },
});

// ---- Webhook registration ----------------------------------------------

function randomSecret(len = 24): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < buf.length; i++) s += buf[i].toString(16).padStart(2, "0");
  return s;
}

export const registerWebhook = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ ok: boolean; error?: string; url?: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false, error: "UNAUTHENTICATED" };
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) {
      return { ok: false, error: "CONVEX_SITE_URL not set in Convex env." };
    }
    const secrets = await decryptUserSecretsInAction(ctx);
    if (!secrets.telegram_token) {
      return { ok: false, error: "Set telegram bot token in settings first." };
    }
    const secret = randomSecret();
    await ctx.runMutation(internal.userSettings._setWebhookSecret, {
      userId,
      secret,
    });
    const url = `${siteUrl}/telegram/cb?s=${secret}`;
    const r = await fetch(
      `https://api.telegram.org/bot${secrets.telegram_token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          allowed_updates: ["callback_query"],
        }),
      },
    );
    if (!r.ok) {
      const body = await r.text();
      return {
        ok: false,
        error: `Telegram setWebhook ${r.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = (await r.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      return { ok: false, error: data.description ?? "telegram rejected" };
    }
    return { ok: true, url };
  },
});

async function tgPost(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Best-effort; webhook handler must always 200.
  }
}

export const webhook = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const secret = url.searchParams.get("s") || "";
  if (!secret) return new Response("missing secret", { status: 400 });
  const owner = await ctx.runQuery(internal.userSettings._findByWebhookSecret, {
    secret,
  });
  if (!owner) return new Response("forbidden", { status: 403 });
  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const cb = payload.callback_query as
    | {
        id?: string;
        data?: string;
        message?: { chat?: { id?: number }; message_id?: number; text?: string };
      }
    | undefined;
  if (!cb) {
    // Other update types (message etc.) — ignore.
    return new Response("ok", { status: 200 });
  }
  const token = owner.telegram_token_encrypted
    ? await openSealed(owner.telegram_token_encrypted)
    : null;
  if (!token) {
    return new Response("ok", { status: 200 });
  }

  const data = cb.data ?? "";
  const parts = data.split(":");
  const cbId = cb.id ?? "";
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const origText = cb.message?.text ?? "";

  if (parts.length !== 3 || parts[0] !== "apply") {
    await tgPost(token, "answerCallbackQuery", {
      callback_query_id: cbId,
      text: "unknown action",
    });
    return new Response("ok", { status: 200 });
  }
  const op = parts[1];
  const jobId = parts[2];

  if (op === "cancel") {
    await tgPost(token, "answerCallbackQuery", {
      callback_query_id: cbId,
      text: "Skipped.",
    });
    if (chatId && messageId) {
      await tgPost(token, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `${origText}\n\n— ✖ Skipped.`,
      });
    }
    return new Response("ok", { status: 200 });
  }

  if (op === "confirm") {
    const job = await ctx.runQuery(api.jobs._getById, {
      id: jobId as Id<"jobs_pool">,
    });
    if (!job) {
      await tgPost(token, "answerCallbackQuery", {
        callback_query_id: cbId,
        text: "Job not found.",
      });
      return new Response("ok", { status: 200 });
    }
    const res = await ctx.runMutation(internal.applications._internalApply, {
      userId: owner.userId,
      job_external_id: String(jobId),
      job_title: job.title,
      job_company: job.company ?? undefined,
      job_source: job.source,
      job_source_url: job.source_url,
      job_posted_at: job.posted_at ?? undefined,
      status: "applied",
      notes: "via telegram",
    });
    await tgPost(token, "answerCallbackQuery", {
      callback_query_id: cbId,
      text: res.duplicated ? "Already applied." : "Recorded ✓",
    });
    if (chatId && messageId) {
      const suffix = res.duplicated
        ? "\n\n— ℹ Already applied."
        : "\n\n— ✅ Confirmed.";
      await tgPost(token, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: `${origText}${suffix}`,
      });
    }
    return new Response("ok", { status: 200 });
  }

  await tgPost(token, "answerCallbackQuery", {
    callback_query_id: cbId,
    text: "unknown action",
  });
  return new Response("ok", { status: 200 });
});
