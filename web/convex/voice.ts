import { v } from "convex/values";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { decryptUserSecretsInAction } from "./userSettings";
import { getAuthUserId } from "@convex-dev/auth/server";

const STT_MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";
const TTS_MODEL = process.env.GROQ_TTS_MODEL || "playai-tts";
const TTS_VOICE = process.env.GROQ_TTS_VOICE || "Fritz-PlayAI";
const TTS_VOICE_AR = process.env.GROQ_TTS_VOICE_AR || "Ahmad-PlayAI";

async function resolveGroqKey(ctx: ActionCtx): Promise<string | null> {
  const s = await decryptUserSecretsInAction(ctx);
  return s.groq_key || process.env.GROQ_API_KEY || null;
}

export const transcribe = action({
  args: {
    audio: v.bytes(),
    mime: v.optional(v.string()),
    lang: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { audio, mime, lang },
  ): Promise<{ text?: string; error?: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { error: "UNAUTHENTICATED" };
    const key = await resolveGroqKey(ctx);
    if (!key) return { error: "Groq API key not set. Add it on /settings." };

    const blob = new Blob([audio], { type: mime || "audio/webm" });
    const ext = (mime || "audio/webm").split("/")[1]?.split(";")[0] || "webm";
    const form = new FormData();
    form.append("file", blob, `audio.${ext}`);
    form.append("model", STT_MODEL);
    if (lang) form.append("language", lang);
    form.append("response_format", "json");

    const r = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      },
    );
    if (!r.ok) {
      const body = await r.text();
      return { error: `Groq STT ${r.status}: ${body.slice(0, 300)}` };
    }
    const data = (await r.json()) as { text?: string };
    return { text: (data.text ?? "").trim() };
  },
});

export const synthesize = action({
  args: { text: v.string(), lang: v.optional(v.string()) },
  handler: async (
    ctx,
    { text, lang },
  ): Promise<{ audio?: ArrayBuffer; mime?: string; error?: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { error: "UNAUTHENTICATED" };
    const key = await resolveGroqKey(ctx);
    if (!key) return { error: "Groq API key not set. Add it on /settings." };

    const isArabic = (lang || "").toLowerCase().startsWith("ar");
    const model = isArabic ? "playai-tts-arabic" : TTS_MODEL;
    const voice = isArabic ? TTS_VOICE_AR : TTS_VOICE;

    const r = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: text.slice(0, 4000),
        voice,
        response_format: "wav",
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      return { error: `Groq TTS ${r.status}: ${body.slice(0, 300)}` };
    }
    const buf = await r.arrayBuffer();
    return { audio: buf, mime: "audio/wav" };
  },
});
