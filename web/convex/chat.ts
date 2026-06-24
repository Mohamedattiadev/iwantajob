import { v } from "convex/values";
import { action, query } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { resolveGeminiKey, resolveOpenrouter } from "./userSettings";

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
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 800,
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

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

export const status = query({
  args: {},
  handler: async () => ({
    available: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    model: MODEL,
  }),
});

type Msg = { role: "user" | "assistant"; content: string };

const TOOLS_SCHEMA = [
  {
    functionDeclarations: [
      {
        name: "read_skill_note",
        description: "Read the user's markdown note for a given skill.",
        parameters: {
          type: "object",
          properties: { skill: { type: "string" } },
          required: ["skill"],
        },
      },
      {
        name: "write_skill_note",
        description:
          "Save or append content to the user's note for a skill. mode='append' adds; mode='replace' overwrites.",
        parameters: {
          type: "object",
          properties: {
            skill: { type: "string" },
            content: { type: "string" },
            mode: { type: "string", enum: ["append", "replace"] },
          },
          required: ["skill", "content"],
        },
      },
      {
        name: "list_skill_notes",
        description: "List all skill notes the user has, with line counts.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "read_profile",
        description: "Read the user's full CV profile.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "update_profile_summary",
        description: "Update the user's CV summary (1 short paragraph).",
        parameters: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
      {
        name: "add_cv_entry",
        description:
          "Append a new entry to a CV section (experience|projects|education|certifications).",
        parameters: {
          type: "object",
          properties: {
            section: {
              type: "string",
              enum: ["experience", "projects", "education", "certifications"],
            },
            raw: { type: "string" },
          },
          required: ["section", "raw"],
        },
      },
      {
        name: "list_applications",
        description: "List user's job applications with status and dates.",
        parameters: {
          type: "object",
          properties: { status: { type: "string" } },
        },
      },
      {
        name: "set_application_status",
        description: "Update an application's status by job_external_id.",
        parameters: {
          type: "object",
          properties: {
            job_external_id: { type: "number" },
            status: {
              type: "string",
              enum: ["applied", "interviewing", "rejected", "offer", "ghost"],
            },
            notes: { type: "string" },
          },
          required: ["job_external_id", "status"],
        },
      },
    ],
  },
];

async function execTool(
  ctx: ActionCtx,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    if (name === "read_skill_note") {
      const skill = String(args.skill || "");
      const note = await ctx.runQuery(api.notes.get, { skill });
      return { skill, content: note?.content ?? "" };
    }
    if (name === "write_skill_note") {
      const skill = String(args.skill || "");
      const content = String(args.content || "");
      const mode = (args.mode as string) || "append";
      let final = content;
      if (mode === "append") {
        const existing = await ctx.runQuery(api.notes.get, { skill });
        const prior = existing?.content ?? "";
        const sep = prior && !prior.endsWith("\n\n") ? "\n\n" : "";
        final = prior + sep + content;
      }
      await ctx.runMutation(api.notes.save, { skill, content: final });
      return { ok: true, skill, mode, bytes: content.length };
    }
    if (name === "list_skill_notes") {
      const notes = await ctx.runQuery(api.notes.listAll, {});
      return { notes };
    }
    if (name === "read_profile") {
      return await ctx.runQuery(api.profile.get, {});
    }
    if (name === "update_profile_summary") {
      const p = await ctx.runQuery(api.profile.get, {});
      p.personal = { ...(p.personal ?? {}), summary: String(args.text || "") };
      await ctx.runMutation(api.profile.save, { data: JSON.stringify(p) });
      return { ok: true };
    }
    if (name === "add_cv_entry") {
      const section = String(args.section || "");
      const raw = String(args.raw || "");
      if (
        !["experience", "projects", "education", "certifications"].includes(
          section,
        )
      ) {
        return { error: "invalid section" };
      }
      const p = await ctx.runQuery(api.profile.get, {});
      const arr = (p[section] as unknown[]) ?? [];
      arr.push({ raw });
      p[section] = arr;
      await ctx.runMutation(api.profile.save, { data: JSON.stringify(p) });
      return { ok: true, section, count: arr.length };
    }
    if (name === "list_applications") {
      const all = await ctx.runQuery(api.applications.list, {});
      const filter = String(args.status || "").trim();
      const out = filter ? all.filter((a) => a.status === filter) : all;
      return { applications: out, count: out.length };
    }
    if (name === "set_application_status") {
      const job_external_id = String(args.job_external_id ?? "");
      const status = String(args.status || "");
      const notes =
        args.notes !== undefined ? String(args.notes) : undefined;
      return await ctx.runMutation(api.applications.setStatusByExternalId, {
        job_external_id,
        status,
        notes,
      });
    }
    return { error: `unknown tool: ${name}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function preview(r: unknown): unknown {
  if (r && typeof r === "object") {
    const obj = r as Record<string, unknown>;
    if (Array.isArray(obj.notes)) {
      return { notes_count: (obj.notes as unknown[]).length };
    }
    if (typeof obj.content === "string") {
      const c = obj.content;
      return {
        ...Object.fromEntries(
          Object.entries(obj).filter(([k]) => k !== "content"),
        ),
        content_preview: c.length > 240 ? c.slice(0, 240) + "…" : c,
      };
    }
  }
  return r;
}

export const send = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
  },
  handler: async (
    ctx,
    { messages },
  ): Promise<{
    text?: string;
    model?: string;
    usage?: unknown;
    tool_calls?: unknown[];
    error?: string;
  }> => {
    const key = await resolveGeminiKey(ctx);
    if (!key) {
      return {
        error:
          "GEMINI_API_KEY not set in Convex env. Run `npx convex env set GEMINI_API_KEY <key>`.",
      };
    }

    const profile = await ctx.runQuery(api.profile.get, {});
    const apps = await ctx.runQuery(api.applications.list, {});

    const sysPrompt = `You are the user's personal career coach inside their jobscraper dashboard.
Be terse and concrete. No fluff. Recommend specific next actions tied to the data below.

USER PROFILE (live):
${JSON.stringify(profile, null, 2)}

APPLICATIONS (live, count=${apps.length}):
${JSON.stringify(apps.slice(0, 20), null, 2)}

Rules:
- Reference specific skills, jobs, or numbers from the data above.
- Suggest concrete next steps: "go rate Docker", "open job #ID", "add this bullet to your CV".
- Never invent skills, jobs, or numbers the data does not show.
- Reply in same language as user.

You have tools to read/write the user's skill notes, list/update applications, and update their CV profile. Use them when relevant instead of asking the user to do it manually. Confirm before destructive overwrites (use append mode by default).`;

    const contents: Array<{
      role: "user" | "model";
      parts: Array<Record<string, unknown>>;
    }> = [];
    for (const m of messages as Msg[]) {
      if (!m.content) continue;
      contents.push({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      });
    }

    const toolTrace: Array<{
      name: string;
      args: unknown;
      result_preview: unknown;
    }> = [];
    let textOut = "";
    let usage: unknown = null;

    for (let round = 0; round < 6; round++) {
      const payload = {
        systemInstruction: { parts: [{ text: sysPrompt }] },
        contents,
        tools: TOOLS_SCHEMA,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1200,
          thinkingConfig: { thinkingBudget: 0 },
        },
      };
      const r = await fetch(ENDPOINT(key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        // 503/429/500: try OpenRouter fallback (text-only, no tools).
        if (r.status === 503 || r.status === 429 || r.status === 500) {
          const userBlob = (messages as Msg[])
            .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
            .join("\n");
          const fb = await openrouterText(ctx, sysPrompt, userBlob, { temperature: 0.4, maxTokens: 1000 });
          if (fb.text) {
            return { text: fb.text, model: "openrouter-fallback", tool_calls: toolTrace };
          }
        }
        const body = await r.text();
        return {
          error: `Gemini API error: ${r.status} — ${body.slice(0, 300)}`,
        };
      }
      const data = await r.json();
      usage = data.usageMetadata ?? usage;
      const cand = (data.candidates ?? [{}])[0];
      const parts: Array<Record<string, unknown>> =
        (cand.content?.parts as Array<Record<string, unknown>>) ?? [];
      const fnCalls = parts
        .map((p) => p.functionCall as { name: string; args?: Record<string, unknown> } | undefined)
        .filter((x): x is { name: string; args?: Record<string, unknown> } => Boolean(x));
      if (fnCalls.length === 0) {
        textOut = parts
          .map((p) => (typeof p.text === "string" ? p.text : ""))
          .join("");
        break;
      }
      contents.push({ role: "model", parts });
      const responseParts: Array<Record<string, unknown>> = [];
      for (const fc of fnCalls) {
        const result = await execTool(ctx, fc.name, fc.args ?? {});
        toolTrace.push({
          name: fc.name,
          args: fc.args ?? {},
          result_preview: preview(result),
        });
        responseParts.push({
          functionResponse: { name: fc.name, response: result },
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    return {
      text: textOut || "(tool loop limit reached without final answer)",
      model: MODEL,
      usage,
      tool_calls: toolTrace,
    };
  },
});

export const improveSearch = action({
  args: {
    query: v.string(),
    context: v.optional(v.string()),
    hint: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { query, context, hint },
  ): Promise<{ query: string; error?: string }> => {
    const key = await resolveGeminiKey(ctx);
    if (!key) return { query, error: "GEMINI_API_KEY not set in Convex env." };
    const ctxHint =
      context === "learn"
        ? "skill names from the curriculum"
        : context === "skills"
          ? "skill names"
          : context === "jobs"
            ? "job postings (titles, companies, technologies, seniority)"
            : "general full-text search";
    const system =
      "You rewrite messy search queries into concise, high-signal keywords that match a " +
      `full-text search over ${ctxHint}. Output ONLY the improved query — no quotes, no ` +
      "explanation, no leading 'Query:'. Keep it under 8 words. Prefer canonical technology " +
      "names. Strip filler words. If the input is already clean, return it unchanged.";
    const promptParts = [`User input: ${query.trim() || "(empty)"}`];
    if (hint && hint.trim()) promptParts.push(`User intent hint: ${hint.trim()}`);
    const r = await fetch(ENDPOINT(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: promptParts.join("\n") }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 60,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      return { query, error: `Gemini API error: ${r.status} — ${body.slice(0, 300)}` };
    }
    const data = await r.json();
    const parts = (data.candidates ?? [{}])[0]?.content?.parts ?? [];
    let text = "";
    for (const p of parts as Array<Record<string, unknown>>) {
      if (typeof p.text === "string") text += p.text;
    }
    const improved = text.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/[.!?,]+$/, "").trim();
    return { query: improved || query };
  },
});

export const translate = action({
  args: { text: v.string(), target: v.optional(v.string()) },
  handler: async (
    ctx,
    { text, target },
  ): Promise<{ text: string; error?: string }> => {
    const src = text.trim();
    if (!src) return { text: "" };
    const targetLang = (target || "English").trim();
    const key = await resolveGeminiKey(ctx);
    if (!key) return { text: "", error: "GEMINI_API_KEY not set in Convex env." };
    const system =
      `You translate text to ${targetLang}. Output ONLY the translation — no preamble, no quotes, no notes. ` +
      `Preserve line breaks, bullet markers, and inline punctuation. If the input is already in ${targetLang}, return it unchanged.`;
    const r = await fetch(ENDPOINT(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: src.slice(0, 8000) }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4000,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      return { text: "", error: `Gemini ${r.status}: ${body.slice(0, 200)}` };
    }
    const data = await r.json();
    const parts = (data.candidates ?? [{}])[0]?.content?.parts ?? [];
    let out = "";
    for (const p of parts as Array<Record<string, unknown>>) {
      if (typeof p.text === "string") out += p.text;
    }
    return { text: out.trim() };
  },
});

export const rerankSkills = action({
  args: {
    goal: v.string(),
    candidates: v.array(v.string()),
  },
  handler: async (
    ctx,
    { goal, candidates },
  ): Promise<{ ranked: Array<{ skill: string; why: string }>; goal?: string; error?: string; raw?: string }> => {
    const g = goal.trim();
    if (!g) return { ranked: [], error: "goal required" };
    if (!candidates.length) return { ranked: [], goal: g };
    const key = await resolveGeminiKey(ctx);
    if (!key) return { ranked: [], error: "GEMINI_API_KEY not set in Convex env." };
    const cands = candidates.slice(0, 40);
    const prompt = `You rerank skills by relevance to a user's career goal.

GOAL: ${g}
CANDIDATE SKILLS (drawn from real junior job postings):
${cands.join(", ")}

Return STRICT JSON only — no prose, no markdown — in this exact shape:
{"ranked": [{"skill": "<one from candidates>", "why": "<<=12 words>"}, ...]}
- Pick the TOP 5 most relevant skills for the goal.
- Use only skills from the candidate list (exact spelling).
- 'why' must be concrete: how it serves the goal.`;
    const r = await fetch(ENDPOINT(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 400,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      return { ranked: [], error: `Gemini API error: ${r.status} — ${body.slice(0, 300)}` };
    }
    const data = await r.json();
    const parts = (data.candidates ?? [{}])[0]?.content?.parts ?? [];
    let text = "";
    for (const p of parts as Array<Record<string, unknown>>) {
      if (typeof p.text === "string") text += p.text;
    }
    let stripped = text.trim();
    if (stripped.startsWith("```")) {
      stripped = stripped.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch {
      return { ranked: [], error: "model returned non-JSON", raw: stripped.slice(0, 400) };
    }
    const candLower = new Map(cands.map((c) => [c.toLowerCase(), c] as const));
    const out: Array<{ skill: string; why: string }> = [];
    const arr = (parsed as { ranked?: unknown }).ranked;
    if (Array.isArray(arr)) {
      for (const it of arr.slice(0, 5)) {
        const sk = String((it as { skill?: unknown }).skill ?? "").trim();
        const why = String((it as { why?: unknown }).why ?? "").trim();
        const canon = candLower.get(sk.toLowerCase());
        if (canon) out.push({ skill: canon, why });
      }
    }
    return { ranked: out, goal: g };
  },
});

export const rewrite = action({
  args: {
    field: v.string(),
    raw: v.string(),
    instruction: v.string(),
  },
  handler: async (
    ctx,
    { field, raw, instruction },
  ): Promise<{ text?: string; model?: string; error?: string }> => {
    const key = await resolveGeminiKey(ctx);
    if (!key) return { error: "GEMINI_API_KEY not set in Convex env." };

    const profile = await ctx.runQuery(api.profile.get, {});
    const styleByField: Record<string, string> = {
      summary:
        "1 paragraph, 2-3 sentences, first-person implicit (no 'I'), concrete strengths, end with a value statement. No buzzwords.",
      experience:
        "Lead with role + company + dates on line 1. Then 3-5 bullets starting with strong action verbs (Built, Shipped, Led, Reduced). Quantify when possible. Each bullet ≤ 18 words.",
      project:
        "Project name + 1-line pitch. Then 2-3 bullets: what it does, tech stack, outcome/metric. ≤ 18 words per bullet.",
      education:
        "School — Degree, dates. One line. Add GPA or honors only if present.",
      generic: "Tight, professional, ATS-friendly. No fluff.",
    };
    const style = styleByField[field] ?? styleByField.generic;
    const ctxSlice = JSON.stringify(
      { personal: profile.personal, skills: profile.skills },
      null,
      2,
    ).slice(0, 1500);

    const prompt = `You are polishing a single CV field for an ATS-clean resume.

FIELD TYPE: ${field}
USER DRAFT / NOTES: ${raw || "(empty — generate from instruction + context)"}
USER INSTRUCTION: ${instruction || "(none — just polish the draft)"}

STYLE RULES FOR THIS FIELD:
${style}

CONTEXT (other CV data — reference for tone consistency, do not duplicate):
${ctxSlice}

CONSTRAINTS:
- Output ONLY the polished CV text. No preamble, no markdown headers, no quotes around the result.
- Same language as the user instruction or draft.
- Never invent specific numbers, employers, or dates the user did not mention.
- Be human, not robotic. Vary sentence rhythm.
`;
    const r = await fetch(ENDPOINT(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      return { error: `Gemini API error: ${r.status} — ${body.slice(0, 300)}` };
    }
    const data = await r.json();
    const parts = (data.candidates ?? [{}])[0]?.content?.parts ?? [];
    let text = "";
    for (const p of parts as Array<Record<string, unknown>>) {
      if (typeof p.text === "string") text += p.text;
    }
    return { text: text.trim(), model: MODEL };
  },
});
