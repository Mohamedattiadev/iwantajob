import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// Per-user secrets sealed with AES-GCM. The key lives in Convex env
// (`SECRETS_KEY`, 32 raw bytes base64-encoded). Plaintext never leaves
// the backend — frontend only sees presence booleans.

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64encode(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s);
}

async function loadKey(): Promise<CryptoKey> {
  const raw = process.env.SECRETS_KEY;
  if (!raw) throw new Error("SECRETS_KEY not set in Convex env");
  const keyBytes = b64decode(raw);
  if (keyBytes.length !== 32) {
    throw new Error("SECRETS_KEY must decode to 32 bytes");
  }
  return crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal(plaintext: string): Promise<string> {
  const key = await loadKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return b64encode(out);
}

async function open(blob: string): Promise<string> {
  const key = await loadKey();
  const buf = b64decode(blob);
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { has_groq_key: false, has_telegram_token: false, scrape_filters: null };
    }
    const row = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      has_groq_key: Boolean(row?.groq_key_encrypted),
      has_gemini_key: Boolean(row?.gemini_key_encrypted),
      has_openrouter_key: Boolean(row?.openrouter_key_encrypted),
      openrouter_model: row?.openrouter_model ?? null,
      has_telegram_token: Boolean(row?.telegram_token_encrypted),
      telegram_chat_id: row?.telegram_chat_id ?? null,
      scrape_filters: row?.scrape_filters ?? null,
    };
  },
});

async function upsertPatch(
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: Record<string, unknown>,
) {
  const row = await ctx.db
    .query("user_settings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (row) {
    await ctx.db.patch(row._id, patch);
  } else {
    await ctx.db.insert("user_settings", {
      userId,
      ...(patch as Partial<{
        groq_key_encrypted: string;
        telegram_token_encrypted: string;
        scrape_filters: string;
      }>),
    });
  }
}

export const setGroqKey = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const sealed = await seal(key);
    await upsertPatch(ctx, userId, { groq_key_encrypted: sealed });
    return { ok: true };
  },
});

export const clearGroqKey = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row) await ctx.db.patch(row._id, { groq_key_encrypted: undefined });
    return { ok: true };
  },
});

export const setGeminiKey = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const sealed = await seal(key);
    await upsertPatch(ctx, userId, { gemini_key_encrypted: sealed });
    return { ok: true };
  },
});

export const clearGeminiKey = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row) await ctx.db.patch(row._id, { gemini_key_encrypted: undefined });
    return { ok: true };
  },
});

export const setOpenrouterKey = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const sealed = await seal(key);
    await upsertPatch(ctx, userId, { openrouter_key_encrypted: sealed });
    return { ok: true };
  },
});

export const clearOpenrouterKey = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row) await ctx.db.patch(row._id, { openrouter_key_encrypted: undefined });
    return { ok: true };
  },
});

export const setOpenrouterModel = mutation({
  args: { model: v.string() },
  handler: async (ctx, { model }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    await upsertPatch(ctx, userId, { openrouter_model: model });
    return { ok: true };
  },
});

export const setTelegramToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const sealed = await seal(token);
    await upsertPatch(ctx, userId, { telegram_token_encrypted: sealed });
    return { ok: true };
  },
});

export const clearTelegramToken = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row) await ctx.db.patch(row._id, { telegram_token_encrypted: undefined });
    return { ok: true };
  },
});

export const setTelegramChatId = mutation({
  args: { chat_id: v.string() },
  handler: async (ctx, { chat_id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    await upsertPatch(ctx, userId, { telegram_chat_id: chat_id });
    return { ok: true };
  },
});

export const clearTelegramChatId = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const row = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (row) await ctx.db.patch(row._id, { telegram_chat_id: undefined });
    return { ok: true };
  },
});

export const setScrapeFilters = mutation({
  args: { filters: v.string() },
  handler: async (ctx, { filters }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    await upsertPatch(ctx, userId, { scrape_filters: filters });
    return { ok: true };
  },
});

// Internal-shaped readers for actions that need plaintext (e.g. when
// calling external services on the user's behalf). These return null
// when the secret is unset rather than throwing so the caller can
// choose its own fallback.

export const _readSecrets = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!row) return null;
    return {
      groq_key_encrypted: row.groq_key_encrypted ?? null,
      gemini_key_encrypted: row.gemini_key_encrypted ?? null,
      openrouter_key_encrypted: row.openrouter_key_encrypted ?? null,
      openrouter_model: row.openrouter_model ?? null,
      telegram_token_encrypted: row.telegram_token_encrypted ?? null,
      telegram_chat_id: row.telegram_chat_id ?? null,
    };
  },
});

export async function decryptUserSecretsInAction(
  ctx: ActionCtx,
): Promise<{
  groq_key: string | null;
  gemini_key: string | null;
  openrouter_key: string | null;
  openrouter_model: string | null;
  telegram_token: string | null;
  telegram_chat_id: string | null;
}> {
  const row = await ctx.runQuery(api.userSettings._readSecrets, {});
  if (!row) {
    return {
      groq_key: null, gemini_key: null, openrouter_key: null, openrouter_model: null,
      telegram_token: null, telegram_chat_id: null,
    };
  }
  return {
    groq_key: row.groq_key_encrypted ? await open(row.groq_key_encrypted) : null,
    gemini_key: row.gemini_key_encrypted ? await open(row.gemini_key_encrypted) : null,
    openrouter_key: row.openrouter_key_encrypted ? await open(row.openrouter_key_encrypted) : null,
    openrouter_model: row.openrouter_model ?? null,
    telegram_token: row.telegram_token_encrypted
      ? await open(row.telegram_token_encrypted)
      : null,
    telegram_chat_id: row.telegram_chat_id ?? null,
  };
}

// ---- Telegram webhook secret (internal-only). --------------------------

export const _setWebhookSecret = internalMutation({
  args: { userId: v.id("users"), secret: v.string() },
  handler: async (ctx, { userId, secret }) => {
    await upsertPatch(ctx, userId, { telegram_webhook_secret: secret });
    return { ok: true };
  },
});

export const _findByWebhookSecret = internalQuery({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    const row = await ctx.db
      .query("user_settings")
      .withIndex("by_webhook_secret", (q) => q.eq("telegram_webhook_secret", secret))
      .first();
    if (!row) return null;
    return {
      userId: row.userId,
      telegram_token_encrypted: row.telegram_token_encrypted ?? null,
    };
  },
});

export async function openSealed(blob: string): Promise<string> {
  return open(blob);
}

// Resolve the Gemini key for the current action — user-supplied takes
// precedence over the server env var so individual users can route around
// the global free-tier rate limit by attaching their own key.
export async function resolveGeminiKey(ctx: ActionCtx): Promise<string | null> {
  try {
    const row = await ctx.runQuery(api.userSettings._readSecrets, {});
    if (row?.gemini_key_encrypted) return await open(row.gemini_key_encrypted);
  } catch {}
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
}

export async function resolveOpenrouter(
  ctx: ActionCtx,
): Promise<{ key: string | null; model: string | null }> {
  try {
    const row = await ctx.runQuery(api.userSettings._readSecrets, {});
    if (row?.openrouter_key_encrypted) {
      return {
        key: await open(row.openrouter_key_encrypted),
        model: row.openrouter_model || process.env.OPENROUTER_MODEL || null,
      };
    }
  } catch {}
  return {
    key: process.env.OPENROUTER_API_KEY || null,
    model: process.env.OPENROUTER_MODEL || null,
  };
}

// Smoke-test helper for round-trip encryption.
export const _roundTrip = action({
  args: { sample: v.string() },
  handler: async (_ctx, { sample }) => {
    const sealed = await seal(sample);
    const opened = await open(sealed);
    return { match: opened === sample, sealed_len: sealed.length };
  },
});
