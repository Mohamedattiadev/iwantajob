import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Ephemeral presence + admin-approval tracker. Each client POSTs a heartbeat
// every ~5s with a stable sessionId; we keep the latest timestamp per
// (slug, session). Pad sessions start as `pending` and the host laptop
// must approve via POST /approve. The heartbeat response echoes the
// current approval state so the pad can lock its UI until accepted.
export type ApprovalState = "pending" | "approved" | "denied";
export type DeviceInfo = {
  userAgent?: string;
  platform?: string;
  screen?: string;       // e.g. "2360x1640"
  pixelRatio?: number;
  language?: string;
  touch?: boolean;
  ip?: string;
};
type Entry = {
  ts: number;
  firstSeen: number;
  role: "host" | "pad" | "viewer";
  approval: ApprovalState;
  label?: string;
  device?: DeviceInfo;
};
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

function snapshot(slug: string) {
  prune(slug);
  const m = presence.get(slug);
  const counts = { host: 0, pad: 0, viewer: 0, total: 0 };
  const pads: Array<{ sessionId: string; approval: ApprovalState; label?: string; ts: number; firstSeen: number; device?: DeviceInfo }> = [];
  if (m) {
    for (const [sid, e] of m.entries()) {
      counts[e.role]++;
      counts.total++;
      if (e.role === "pad") {
        pads.push({ sessionId: sid, approval: e.approval, label: e.label, ts: e.ts, firstSeen: e.firstSeen, device: e.device });
      }
    }
  }
  return { ...counts, pads };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  let body: { sessionId?: string; role?: "host" | "pad" | "viewer"; label?: string; device?: DeviceInfo } = {};
  try { body = await req.json(); } catch {}
  const sid = body.sessionId;
  if (!sid) return Response.json({ ok: false, error: "sessionId required" }, { status: 400 });
  const role = body.role === "pad" || body.role === "host" ? body.role : "viewer";
  let m = presence.get(slug);
  if (!m) { m = new Map(); presence.set(slug, m); }
  const prev = m.get(sid);
  // Pad defaults to pending; host + viewers auto-approved. Approval only
  // flips via PATCH (Accept / Deny). No PIN flow — host clicks once.
  const approval: ApprovalState = prev?.approval
    ?? (role === "pad" ? "pending" : "approved");
  // Capture network IP from common proxy headers so the laptop toast can
  // show "iPad @ 10.2.11.42" — the host operator's primary tell that
  // the request is from the tablet they expect.
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const device: DeviceInfo | undefined = body.device
    ? { ...body.device, ip: ip || body.device.ip }
    : (ip ? { ip } : undefined);
  m.set(sid, {
    ts: Date.now(),
    firstSeen: prev?.firstSeen ?? Date.now(),
    role,
    approval,
    label: body.label ?? prev?.label,
    device: device ?? prev?.device,
  });
  const snap = snapshot(slug);
  return Response.json({ ...snap, self: { sessionId: sid, role, approval } });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return Response.json(snapshot(slug));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const sid = req.nextUrl.searchParams.get("sessionId");
  const m = presence.get(slug);
  if (m && sid) m.delete(sid);
  return Response.json({ ok: true });
}

// PATCH = host approves/denies a pad sessionId.
// Body: { sessionId, approval, hostSessionId }.
// `hostSessionId` must correspond to a live `host` entry in this slug's
// presence map — otherwise any client with the auth token could approve
// itself silently. Combined with the visible PIN check on the toast, this
// keeps approval pinned to the human operator on the laptop tab.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  let body: { sessionId?: string; approval?: ApprovalState; hostSessionId?: string } = {};
  try { body = await req.json(); } catch {}
  const sid = body.sessionId;
  const next = body.approval;
  const hostSid = body.hostSessionId;
  const allowed: ApprovalState[] = ["pending", "approved", "denied"];
  if (!sid || !next || !allowed.includes(next)) {
    return Response.json({ ok: false, error: "sessionId + approval required" }, { status: 400 });
  }
  prune(slug);
  const m = presence.get(slug);
  const e = m?.get(sid);
  if (!m || !e) return Response.json({ ok: false, error: "session not found" }, { status: 404 });
  if (!hostSid) return Response.json({ ok: false, error: "hostSessionId required" }, { status: 403 });
  const host = m.get(hostSid);
  if (!host || host.role !== "host") {
    return Response.json({ ok: false, error: "not a host session" }, { status: 403 });
  }
  m.set(sid, { ...e, approval: next, ts: Date.now() });
  return Response.json({ ok: true, self: { sessionId: sid, approval: next } });
}
