import type { ActionCtx } from "./_generated/server";
import { resolveGeminiKey, resolveOpenrouter } from "./userSettings";

// Shared 3-tier AI text helper. Each action used to bolt on its own
// retry/fallback code; this centralises the chain so a single rate-limit
// failure on Gemini doesn't break a feature when the user has any other
// provider key configured.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

export type AiTextOpts = {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
};

export type AiTextResult = {
  text: string;
  provider?: "gemini" | "openrouter" | "groq";
  error?: string;
};

async function callGemini(key: string, opts: AiTextOpts): Promise<{ text?: string; status?: number; body?: string }> {
  const r = await fetch(GEMINI_ENDPOINT(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxTokens ?? 800,
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    return { status: r.status, body: body.slice(0, 200) };
  }
  const data = await r.json();
  const parts = (data.candidates ?? [{}])[0]?.content?.parts ?? [];
  let text = "";
  for (const p of parts as Array<Record<string, unknown>>) {
    if (typeof p.text === "string") text += p.text;
  }
  return { text: text.trim() };
}

async function callOpenRouter(
  key: string,
  model: string,
  opts: AiTextOpts,
): Promise<{ text?: string; status?: number; body?: string }> {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 800,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    return { status: r.status, body: body.slice(0, 200) };
  }
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return { text: String(text).trim() };
}

async function callGroq(
  key: string,
  opts: AiTextOpts,
): Promise<{ text?: string; status?: number; body?: string }> {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 800,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    return { status: r.status, body: body.slice(0, 200) };
  }
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return { text: String(text).trim() };
}

async function resolveGroqKey(ctx: ActionCtx): Promise<string | null> {
  // resolveOpenrouter shape mirrors what we need; for Groq just inline.
  try {
    const row = await ctx.runQuery(
      (await import("./_generated/api")).api.userSettings._readSecrets,
      {},
    );
    if (row?.groq_key_encrypted) {
      const { openSealed } = await import("./userSettings");
      return await openSealed(row.groq_key_encrypted);
    }
  } catch { /* ignore */ }
  return process.env.GROQ_API_KEY || null;
}

export async function aiText(ctx: ActionCtx, opts: AiTextOpts): Promise<AiTextResult> {
  let lastErr = "";

  // Tier 1: Gemini with 2 retries on transient errors.
  const geminiKey = await resolveGeminiKey(ctx);
  if (geminiKey) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await callGemini(geminiKey, opts);
        if (r.text) return { text: r.text, provider: "gemini" };
        if (r.status && TRANSIENT_STATUS.has(r.status)) {
          lastErr = `Gemini ${r.status}: ${r.body ?? ""}`;
          await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
          continue;
        }
        lastErr = `Gemini ${r.status ?? "?"}: ${r.body ?? "empty"}`;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
  } else {
    lastErr = "no Gemini key";
  }

  // Tier 2: OpenRouter (user-supplied or server-side).
  const or = await resolveOpenrouter(ctx);
  if (or.key) {
    const model = or.model || "meta-llama/llama-3.3-70b-instruct:free";
    try {
      const r = await callOpenRouter(or.key, model, opts);
      if (r.text) return { text: r.text, provider: "openrouter" };
      lastErr = `OpenRouter ${r.status ?? "?"}: ${r.body ?? "empty"}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  // Tier 3: Groq (free tier).
  const groqKey = await resolveGroqKey(ctx);
  if (groqKey) {
    try {
      const r = await callGroq(groqKey, opts);
      if (r.text) return { text: r.text, provider: "groq" };
      lastErr = `Groq ${r.status ?? "?"}: ${r.body ?? "empty"}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  return { text: "", error: lastErr || "no AI provider available" };
}
