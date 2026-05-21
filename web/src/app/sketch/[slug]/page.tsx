"use client";

import dynamic from "next/dynamic";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Eye, Pencil, CheckCircle2, Save, AlertTriangle, BookOpen, Plus, X,
  Eraser, MousePointer2, Hand, Type, Sliders, Undo2, Redo2,
  PenTool, Highlighter, Brush, Feather, Palette,
} from "lucide-react";
import { toast } from "sonner";
import { API, fetcher } from "@/lib/api";
import { authHeaders, readSketchToken } from "@/lib/auth";
import {
  sceneFingerprint, patchFreedrawForPen, shouldApplyIncomingScene,
  computeFitAllAppState, PEN_PROFILES, PEN_KEYS, type PenKey,
} from "@/lib/sketch";
import { Minimap } from "@/components/skill-sketch";
import { useSketchGestures } from "@/components/sketch-gestures";
import "@excalidraw/excalidraw/index.css";

type DrawingListItem = { slug: string; title: string; category?: string; updated_at?: number };

// Heuristic label from UA — laptop renders this in the accept/deny toast.
// Keeps the toast short: "iPad · Safari", "iPhone · Chrome", "Android".
function deriveLabel(ua?: string): string {
  if (!ua) return "Tablet";
  const u = ua.toLowerCase();
  let device = "Tablet";
  if (u.includes("ipad")) device = "iPad";
  else if (u.includes("iphone")) device = "iPhone";
  else if (u.includes("android")) device = u.includes("mobile") ? "Android phone" : "Android tablet";
  else if (u.includes("macintosh")) device = "Mac";
  else if (u.includes("windows")) device = "Windows";
  else if (u.includes("linux")) device = "Linux";
  let browser = "";
  if (u.includes("crios") || u.includes("chrome")) browser = "Chrome";
  else if (u.includes("fxios") || u.includes("firefox")) browser = "Firefox";
  else if (u.includes("edg")) browser = "Edge";
  else if (u.includes("safari")) browser = "Safari";
  return browser ? `${device} · ${browser}` : device;
}

type ExcalMod = typeof import("@excalidraw/excalidraw");
let excalModPromise: Promise<ExcalMod> | null = null;
function loadExcal(): Promise<ExcalMod> {
  if (!excalModPromise) excalModPromise = import("@excalidraw/excalidraw");
  return excalModPromise;
}

const Excalidraw = dynamic(
  async () => (await loadExcal()).Excalidraw,
  {
    ssr: false,
    loading: () => (
      <div className="grid place-items-center h-full text-xs font-mono text-muted-foreground">
        Loading Excalidraw bundle…
      </div>
    ),
  },
);

type DrawingDoc = {
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  title?: string;
};

type ExcalApi = {
  getSceneElements: () => readonly unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  updateScene: (data: { elements?: unknown[]; appState?: Record<string, unknown> }) => void;
  setActiveTool?: (tool: { type: string; locked?: boolean }) => void;
};

export default function SharedSketchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const sp = useSearchParams();
  const router = useRouter();
  const editMode = sp.get("mode") === "edit";
  const penMode = sp.get("pen") === "1";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [readMode, setReadMode] = useState(false);
  const { data, isLoading, error, mutate } = useSWR<DrawingDoc>(
    `/api/drawings/${encodeURIComponent(slug)}`,
    fetcher,
    { refreshInterval: 500, dedupingInterval: 0, revalidateOnFocus: false },
  );

  // Don't gate canvas mount on the fetch — iPad needs to see *something*
  // even if the network call hangs / fails. We render Excalidraw with the
  // server scene if it arrives, otherwise an empty scene immediately.
  // SSR-safety: `collaborators: new Map()` only matters once Excalidraw
  // mounts (ssr:false), so it's fine to build unconditionally.
  const initialData = useMemo(() => {
    const els = Array.isArray(data?.elements) ? data!.elements : [];
    const elements = (els as Array<Record<string, unknown> | null>)
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof e.type === "string");
    const src = (data?.appState ?? {}) as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const k of ["viewBackgroundColor", "gridSize", "gridModeEnabled", "zoom", "scrollX", "scrollY"]) {
      if (src[k] !== undefined) safe[k] = src[k];
    }
    return {
      elements: elements as never,
      appState: {
        ...safe,
        collaborators: new Map(),
        viewModeEnabled: !editMode,
        ...(penMode ? { penMode: true, penDetected: true } : {}),
      } as never,
      files: (data?.files && typeof data.files === "object" ? data.files : {}) as never,
    };
  }, [data, editMode, penMode]);

  const excalRef = useRef<ExcalApi | null>(null);
  // Excalidraw module — loaded lazily for `reconcileElements`,
  // `getSceneVersion`, and `CaptureUpdateAction` (the official collab
  // primitives we now use instead of timing heuristics).
  const [excalMod, setExcalMod] = useState<ExcalMod | null>(null);
  const excalModRef = useRef<ExcalMod | null>(null);
  useEffect(() => { loadExcal().then(setExcalMod).catch(() => {}); }, []);
  useEffect(() => { excalModRef.current = excalMod; }, [excalMod]);
  const lastBroadcastedOrReceivedSceneVersion = useRef(-1);
  // Synchronous flag set during our own updateScene calls so the
  // resulting echo onChange skips save+broadcast.
  const applyingRemoteRef = useRef(false);
  const lastBody = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // We mount Excalidraw with an empty scene immediately so iPad never sees a
  // blank-while-loading screen. Then, when both (a) the API is ready and
  // (b) the fetch has returned, we push the elements in via updateScene.
  // `excalReady` is state, not just a ref, so the effect can fire when the
  // API arrives AFTER data. Per-slug guard avoids re-applying on every
  // SWR poll (which would clobber realtime WS updates).
  const [excalReady, setExcalReady] = useState(false);
  const appliedFor = useRef<string>("");
  useEffect(() => {
    if (!data || !excalReady) return;
    const api = excalRef.current;
    if (!api) return;
    const remoteEls = Array.isArray(data.elements) ? data.elements : [];
    const firstApply = appliedFor.current !== slug;
    if (firstApply) {
      appliedFor.current = slug;
      applyingRemoteRef.current = true;
      try {
        (api.updateScene as (d: { elements?: unknown[]; appState?: Record<string, unknown> }) => void)({
          elements: remoteEls as unknown[],
        });
      } catch {}
      try {
        const app = api.getAppState() as { width?: number; height?: number };
        const fit = computeFitAllAppState(
          remoteEls as Array<{ x?: number; y?: number; width?: number; height?: number; isDeleted?: boolean } | null>,
          { width: app.width ?? window.innerWidth, height: app.height ?? window.innerHeight },
        );
        if (fit) {
          (api.updateScene as (d: { appState?: Record<string, unknown> }) => void)({
            appState: { zoom: { value: fit.zoom }, scrollX: fit.scrollX, scrollY: fit.scrollY },
          });
        }
      } catch {}
      setTimeout(() => { applyingRemoteRef.current = false; }, 0);
      const mod = excalModRef.current;
      if (mod) {
        try {
          lastBroadcastedOrReceivedSceneVersion.current = mod.getSceneVersion(remoteEls as never);
        } catch {}
      }
      return;
    }
    // Subsequent SWR refreshes: reconcile remote against local so the
    // laptop's strokes land here without clobbering our own. Poll-
    // based sync replaces the WS fanout that kept breaking.
    const mod = excalModRef.current;
    if (!mod) return;
    try {
      const remoteVer = mod.getSceneVersion(remoteEls as never);
      if (remoteVer <= lastBroadcastedOrReceivedSceneVersion.current) return;
      const local = api.getSceneElements() as never;
      const appState = api.getAppState() as never;
      const restored = (mod.restoreElements as (r: unknown, e: unknown) => unknown)(remoteEls, local);
      const reconciled = mod.reconcileElements(local, restored as never, appState);
      lastBroadcastedOrReceivedSceneVersion.current = mod.getSceneVersion(reconciled as never);
      applyingRemoteRef.current = true;
      (api.updateScene as unknown as (d: { elements?: unknown[]; captureUpdate?: string }) => void)({
        elements: reconciled as unknown as unknown[],
        captureUpdate: mod.CaptureUpdateAction.NEVER,
      });
      setTimeout(() => { applyingRemoteRef.current = false; }, 0);
    } catch { applyingRemoteRef.current = false; }
  }, [slug, data, excalReady]);
  // Reset the applied flag when slug changes so the next data arrival
  // re-applies for the new notebook.
  useEffect(() => {
    appliedFor.current = "";
    lastBody.current = "";
    lastBroadcastedOrReceivedSceneVersion.current = -1;
  }, [slug]);

  // Pen-mode boot: when iPad opens via QR (`?pen=1&mode=edit`), turn
  // on penMode + select freedraw so Apple Pencil writes immediately.
  // Runs once the Excalidraw API is mounted (no `setTimeout` race).
  useEffect(() => {
    if (!excalReady || !penMode || !editMode) return;
    const api = excalRef.current;
    if (!api) return;
    try {
      api.updateScene({
        appState: { penMode: true, penDetected: true, currentItemStrokeWidth: 2 },
      });
      api.setActiveTool?.({ type: "freedraw" });
    } catch {}
  }, [excalReady, penMode, editMode]);
  const [savedTick, setSavedTick] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = useCallback(async (payload: object) => {
    const body = JSON.stringify({ data: { ...payload, title: data?.title ?? slug } });
    if (body === lastBody.current) return;
    lastBody.current = body;
    const r = await fetch(`${API}/api/drawings/${encodeURIComponent(slug)}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body,
    });
    if (r.ok) { setSavedTick(true); setTimeout(() => setSavedTick(false), 1200); mutate(); }
  }, [data?.title, mutate, slug]);

  const manualSave = async () => {
    const api = excalRef.current;
    if (!api) return;
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    setSaving(true);
    try {
      lastBody.current = "";
      const body = JSON.stringify({
        data: {
          title: data?.title ?? slug,
          elements: [...api.getSceneElements()],
          appState: api.getAppState(),
          files: api.getFiles(),
        },
      });
      const r = await fetch(`${API}/api/drawings/${encodeURIComponent(slug)}`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body,
      });
      if (!r.ok) throw new Error(`${r.status}`);
      lastBody.current = body;
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1200);
      mutate();
      toast.success("Saved");
    } catch (e) {
      toast.error("Save failed", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };
  const manualSaveRef = useRef(manualSave);
  useEffect(() => { manualSaveRef.current = manualSave; });

  // Live collab over WebSocket. Each client throttles outgoing scenes
  // (~150ms) so we don't flood while a stroke is in progress. Incoming
  // scenes always apply; the apply is suppressed only while the local
  // user is actively dragging (handled by Excalidraw internally — calling
  // updateScene mid-stroke can interfere, so we skip if onPointerDown
  // recently fired).
  const wsRef = useRef<WebSocket | null>(null);
  const wsSendThrottle = useRef(0);
  const lastEditAt = useRef(0);
  const lastSeenFingerprint = useRef("");
  // Pending payload kept so we always flush the last frame after throttle
  // window closes (trailing-edge). Without this, the receiver sees a stale
  // mid-stroke scene whenever the stroke ends inside a throttle gap.
  const pendingSend = useRef<{ elements: readonly unknown[]; bg?: string } | null>(null);
  // Per-tab random senderId + monotonically increasing seq so peers
  // can drop their own loopbacks and out-of-order frames
  // deterministically, independent of timing heuristics.
  const senderId = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );
  const seqRef = useRef(0);
  const lastSeqBySender = useRef<Map<string, number>>(new Map());
  const trailingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // rAF handle for batching incoming-scene applies to one per frame, so
  // bursty incoming messages don't trigger N synchronous React renders.
  const incomingRaf = useRef<number | null>(null);
  const incomingPending = useRef<unknown[] | null>(null);
  // Admin-approval gate. Pad starts pending; laptop accept/deny via the
  // notification toast wired into SkillSketch. While pending or denied,
  // we lock editing locally so the pad can't change the shared scene.
  const [approval, setApproval] = useState<"pending" | "approved" | "denied">(
    penMode ? "pending" : "approved",
  );
  const approvalRef = useRef(approval);
  // Imperative viewMode toggle. Excalidraw reads `viewModeEnabled` from
  // appState only — flipping the React prop does nothing at runtime. Push
  // the new value through updateScene whenever approval changes so the
  // pad becomes truly writable on approve and truly locked on deny.
  // Without this the canvas stayed in view mode after the host accepted
  // (the "freezes after PIN" bug).
  useEffect(() => {
    if (!excalReady || !penMode) return;
    const api = excalRef.current;
    if (!api) return;
    const locked = approval !== "approved";
    try {
      api.updateScene({
        appState: {
          viewModeEnabled: locked,
          ...(locked ? {} : { penMode: true, penDetected: true }),
        },
      });
      if (!locked) api.setActiveTool?.({ type: "freedraw" });
    } catch {}
  }, [approval, excalReady, penMode]);
  useEffect(() => { approvalRef.current = approval; }, [approval]);
  // Excalidraw fires onChange whenever the scene mutates — including when
  // WE called updateScene to apply an incoming WS payload. Without this
  // guard, the remote-applied frame would set lastEditAt = now, which then
  // gates out the NEXT incoming scene (laptop → iPad gets stuck after one
  // stroke). Set this window around every updateScene-from-remote call.
  const applyingRemoteUntil = useRef(0);
  const [livePeers, setLivePeers] = useState(0);
  const [miniData, setMiniData] = useState<{ els: readonly unknown[]; app: Record<string, unknown> }>({ els: [], app: {} });
  const miniThrottle = useRef(0);
  const [miniOpen, setMiniOpen] = useState(true);

  const flushPending = useCallback(() => {
    if (trailingTimer.current) { clearTimeout(trailingTimer.current); trailingTimer.current = null; }
    const p = pendingSend.current;
    if (!p) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    pendingSend.current = null;
    wsSendThrottle.current = Date.now();
    try {
      ws.send(JSON.stringify({
        type: "scene",
        elements: p.elements,
        appState: { viewBackgroundColor: p.bg },
        ts: Date.now(),
        senderId: senderId.current,
        seq: ++seqRef.current,
      }));
    } catch {}
  }, []);

  const onChange = useCallback((elements: readonly unknown[], appState: unknown, files: Record<string, unknown>) => {
    if (!editMode) return;
    // Pad is not yet approved by host — drop all edits (Excalidraw still
    // updates visually because viewModeEnabled is the real lock; we keep
    // this as a belt-and-braces guard against autosave + broadcast).
    if (penMode && approvalRef.current !== "approved") return;
    // Critical guard: don't autosave before the server's scene has been
    // applied to Excalidraw. Otherwise the initial empty onChange (Excalidraw
    // fires it on mount) would PUT empty elements and wipe the drawing on
    // every reload.
    if (appliedFor.current !== slug) return;
    if (applyingRemoteRef.current) return; // echo from our own updateScene
    lastEditAt.current = Date.now();
    const tnow = Date.now();
    if (tnow - miniThrottle.current > 33) {
      miniThrottle.current = tnow;
      setMiniData({ els: elements, app: appState as Record<string, unknown> });
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save({ elements: [...elements], appState: appState as Record<string, unknown>, files });
    }, 150);
    // Realtime broadcast — Excalidraw collab pattern (see laptop
    // side for the rationale). Only emit when scene version
    // advances; receiver echoes are absorbed by the same gate.
    // Tracking the version here also stops SWR-poll re-applies from
    // round-tripping the same elements back through our reconciler.
    const mod = excalModRef.current;
    if (mod) {
      try {
        const sceneVersion = mod.getSceneVersion(elements as never);
        if (sceneVersion > lastBroadcastedOrReceivedSceneVersion.current) {
          lastBroadcastedOrReceivedSceneVersion.current = sceneVersion;
          const bg = (appState as { viewBackgroundColor?: string })?.viewBackgroundColor;
          pendingSend.current = { elements, bg };
          // Run the throttle dance only if the socket is open;
          // otherwise rely on ws.onopen to drain pendingSend.
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const now = Date.now();
            if (now - wsSendThrottle.current >= 16) {
              flushPending();
            } else if (!trailingTimer.current) {
              const wait = Math.max(4, 16 - (now - wsSendThrottle.current));
              trailingTimer.current = setTimeout(() => {
                trailingTimer.current = null;
                flushPending();
              }, wait);
            }
          }
        }
      } catch {}
    }
  }, [editMode, save, penMode, flushPending]);

  useEffect(() => {
    if (typeof window === "undefined" || !editMode) return;
    // Backend WS host: iPad reaches the laptop's LAN IP. Use the page host
    // and force port 8000 (FastAPI). HTTPS pages would need wss:// — we're
    // on http here.
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.hostname;
    const tok = readSketchToken();
    // Backend WS port — env-driven so deployments not on :8000 don't
    // have to fork the client. Defaults to 8000 (the FastAPI dev port).
    const wsPort = process.env.NEXT_PUBLIC_BACKEND_WS_PORT || "8000";
    const url = `${proto}://${host}:${wsPort}/ws/drawings/${encodeURIComponent(slug)}${tok ? `?t=${encodeURIComponent(tok)}` : ""}`;
    let ws: WebSocket | null = null;
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!alive) return;
      try { ws = new WebSocket(url); } catch { return; }
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { type: string; count?: number; elements?: unknown[]; senderId?: string; seq?: number };
          if (msg.type === "peers") {
            setLivePeers(Math.max(0, (msg.count ?? 1) - 1));
            return;
          }
          if (msg.type !== "scene" || !Array.isArray(msg.elements)) return;
          if (msg.senderId === senderId.current) return;
          if (msg.senderId && typeof msg.seq === "number") {
            const last = lastSeqBySender.current.get(msg.senderId) ?? 0;
            if (msg.seq <= last) return;
            lastSeqBySender.current.set(msg.senderId, msg.seq);
          }
          incomingPending.current = msg.elements;
          if (incomingRaf.current != null) return;
          incomingRaf.current = requestAnimationFrame(() => {
            incomingRaf.current = null;
            const next = incomingPending.current;
            incomingPending.current = null;
            if (!next) return;
            const a = excalRef.current;
            const mod = excalModRef.current;
            if (!a || !mod) return;
            try {
              const local = a.getSceneElements() as never;
              const appState = a.getAppState() as never;
              const restored = (mod.restoreElements as (r: unknown, e: unknown) => unknown)(next, local);
              const reconciled = mod.reconcileElements(local, restored as never, appState);
              lastBroadcastedOrReceivedSceneVersion.current = mod.getSceneVersion(reconciled as never);
              applyingRemoteRef.current = true;
              (a.updateScene as unknown as (d: { elements?: unknown[]; captureUpdate?: string }) => void)({
                elements: reconciled as unknown as unknown[],
                captureUpdate: mod.CaptureUpdateAction.NEVER,
              });
              setTimeout(() => { applyingRemoteRef.current = false; }, 0);
              setMiniData({ els: reconciled as unknown as readonly unknown[], app: a.getAppState() as Record<string, unknown> });
            } catch { applyingRemoteRef.current = false; }
          });
        } catch {}
      };
      ws.onopen = () => {
        // Flush latest scene on (re)connect — same reason as the
        // laptop: strokes drawn while the socket was still connecting
        // would otherwise sit in pendingSend forever.
        const a = excalRef.current;
        const mod = excalModRef.current;
        if (a && mod) {
          try {
            const getAll = (a as unknown as { getSceneElementsIncludingDeleted?: () => readonly unknown[] }).getSceneElementsIncludingDeleted;
            const all = getAll ? getAll.call(a) : a.getSceneElements();
            const bg = (a.getAppState() as { viewBackgroundColor?: string }).viewBackgroundColor;
            pendingSend.current = { elements: all as readonly unknown[], bg };
            flushPending();
          } catch {}
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        setLivePeers(0);
        if (alive) reconnectTimer = setTimeout(connect, 1500);
      };
      ws.onerror = () => { try { ws?.close(); } catch {} };
    };
    connect();
    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch {}
      wsRef.current = null;
    };
  }, [editMode, slug, flushPending]);

  // Suppress incoming WS scenes only while the local user is actively
  // mid-stroke. `pointerdown` arms a long window (long enough for a slow
  // stroke), `pointerup` collapses it to a tiny grace so our own
  // outgoing broadcast lands before we accept anyone else's.
  // CRITICAL: do NOT listen on `pointermove` — passive hover on a touch
  // device fires it constantly and would permanently suppress incoming
  // scenes, which is the bug that broke sync on the iPad.
  // (Gate is now entirely driven by `lastEditAt` inside onChange — no
  // window pointer listeners needed. Keeping `localDrawingUntil` removed.)

  // Pen post-processor — Excalidraw freedraw can't switch its perfect-freehand
  // `simulatePressure` via appState, so we patch newly-finished strokes here.
  // Ballpoint & highlighter want a flat constant width (no taper); fountain &
  // brush want the natural velocity/Pencil-pressure taper, which is the
  // freedraw default — so we leave those untouched. No `pressures` rewriting:
  // overwriting the captured pressures caused a visible "snap" on pointer-up.
  const penRef = useRef<PenKey>("ballpoint");
  const patchedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!editMode || !penMode) return;
    const onUp = () => {
      const api = excalRef.current;
      if (!api) return;
      const els = api.getSceneElements() as ReadonlyArray<Record<string, unknown>>;
      const { elements, newlyPatched, mutated } = patchFreedrawForPen(
        els, penRef.current, patchedIdsRef.current,
      );
      for (const id of newlyPatched) patchedIdsRef.current.add(id);
      if (mutated) {
        try { (api.updateScene as (d: { elements?: unknown[] }) => void)({ elements: [...elements] }); } catch {}
      }
    };
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [editMode, penMode]);

  // Presence heartbeat — declare ourselves as `pad` if pen=1 (the QR link sets
  // this), otherwise as a passive viewer. Lets the host laptop badge the iPad
  // icon with "1 connected" when this page is alive.
  const newSid = () => crypto.randomUUID?.() ?? `s-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  const [sessionId, setSessionId] = useState<string>("");
  useEffect(() => { if (!sessionId) setSessionId(newSid()); }, [sessionId]);
  // Tablet hook for "request access again" — rotate sid so server marks
  // the new entry pending, and laptop's presence poll picks it up as a
  // fresh pad and re-toasts the accept/deny prompt.
  const requestAccessAgain = useCallback(() => {
    const prev = sessionId;
    if (prev) {
      fetch(`/api/presence/${encodeURIComponent(slug)}?sessionId=${encodeURIComponent(prev)}`, {
        method: "DELETE", headers: authHeaders(),
      }).catch(() => {});
    }
    setApproval("pending");
    setSessionId(newSid());
  }, [sessionId, slug]);
  useEffect(() => {
    if (typeof window === "undefined" || !sessionId) return;
    const sid = sessionId;
    const role = penMode ? "pad" : editMode ? "viewer" : "viewer";
    // Build device fingerprint once — laptop displays it in the accept toast
    // so the host knows which physical tablet is asking to join.
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    const scr = typeof screen !== "undefined" ? screen : undefined;
    const device = nav ? {
      userAgent: nav.userAgent,
      platform: (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? nav.platform,
      screen: scr ? `${scr.width}x${scr.height}` : undefined,
      pixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : undefined,
      language: nav.language,
      touch: typeof window !== "undefined" && ("ontouchstart" in window || nav.maxTouchPoints > 0),
    } : undefined;
    // Friendlier label than just "iPad" — e.g. "iPad · Safari" so the
    // operator can disambiguate when multiple devices try to connect.
    const label = role === "pad" ? deriveLabel(nav?.userAgent) : undefined;
    const beat = () => {
      fetch(`/api/presence/${encodeURIComponent(slug)}`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ sessionId: sid, role, label, device }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((j: { self?: { approval?: "pending" | "approved" | "denied" } } | null) => {
          if (!j?.self?.approval) return;
          setApproval(j.self.approval);
        })
        .catch(() => {});
    };
    beat();
    const id = setInterval(beat, 4000);
    const onUnload = () => {
      try {
        fetch(`/api/presence/${encodeURIComponent(slug)}?sessionId=${encodeURIComponent(sid)}`, { method: "DELETE", keepalive: true }).catch(() => {});
      } catch {}
    };
    window.addEventListener("pagehide", onUnload);
    return () => { clearInterval(id); window.removeEventListener("pagehide", onUnload); onUnload(); };
  }, [slug, penMode, editMode, sessionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        manualSaveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reuse the same global flag SkillSketch sets in fullscreen mode: hides
  // ChatWidget / TodoDrawer / AmbientBackground so the shared canvas owns
  // the screen on iPad. The extra `ipad-mode` class gates the iPad-only
  // CSS (hides Excalidraw's default left selection panel, etc).
  useEffect(() => {
    document.documentElement.classList.add("sketch-fullscreen");
    if (penMode) document.documentElement.classList.add("ipad-mode");
    return () => {
      document.documentElement.classList.remove("sketch-fullscreen");
      document.documentElement.classList.remove("ipad-mode");
    };
  }, [penMode]);

  // Keep penMode sticky — Excalidraw can reset it on certain interactions,
  // which makes finger drawing creep back in. Re-assert every 1.5s while
  // the iPad client is alive.
  useEffect(() => {
    if (!penMode || !editMode) return;
    const id = setInterval(() => {
      const api = excalRef.current;
      if (!api) return;
      const s = api.getAppState() as { penMode?: boolean };
      if (!s.penMode) {
        try { api.updateScene({ appState: { penMode: true, penDetected: true } }); } catch {}
      }
    }, 1500);
    return () => clearInterval(id);
  }, [penMode, editMode]);

  const title = data?.title ?? slug;
  const displayName = title.startsWith("skill-") ? title.slice(6) : title;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background" style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}>
      <header className={`relative flex items-center px-4 py-2 border-b border-border/50 bg-card/60 backdrop-blur shrink-0 ${penMode ? "h-12" : "justify-between"}`}>
        {penMode ? (
          // Tablet header — absolutely centered cluster. Using
          // left:50% + translate-x:-50% guarantees the row sits at the
          // true horizontal center of the viewport regardless of chip count
          // (a justify-center flex would still drift because the row itself
          // is left-anchored when other absolute siblings exist).
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-3 whitespace-nowrap">
            <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Link>
            <span className="h-4 w-px bg-border/60" />
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-foreground/15 hover:bg-foreground/5 text-xs"
              title="Switch notebook"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span className="font-semibold truncate max-w-[24ch]">{displayName}</span>
              <span className="opacity-50">▾</span>
            </button>
            <span className="inline-flex items-center gap-1.5 text-xs">
              <Pencil className="h-3.5 w-3.5 text-primary" />
              <span className="font-mono uppercase tracking-wider text-muted-foreground">iPad (pen)</span>
            </span>
            <span className="h-4 w-px bg-border/60" />
            {editMode && (
              <button
                type="button"
                onClick={manualSave}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md border border-foreground/15 px-2 py-1 text-[11px] hover:bg-foreground/5 disabled:opacity-50"
                title="Force save now"
              >
                <Save className="h-3 w-3" />
                <span>{saving ? "Saving…" : "Save"}</span>
              </button>
            )}
            {editMode && savedTick && (
              <span className="text-[10px] text-emerald-500 font-mono inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> saved
              </span>
            )}
            <span className="h-4 w-px bg-border/60" />
            <span className="px-2 py-1 rounded-md bg-foreground/5 border border-foreground/10 inline-flex items-center gap-1 text-[10px] font-mono">
              <span className={`h-1.5 w-1.5 rounded-full ${livePeers > 0 ? "bg-emerald-500 animate-pulse" : "bg-zinc-500"}`} />
              <span className="text-muted-foreground">{livePeers > 0 ? `live · ${livePeers}` : "solo"}</span>
            </span>
          </div>
        ) : (
          <>
            <div className="inline-flex items-center gap-3 min-w-0">
              <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" /> Home
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-foreground/15 hover:bg-foreground/5 text-xs"
                title="Switch notebook"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span className="font-semibold truncate max-w-[24ch]">{displayName}</span>
                <span className="opacity-50">▾</span>
              </button>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs">
                {editMode
                  ? <Pencil className="h-3.5 w-3.5 text-primary" />
                  : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="font-mono uppercase tracking-wider text-muted-foreground">
                  {editMode ? "Shared (editing)" : "Shared (read-only)"}
                </span>
              </span>
            </div>
            <div className="inline-flex items-center gap-2">
              {editMode && (
                <button
                  type="button"
                  onClick={manualSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-md border border-foreground/15 px-2 py-1 text-[11px] hover:bg-foreground/5 disabled:opacity-50"
                  title="Force save now (Ctrl/Cmd+S)"
                >
                  <Save className="h-3 w-3" />
                  <span>{saving ? "Saving…" : "Save"}</span>
                </button>
              )}
              {editMode && savedTick && (
                <span className="text-[10px] text-emerald-500 font-mono inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> saved
                </span>
              )}
              {editMode && !savedTick && (
                <span className="text-[10px] text-muted-foreground font-mono">auto-saves</span>
              )}
            </div>
          </>
        )}
      </header>
      <div className="flex-1 min-h-0 relative">
        <Excalidraw
          initialData={initialData}
          viewModeEnabled={!editMode || (penMode && approval !== "approved")}
          onChange={editMode ? onChange : undefined}
          theme="dark"
          aiEnabled={false}
          excalidrawAPI={(api) => {
            excalRef.current = api as ExcalApi;
            setExcalReady(true);
            // The earlier `setTimeout(50)` hop here was the source of
            // the React "setState on a component that is not yet
            // mounted" warning on iPad — the callback fired after
            // dev-mode HMR unmounted the canvas. Pen-mode init now
            // lives in a separate effect keyed on `excalReady` so
            // React state machinery handles teardown correctly.
          }}
        />
        {editMode && (
          <Minimap
            size="lg"
            defaultCorner={penMode ? "tr" : "br"}
            elements={miniData.els}
            appState={miniData.app}
            open={miniOpen}
            onToggle={() => setMiniOpen((v) => !v)}
            onFitAll={() => {
              const api = excalRef.current;
              if (!api) return;
              const app = api.getAppState() as { width?: number; height?: number };
              const next = computeFitAllAppState(
                api.getSceneElements() as Array<{ x?: number; y?: number; width?: number; height?: number; isDeleted?: boolean }>,
                { width: app.width ?? 0, height: app.height ?? 0 },
              );
              if (!next) return;
              try {
                api.updateScene({
                  appState: {
                    zoom: { value: next.zoom },
                    scrollX: next.scrollX,
                    scrollY: next.scrollY,
                  },
                });
              } catch {}
            }}
            onNavigate={(worldX, worldY) => {
              const api = excalRef.current;
              if (!api) return;
              const app = api.getAppState() as { width?: number; height?: number; zoom?: { value?: number } };
              const zoom = app.zoom?.value ?? 1;
              const w = app.width ?? 0;
              const h = app.height ?? 0;
              api.updateScene({
                appState: {
                  scrollX: -(worldX - (w / zoom) / 2),
                  scrollY: -(worldY - (h / zoom) / 2),
                },
              });
            }}
          />
        )}
        {editMode && penMode && (
          <IpadCtrlRail
            getApi={() => excalRef.current}
            onPenChange={(k) => { penRef.current = k; }}
            readMode={readMode}
            onToggleReadMode={() => {
              setReadMode((v) => {
                const next = !v;
                const api = excalRef.current;
                if (api) {
                  try { api.updateScene({ appState: { viewModeEnabled: next } }); } catch {}
                }
                return next;
              });
            }}
          />
        )}
        {editMode && penMode && <GestureLayer getApi={() => excalRef.current} />}
        {editMode && !penMode && <ThicknessSlider getApi={() => excalRef.current} />}
        {editMode && !penMode && (
          // Laptop view keeps the floating badge cluster top-right.
          // Tablet view promotes both pen-mode + live indicators into the
          // centered header (see above) so this absolute block is hidden.
          <div className="absolute z-[65] inline-flex items-center gap-2 top-2 right-3">
            <span className="px-2 py-1 rounded-md bg-foreground/5 border border-foreground/10 inline-flex items-center gap-1 text-[10px] font-mono">
              <span className={`h-1.5 w-1.5 rounded-full ${livePeers > 0 ? "bg-emerald-500 animate-pulse" : "bg-zinc-500"}`} />
              <span className="text-muted-foreground">{livePeers > 0 ? `live · ${livePeers}` : "solo"}</span>
            </span>
          </div>
        )}
        {error && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[70] px-3 py-1.5 rounded-md bg-amber-500/15 text-amber-400 text-[11px] font-mono inline-flex items-center gap-1.5 border border-amber-500/30 max-w-[90vw] break-all">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>offline — local only ({String((error as Error)?.message ?? error).slice(0, 80)})</span>
          </div>
        )}
        {penMode && approval !== "approved" && (
          <div className="absolute inset-0 z-[85] grid place-items-center bg-background/40 backdrop-blur-[2px] pointer-events-none">
            <div className="pointer-events-auto rounded-2xl border border-foreground/15 bg-card/95 backdrop-blur p-5 w-[340px] shadow-2xl text-center">
              <div className="inline-flex items-center gap-2 mb-3">
                <span className={`h-2 w-2 rounded-full ${approval === "denied" ? "bg-red-500" : "bg-amber-500 animate-pulse"}`} />
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {approval === "denied" ? "Access denied" : "Waiting for laptop"}
                </div>
              </div>
              <div className="text-sm text-foreground/90 mb-4">
                {approval === "denied"
                  ? "Host rejected this tablet. Tap below to retry with a fresh session."
                  : "Tablet is connected. Accept the pair request on the laptop to start drawing."}
              </div>
              <button
                type="button"
                onClick={requestAccessAgain}
                className="w-full text-[11px] font-mono text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                rotate session & try again
              </button>
            </div>
          </div>
        )}
        {pickerOpen && (
          <NotebookPicker
            currentSlug={slug}
            onClose={() => setPickerOpen(false)}
            onPick={(s) => {
              setPickerOpen(false);
              router.push(`/sketch/${encodeURIComponent(s)}?mode=edit&pen=1`);
            }}
          />
        )}
      </div>
    </div>
  );
}

// GoodNotes-style pen presets. Excalidraw doesn't expose true fountain/brush
// stroke rendering, so we approximate via its appState knobs:
//   roughness 0 = clean (ballpoint/highlighter)
//   roughness 1 = slight wobble (fountain)
//   roughness 2 = sketchy (brush)
//   opacity drops for highlighter to look translucent
type PenPreset = {
  key: PenKey;
  label: string;
  icon: React.ReactNode;
  width: number;
  roughness: 0 | 1 | 2;
  opacity: number;
  defaultColor?: string;
};
// UI-side presets — pull numeric profile from the shared lib (so tests
// stay in sync with what the pad actually applies) and decorate with the
// icon + label that only belong in the UI.
const PEN_PRESET_META: Record<PenKey, { label: string; icon: React.ReactNode }> = {
  ballpoint:   { label: "Ballpoint",   icon: <PenTool size={16} /> },
  fountain:    { label: "Fountain",    icon: <Feather size={16} /> },
  brush:       { label: "Brush",       icon: <Brush size={16} /> },
  highlighter: { label: "Highlighter", icon: <Highlighter size={16} /> },
};
const PEN_PRESETS: PenPreset[] = PEN_KEYS.map((key) => ({
  key,
  label: PEN_PRESET_META[key].label,
  icon: PEN_PRESET_META[key].icon,
  width: PEN_PROFILES[key].width,
  roughness: PEN_PROFILES[key].roughness,
  opacity: PEN_PROFILES[key].opacity,
  defaultColor: PEN_PROFILES[key].defaultColor,
}));

// iPad-native control rail — pen variants + tool + colors + custom width.
function IpadCtrlRail({ getApi, onToggleReadMode, readMode, onPenChange }: {
  getApi: () => ExcalApi | null;
  onToggleReadMode: () => void;
  readMode: boolean;
  onPenChange?: (k: PenPreset["key"]) => void;
}) {
  const colors = [
    "#ffffff", "#d4d4d8", "#71717a", "#1f2937",
    "#ef4444", "#f97316", "#fbbf24", "#eab308",
    "#84cc16", "#22c55e", "#10b981", "#14b8a6",
    "#06b6d4", "#3b82f6", "#6366f1", "#a78bfa",
    "#d946ef", "#ec4899",
  ];
  const [color, setColor] = useState("#ffffff");
  const [tool, setTool] = useState<"freedraw" | "eraser" | "selection" | "hand" | "text">("freedraw");
  const [pen, setPen] = useState<PenPreset["key"]>("ballpoint");
  const [thickOpen, setThickOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [width, setWidth] = useState(1.5);

  const applyPen = (p: PenPreset) => {
    setPen(p.key);
    onPenChange?.(p.key);
    setTool("freedraw");
    setWidth(p.width);
    const api = getApi();
    if (!api) return;
    const next: Record<string, unknown> = {
      currentItemStrokeWidth: p.width,
      currentItemRoughness: p.roughness,
      currentItemOpacity: p.opacity,
    };
    if (p.defaultColor) { next.currentItemStrokeColor = p.defaultColor; setColor(p.defaultColor); }
    try {
      api.updateScene({ appState: next });
      api.setActiveTool?.({ type: "freedraw" });
    } catch {}
  };
  const applyColor = (c: string) => {
    setColor(c);
    const api = getApi();
    if (!api) return;
    try {
      api.updateScene({ appState: { currentItemStrokeColor: c } });
      // Lasso re-color: if anything is currently selected, mutate those
      // elements' strokeColor too so the picker doubles as a "change
      // selected" affordance.
      const app = api.getAppState() as { selectedElementIds?: Record<string, boolean> };
      const selectedIds = app.selectedElementIds ?? {};
      const selectedKeys = Object.keys(selectedIds).filter((k) => selectedIds[k]);
      if (selectedKeys.length > 0) {
        const els = api.getSceneElements() as Array<Record<string, unknown>>;
        const updated = els.map((el) => {
          if (selectedKeys.includes(el.id as string)) {
            return { ...el, strokeColor: c };
          }
          return el;
        });
        (api.updateScene as unknown as (d: { elements?: unknown[] }) => void)({ elements: updated });
        toast.success(`Recolored ${selectedKeys.length} element${selectedKeys.length === 1 ? "" : "s"}`);
      }
    } catch {}
  };
  const applyTool = (t: typeof tool) => {
    setTool(t);
    const api = getApi();
    if (!api) return;
    try { api.setActiveTool?.({ type: t }); } catch {}
  };
  const applyWidth = (v: number) => {
    setWidth(v);
    const api = getApi();
    if (!api) return;
    try { api.updateScene({ appState: { currentItemStrokeWidth: v } }); } catch {}
  };
  const undo = () => document.querySelector<HTMLButtonElement>('.excalidraw button[aria-label="Undo"]')?.click();
  const redo = () => document.querySelector<HTMLButtonElement>('.excalidraw button[aria-label="Redo"]')?.click();

  return (
    <>
      <div className="ipad-ctrl">
        {/* Pen variants */}
        {PEN_PRESETS.map((p) => (
          <button
            key={p.key}
            className={`ipad-ctrl-btn ${tool === "freedraw" && pen === p.key ? "is-active" : ""}`}
            onClick={() => applyPen(p)}
            title={p.label}
          >
            {p.icon}
          </button>
        ))}
        <div className="ipad-ctrl-sep" />
        {/* Other tools */}
        <button className={`ipad-ctrl-btn ${tool === "eraser" ? "is-active" : ""}`} onClick={() => applyTool("eraser")} title="Eraser">
          <Eraser size={18} />
        </button>
        <button className={`ipad-ctrl-btn ${tool === "selection" ? "is-active" : ""}`} onClick={() => applyTool("selection")} title="Lasso">
          <MousePointer2 size={18} />
        </button>
        <button className={`ipad-ctrl-btn ${tool === "hand" ? "is-active" : ""}`} onClick={() => applyTool("hand")} title="Pan">
          <Hand size={18} />
        </button>
        <button className={`ipad-ctrl-btn ${tool === "text" ? "is-active" : ""}`} onClick={() => applyTool("text")} title="Text">
          <Type size={18} />
        </button>
        <div className="ipad-ctrl-sep" />
        {/* Color current + palette opener */}
        <button
          className={`ipad-ctrl-btn ${paletteOpen ? "is-active" : ""}`}
          onClick={() => setPaletteOpen((v) => !v)}
          title="Color"
          style={{ position: "relative" }}
        >
          <Palette size={18} />
          <span
            style={{
              position: "absolute",
              right: 4, bottom: 4,
              width: 10, height: 10, borderRadius: 999,
              background: color, border: "1px solid rgba(0,0,0,0.4)",
            }}
          />
        </button>
        {/* Thickness opener */}
        <button className={`ipad-ctrl-btn ${thickOpen ? "is-active" : ""}`} onClick={() => setThickOpen((v) => !v)} title="Thickness">
          <Sliders size={18} />
        </button>
        <div className="ipad-ctrl-sep" />
        {/* Read mode */}
        <button
          className={`ipad-ctrl-btn ${readMode ? "is-active" : ""}`}
          onClick={onToggleReadMode}
          title={readMode ? "Switch to write mode" : "Switch to read mode"}
        >
          <Eye size={18} />
        </button>
        <div className="ipad-ctrl-sep" />
        <button className="ipad-ctrl-btn" onClick={undo} title="Undo"><Undo2 size={18} /></button>
        <button className="ipad-ctrl-btn" onClick={redo} title="Redo"><Redo2 size={18} /></button>
      </div>
      {paletteOpen && (
        <div className="ipad-thick" style={{ top: "30%", padding: 10, width: 232 }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">Color</span>
            <button onClick={() => setPaletteOpen(false)} className="h-6 w-6 grid place-items-center rounded-md hover:bg-foreground/5">
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => { applyColor(c); }}
                className={`h-8 rounded-md border-2 ${color === c ? "border-violet-400" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={color.startsWith("#") ? color : "#ffffff"}
              onChange={(e) => applyColor(e.target.value)}
              className="h-7 w-10 rounded border border-foreground/15 bg-transparent"
            />
            <span className="text-[10px] opacity-60 font-mono">custom</span>
          </div>
          <p className="mt-2 text-[10px] opacity-60 font-mono">tap with lasso selection → recolor</p>
        </div>
      )}
      {thickOpen && (
        <div className="ipad-thick" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">Pen thickness</span>
            <button onClick={() => setThickOpen(false)} className="h-7 w-7 grid place-items-center rounded-md hover:bg-foreground/5">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono w-10 tabular-nums">{width.toFixed(1)}</span>
            <input
              type="range"
              min={0.1}
              max={30}
              step={0.1}
              value={width}
              onChange={(e) => applyWidth(parseFloat(e.target.value))}
              className="flex-1 accent-violet-400"
            />
          </div>
          <div className="h-8 rounded-md bg-foreground/5 grid place-items-center">
            <div className="rounded-full" style={{ width: `${Math.min(160, width * 6)}px`, height: `${Math.max(1, width)}px`, background: color }} />
          </div>
        </div>
      )}
    </>
  );
}

// Wrapper around the gestures hook so we can `return` its UI from inside
// the page JSX without duplicating provider plumbing.
function GestureLayer({ getApi }: { getApi: () => ExcalApi | null }) {
  return useSketchGestures({ getApi: () => getApi() as ReturnType<Parameters<typeof useSketchGestures>[0]["getApi"]> });
}

function ThicknessSlider({ getApi }: { getApi: () => ExcalApi | null }) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(2);
  // Pull current width from Excalidraw on open so the slider reflects the
  // active pen rather than resetting to default. State update is wrapped
  // in queueMicrotask so the effect commits before the render kicks off.
  useEffect(() => {
    if (!open) return;
    const api = getApi();
    if (!api) return;
    const w = (api.getAppState() as { currentItemStrokeWidth?: number }).currentItemStrokeWidth;
    if (typeof w === "number") queueMicrotask(() => setWidth(w));
  }, [open, getApi]);
  const apply = (v: number) => {
    setWidth(v);
    const api = getApi();
    if (!api) return;
    try {
      api.updateScene({ appState: { currentItemStrokeWidth: v } });
    } catch {}
  };
  return (
    <div className="absolute bottom-20 right-3 z-[65] select-none">
      {open ? (
        <div className="rounded-xl border border-foreground/15 bg-card/95 backdrop-blur p-3 w-[260px] shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider opacity-70">Pen thickness</span>
            <button onClick={() => setOpen(false)} className="h-7 w-7 grid place-items-center rounded-md hover:bg-foreground/5">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono w-10 tabular-nums">{width.toFixed(1)}</span>
            <input
              type="range"
              min={0.1}
              max={20}
              step={0.1}
              value={width}
              onChange={(e) => apply(parseFloat(e.target.value))}
              className="flex-1 accent-primary"
            />
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {[0.5, 1, 2, 4, 8, 14].map((p) => (
              <button
                key={p}
                onClick={() => apply(p)}
                className={`h-8 rounded-md border text-[11px] font-mono ${
                  Math.abs(width - p) < 0.05
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-foreground/15 hover:bg-foreground/5"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-3 h-6 rounded-md bg-foreground/5 border border-foreground/10 grid place-items-center">
            <div
              className="rounded-full bg-foreground/80"
              style={{ width: `${Math.min(220, width * 8)}px`, height: `${Math.max(1, width)}px` }}
            />
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="h-11 w-11 rounded-full bg-card/95 backdrop-blur border border-foreground/15 grid place-items-center shadow-lg hover:bg-foreground/5"
          title="Pen thickness"
        >
          <span
            className="rounded-full bg-foreground"
            style={{ width: `${Math.min(28, Math.max(2, width * 1.5))}px`, height: `${Math.max(2, Math.min(14, width))}px` }}
          />
        </button>
      )}
    </div>
  );
}

function NotebookPicker({
  currentSlug, onClose, onPick,
}: {
  currentSlug: string;
  onClose: () => void;
  onPick: (slug: string) => void;
}) {
  const { data, isLoading } = useSWR<DrawingListItem[]>("/api/drawings", fetcher);
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const items = (data ?? []).slice().sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
    if (!q) return items;
    return items.filter((d) => d.slug.toLowerCase().includes(q) || (d.title ?? "").toLowerCase().includes(q));
  }, [data, filter]);
  const createNew = () => {
    const raw = newName.trim();
    if (!raw) return;
    const safe = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
    if (!safe) return;
    const target = safe.startsWith("skill-") ? safe : `skill-${safe}`;
    onPick(target);
  };
  return (
    <div className="absolute inset-0 z-[80] flex">
      <button type="button" className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <aside className="w-[88vw] max-w-[380px] h-full bg-card border-l border-border/50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="inline-flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Notebooks</span>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 grid place-items-center rounded-md hover:bg-foreground/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-border/40 space-y-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search notebooks…"
            className="w-full h-9 px-3 rounded-md bg-foreground/5 border border-foreground/10 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createNew(); }}
              placeholder="New notebook (e.g. javascript)"
              className="flex-1 h-9 px-3 rounded-md bg-foreground/5 border border-foreground/10 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60"
            />
            <button
              type="button"
              onClick={createNew}
              disabled={!newName.trim()}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-1"
            >
              <Plus className="h-4 w-4" /> New
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {isLoading && <div className="px-4 py-6 text-xs text-muted-foreground font-mono">Loading…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="px-4 py-6 text-xs text-muted-foreground font-mono">No notebooks yet. Create one above.</div>
          )}
          {filtered.map((d) => {
            const display = d.slug.startsWith("skill-") ? d.slug.slice(6) : d.slug;
            const isCurrent = d.slug === currentSlug;
            return (
              <button
                key={d.slug}
                type="button"
                onClick={() => onPick(d.slug)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-border/30 hover:bg-foreground/5 ${
                  isCurrent ? "bg-primary/10" : ""
                }`}
              >
                <Pencil className={`h-4 w-4 shrink-0 ${isCurrent ? "text-primary" : "opacity-60"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{display}</div>
                  {d.category && <div className="text-[10px] font-mono text-muted-foreground uppercase">{d.category}</div>}
                </div>
                {isCurrent && <span className="text-[10px] font-mono text-primary">current</span>}
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
