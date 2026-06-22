import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { api } from "./_generated/api";
import { resolveGeminiKey, resolveOpenrouter } from "./userSettings";
import type { ActionCtx } from "./_generated/server";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

async function openrouterText(
  ctx: ActionCtx,
  system: string,
  user: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<{ text?: string; error?: string }> {
  const { key, model } = await resolveOpenrouter(ctx);
  if (!key) return { error: "openrouter unavailable" };
  const m = model || "meta-llama/llama-3.3-70b-instruct:free";
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: m,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.maxTokens ?? 200,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    return { error: `OpenRouter ${r.status}: ${body.slice(0, 200)}` };
  }
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return { text: String(text).trim() };
}

export const status = query({
  args: {},
  handler: async () => ({
    available: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    model: MODEL,
  }),
});

function buildSystem(args: {
  topic: string;
  mode: string;
  lang: string;
  profile: Record<string, unknown>;
}): string {
  const { topic, mode, lang, profile } = args;
  const skills = (profile.skills ?? {}) as Record<string, number>;
  const userLevel = skills[topic.toLowerCase()] ?? 0;
  const role =
    mode === "teach"
      ? "You play a CURIOUS LEARNER. The user is explaining a topic to you to practice their teaching. Ask clarifying questions, point out where the explanation jumped ahead, request concrete examples. At natural breakpoints (every 4-5 turns) give a SHORT feedback block: what was clear, what was vague, one suggestion. Keep your turns SHORT (1-3 sentences) so the user does most of the talking."
      : "You play a TECHNICAL INTERVIEWER for an internship candidate. Ask one focused question at a time. After each answer: brief 1-line reaction (correct/partial/wrong), then either a follow-up probe or move to a new sub-topic. Increase difficulty as answers strengthen. Every 5-6 questions give a SHORT scorecard (strengths, gaps, what to study). Keep your turns SHORT — interviewers don't lecture.";
  const langHint =
    lang === "tr"
      ? "Reply in Turkish."
      : lang === "ar"
        ? "Reply in Arabic."
        : lang === "en"
          ? "Reply in English."
          : "Reply in the user's language.";
  const snap = JSON.stringify(
    { personal: profile.personal, skills: profile.skills },
    null,
    2,
  ).slice(0, 800);
  return `You are conducting a live VOICE session, so write like SPEECH: short, plain, no markdown, no bullet points unless absolutely needed. Use natural conversational flow.

ROLE: ${role}

TOPIC: ${topic || "general software engineering for juniors"}
USER'S SELF-RATED LEVEL on this topic: ${userLevel}/5

LANGUAGE: ${langHint}

USER PROFILE SNAPSHOT (for personalisation, do not recite):
${snap}

RULES:
- THIS IS A LIVE VOICE CALL. Reply in <=2 short sentences (max 25 words). NEVER more.
- Start with ONE sentence greeting + ONE first question (interview) OR "Tell me about ${topic}" (teach).
- No lists, no markdown, no bullet points.
- If user types "next", move to new question. If "score", give 3-line scorecard.`;
}

export const send = action({
  args: {
    topic: v.string(),
    mode: v.string(),
    lang: v.string(),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
  },
  handler: async (
    ctx,
    { topic, mode, lang, messages },
  ): Promise<{ text?: string; error?: string }> => {
    const key = await resolveGeminiKey(ctx);
    if (!key) return { error: "GEMINI_API_KEY not set. Add one in Settings or set in Convex env." };

    const profile = await ctx.runQuery(api.profile.get, {});
    const system = buildSystem({ topic, mode, lang, profile });

    let userPrompt = "Start the session now. One sentence only.";
    if (messages.length > 0) {
      const lines = messages.map(
        (m) => `${m.role === "user" ? "USER" : "YOU"}: ${m.content}`,
      );
      userPrompt =
        "Transcript so far:\n" +
        lines.join("\n") +
        "\n\nYour next turn (one short reply only):";
    }

    const r = await fetch(ENDPOINT(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 180,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!r.ok) {
      // 503/429: try OpenRouter fallback for speech-style reply.
      if (r.status === 503 || r.status === 429 || r.status === 500) {
        const fb = await openrouterText(ctx, system, userPrompt, { temperature: 0.6, maxTokens: 180 });
        if (fb.text) return { text: fb.text };
      }
      const body = await r.text();
      return { error: `Gemini API ${r.status}: ${body.slice(0, 300)}` };
    }
    const data = await r.json();
    const parts = (data.candidates ?? [{}])[0]?.content?.parts ?? [];
    let text = "";
    for (const p of parts as Array<Record<string, unknown>>) {
      if (typeof p.text === "string") text += p.text;
    }
    return { text: text.trim() };
  },
});
