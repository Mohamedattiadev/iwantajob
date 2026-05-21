import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Ephemeral presence tracker. Each client POSTs a heartbeat every ~5s with a
// stable sessionId; we keep the latest timestamp per (slug, session). GET
// returns the count of sessions seen in the last STALE_MS window. In-memory
// only — fine for a single-process dev server which is the entire intended
// scope (iPad-on-LAN debugging).
type Entry = { ts: number; role: "host" | "pad" | "viewer" };
const STALE_MS = 15_000;
const g = globalThis as unknown as { __presence?: Map<string, Map<string, Entry>> };
if (!g.__presence) g.__presence = new Map();
const presence = g.__presence;

function prune(slug: string) {
  const m = presence.get(slug);
  if (!m) return;
  const now = Date.now();
  for (const [sid, e] of m) if (now - e.ts > STALE_MS) m.delete(sid);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  let body: { sessionId?: string; role?: "host" | "pad" | "viewer" } = {};
  try { body = await req.json(); } catch {}
  const sid = body.sessionId;
  if (!sid) return Response.json({ ok: false, error: "sessionId required" }, { status: 400 });
  const role = body.role === "pad" || body.role === "host" ? body.role : "viewer";
  let m = presence.get(slug);
  if (!m) { m = new Map(); presence.set(slug, m); }
  m.set(sid, { ts: Date.now(), role });
  prune(slug);
  const counts = { host: 0, pad: 0, viewer: 0, total: 0 };
  for (const e of m.values()) { counts[e.role]++; counts.total++; }
  return Response.json(counts);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  prune(slug);
  const m = presence.get(slug);
  const counts = { host: 0, pad: 0, viewer: 0, total: 0 };
  if (m) for (const e of m.values()) { counts[e.role]++; counts.total++; }
  return Response.json(counts);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const sid = req.nextUrl.searchParams.get("sessionId");
  const m = presence.get(slug);
  if (m && sid) m.delete(sid);
  return Response.json({ ok: true });
}
