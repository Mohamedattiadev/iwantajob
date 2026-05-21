"use client";

import dynamic from "next/dynamic";
import type * as React from "react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Maximize2, Minimize2, CheckCircle2,
  Sparkles, Link as LinkIcon, X,
  Map as MapIcon, ChevronDown, ChevronLeft, ChevronRight,
  MessageCircle, Download, Send,
  Eye, Pencil, Image as ImageIcon, FileCode, Copy,
  Network, ArrowDown, Columns3, Grid2x2, Play, Square,
  PanelRightOpen, ZoomIn, ZoomOut,
  Tablet, ExternalLink, Save, Users, ArrowLeft, RefreshCw,
} from "lucide-react";
import NextLink from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { API, fetcher } from "@/lib/api";
import useSWR from "swr";
import { TEMPLATES, TEMPLATE_META, type TemplateKey } from "@/lib/sketch-templates";
import { pickMinimapCornerStyle, shouldApplyIncomingScene, computeFitAllAppState } from "@/lib/sketch";
import { authHeaders, readSketchToken, appendTokenToUrl } from "@/lib/auth";
import "@excalidraw/excalidraw/index.css";

type AiStyle = "flowchart" | "mindmap" | "tree" | "sequence" | "comparison" | "matrix" | "swimlane" | "venn" | "freeform";

type ExcalMod = typeof import("@excalidraw/excalidraw");
let excalModPromise: Promise<ExcalMod> | null = null;
function loadExcal(): Promise<ExcalMod> {
  if (!excalModPromise) excalModPromise = import("@excalidraw/excalidraw");
  return excalModPromise;
}

const Excalidraw = dynamic(
  async () => (await loadExcal()).Excalidraw,
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

type DrawingDoc = {
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  title?: string;
};

function skillSlug(skill: string) {
  return skill.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}

const DEBOUNCE_MS = 2500;

type ExcalApi = {
  getSceneElements: () => readonly unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  updateScene: (data: { elements?: unknown[]; appState?: Record<string, unknown> }) => void;
  scrollToContent: (target?: unknown) => void;
  setActiveTool?: (tool: { type: string; locked?: boolean }) => void;
};

export function SkillSketch({ skill, homeHref, defaultFull = false }: { skill: string; homeHref?: string; defaultFull?: boolean }) {
  const slug = `skill-${skillSlug(skill)}`;
  const { data: doc, mutate } = useSWR<DrawingDoc>(`/api/drawings/${slug}`, fetcher);
  const { resolvedTheme } = useTheme();
  const [full, setFull] = useState(defaultFull);
  const [saved, setSaved] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiStyle, setAiStyle] = useState<AiStyle>("flowchart");
  const [aiBusy, setAiBusy] = useState(false);
  const [excalMod, setExcalMod] = useState<ExcalMod | null>(null);
  useEffect(() => { loadExcal().then(setExcalMod).catch(() => {}); }, []);
  // Toggle a root-level flag so global widgets (chat, todo drawer) can hide
  // themselves while the user is in immersive canvas mode.
  useEffect(() => {
    document.documentElement.classList.toggle("sketch-fullscreen", full);
    return () => { document.documentElement.classList.remove("sketch-fullscreen"); };
  }, [full]);

  // Frame-driven presentation mode: ←/→ cycles through frames, zooming each
  // into view like a slide. Esc exits. Pulled from getSceneElements so newly
  // added frames join the deck on the fly.
  const [presentIdx, setPresentIdx] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [slideFocus, setSlideFocus] = useState(false);
  const [penMode, setPenMode] = useState(false);
  const togglePen = useCallback(() => {
    const api = excalRef.current as (ExcalApi & { updateScene?: (d: { appState?: Record<string, unknown> }) => void }) | null;
    if (!api?.updateScene) return;
    const next = !penMode;
    setPenMode(next);
    api.updateScene({ appState: { penMode: next, penDetected: next } });
    toast.success(next ? "Pen mode on — palm rejection enabled" : "Pen mode off");
  }, [penMode]);
  const slideFocusRef = useRef(false);
  useEffect(() => { slideFocusRef.current = slideFocus; }, [slideFocus]);
  const presenting = presentIdx !== null;
  const showFrame = useCallback((idx: number) => {
    const api = excalRef.current;
    if (!api) return;
    const frames = (api.getSceneElements() as Array<Record<string, unknown>>).filter(
      (e) => e.type === "frame" && !e.isDeleted,
    );
    if (!frames.length) { toast.info("Add a Frame first (More tools → Frame)."); setPresentIdx(null); return; }
    const wrapped = ((idx % frames.length) + frames.length) % frames.length;
    setPresentIdx(wrapped);
    try {
      const opts = slideFocusRef.current
        ? { fitToViewport: true, viewportZoomFactor: 0.95, animate: true, duration: 300 }
        : { fitToContent: true, animate: true };
      (api.scrollToContent as unknown as (t: unknown, o?: unknown) => void)([frames[wrapped]], opts);
    } catch {}
  }, []);
  const toggleSlideFocus = useCallback(() => {
    setSlideFocus((v) => {
      const next = !v;
      slideFocusRef.current = next;
      if (presentIdx !== null) {
        // re-apply current frame with new zoom mode
        setTimeout(() => showFrame(presentIdx), 0);
      }
      return next;
    });
  }, [presentIdx, showFrame]);
  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPresentIdx(null); return; }
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); showFrame((presentIdx ?? 0) + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); showFrame((presentIdx ?? 0) - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, presentIdx, showFrame]);
  const [miniData, setMiniData] = useState<{ els: readonly unknown[]; app: Record<string, unknown> }>({ els: [], app: {} });
  // Seed the minimap from the loaded doc so it shows real geometry before
  // the user touches the canvas — otherwise the minimap reads 0 elements
  // on every fresh page load until the first onChange.
  useEffect(() => {
    if (!doc) return;
    const els = Array.isArray(doc.elements) ? doc.elements : [];
    setMiniData({ els: els as readonly unknown[], app: (doc.appState ?? {}) as Record<string, unknown> });
  }, [doc]);
  const [miniOpen, setMiniOpen] = useState(true);
  const last = useRef("");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excalRef = useRef<ExcalApi | null>(null);
  // Excalidraw consumes `initialData` only on mount, so if SWR returns the
  // doc AFTER mount (the SWRConfig dedupe + no-revalidate-on-focus path
  // makes this almost always the case on warm caches) the canvas stays
  // empty while the minimap, fed straight off `doc`, shows the full scene.
  // This effect pushes elements into Excalidraw exactly once per slug.
  const [excalReady, setExcalReady] = useState(false);
  const appliedFor = useRef<string>("");
  useEffect(() => {
    if (!doc || !excalReady) return;
    if (appliedFor.current === slug) return;
    appliedFor.current = slug;
    const api = excalRef.current;
    if (!api) return;
    const els = Array.isArray(doc.elements) ? doc.elements : [];
    try {
      (api.updateScene as (d: { elements?: unknown[] }) => void)({ elements: els as unknown[] });
    } catch {}
  }, [slug, doc, excalReady]);
  useEffect(() => { appliedFor.current = ""; }, [slug]);

  const initialData = useMemo(() => {
    if (!doc) return undefined;
    const rawEls = Array.isArray(doc.elements) ? doc.elements : [];
    const elements = (rawEls as Array<Record<string, unknown> | null | undefined>)
      .filter((el): el is Record<string, unknown> => !!el && typeof el === "object" && typeof el.type === "string");
    const src = (doc.appState ?? {}) as Record<string, unknown>;
    const SAFE_KEYS = [
      "viewBackgroundColor", "gridSize", "gridModeEnabled",
      "zoom", "scrollX", "scrollY", "zenModeEnabled",
      "currentItemStrokeColor", "currentItemBackgroundColor",
      "currentItemStrokeWidth", "currentItemRoughness", "currentItemOpacity",
      "currentItemFontFamily", "currentItemFontSize", "currentItemTextAlign",
      "currentItemStrokeStyle", "currentItemFillStyle",
    ] as const;
    const safeAppState: Record<string, unknown> = {};
    for (const k of SAFE_KEYS) if (src[k] !== undefined) safeAppState[k] = src[k];
    return {
      elements: elements as never,
      appState: { ...safeAppState, collaborators: new Map() } as never,
      files: (doc.files && typeof doc.files === "object" ? doc.files : {}) as never,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, !!doc]);

  const save = useCallback(async (payload: object) => {
    const body = JSON.stringify({ data: { ...payload, title: skill } });
    if (body === last.current) return;
    last.current = body;
    const r = await fetch(`${API}/api/drawings/${slug}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body,
    });
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); mutate(); }
  }, [skill, slug, mutate]);

  // Manual save: bypass the debounce + dedupe and force-flush the live scene.
  // Auto-save covers the happy path; this gives the user a recovery handle for
  // when the tab is about to crash or they want a guaranteed checkpoint.
  const [saving, setSaving] = useState(false);
  const manualSave = useCallback(async () => {
    const api = excalRef.current;
    if (!api) return;
    if (t.current) clearTimeout(t.current);
    setSaving(true);
    try {
      last.current = ""; // force PUT even if scene unchanged
      const body = JSON.stringify({
        data: {
          title: skill,
          elements: [...api.getSceneElements()],
          appState: api.getAppState(),
          files: api.getFiles(),
        },
      });
      const r = await fetch(`${API}/api/drawings/${slug}`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body,
      });
      if (!r.ok) throw new Error(`${r.status}`);
      last.current = body;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      mutate();
      toast.success("Saved");
    } catch (e) {
      toast.error("Save failed", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }, [skill, slug, mutate]);

  // Presence: heartbeat as host every 5s and poll counts so the iPad icon can
  // show a connection badge. Stable sessionId per tab so reloads don't spawn
  // ghost peers.
  type PresenceDevice = {
    userAgent?: string;
    platform?: string;
    screen?: string;
    pixelRatio?: number;
    language?: string;
    touch?: boolean;
    ip?: string;
    pin?: string;
  };
  type PadApproval = "pending" | "approved" | "denied";
  type PresencePad = { sessionId: string; approval: PadApproval; label?: string; ts: number; firstSeen?: number; device?: PresenceDevice };
  const [presence, setPresence] = useState<{ host: number; pad: number; viewer: number; total: number; pads: PresencePad[] }>({ host: 0, pad: 0, viewer: 0, total: 0, pads: [] });
  const slugRef = useRef(slug);
  useEffect(() => { slugRef.current = slug; }, [slug]);
  const sessionIdRef = useRef<string>("");
  const decidePad = useCallback(async (sessionId: string, next: "approved" | "denied") => {
    try {
      await fetch(`/api/presence/${encodeURIComponent(slugRef.current)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          sessionId,
          approval: next,
          hostSessionId: sessionIdRef.current,
        }),
      });
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sessionIdRef.current) {
      sessionIdRef.current = (crypto.randomUUID?.() ?? `s-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`);
    }
    const sid = sessionIdRef.current;
    const beat = async () => {
      try {
        const r = await fetch(`/api/presence/${encodeURIComponent(slug)}`, {
          method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ sessionId: sid, role: "host" }),
        });
        if (!r.ok) return;
        const j = (await r.json()) as typeof presence;
        setPresence(j);
        // Phase 1: surface every pending pad. Use sonner's `id` to dedupe
        // so re-polling doesn't stack toasts AND the toast can't be lost
        // by an accidental dismiss — every poll re-asserts it while the
        // pad is still pending.
        for (const p of j.pads ?? []) {
          if (p.approval !== "pending") continue;
          const padSid = p.sessionId;
          const d = p.device ?? {};
          const padLabel = p.label ?? "Tablet";
          const meta: string[] = [];
          if (d.ip) meta.push(d.ip);
          if (d.screen) meta.push(d.screen);
          if (d.language) meta.push(d.language);
          toast.custom(() => (
            <div className="rounded-xl border border-foreground/15 bg-card/95 backdrop-blur shadow-2xl w-[320px] p-4">
              <div className="flex items-start gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse mt-1.5" />
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Pair request
                  </div>
                  <div className="text-sm font-semibold mt-0.5">{padLabel}</div>
                </div>
              </div>
              {meta.length > 0 && (
                <div className="text-[11px] font-mono text-muted-foreground mb-3 truncate">
                  {meta.join(" · ")}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => decidePad(padSid, "denied")}
                  className="flex-1 px-3 py-2 rounded-md border border-foreground/15 text-xs hover:bg-foreground/5"
                >
                  Deny
                </button>
                <button
                  onClick={() => decidePad(padSid, "approved")}
                  className="flex-1 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold"
                >
                  Accept
                </button>
              </div>
            </div>
          ), { id: `req-${padSid}`, duration: Infinity });
        }
        // Dismiss request toasts for pads that left "pending" state.
        for (const p of j.pads ?? []) {
          if (p.approval !== "pending") toast.dismiss(`req-${p.sessionId}`);
        }
        // Dismiss request toasts for pads that vanished entirely.
        const live = new Set((j.pads ?? []).map((p) => p.sessionId));
        for (const p of j.pads ?? []) {
          if (!live.has(p.sessionId)) toast.dismiss(`req-${p.sessionId}`);
        }
      } catch {}
    };
    beat();
    const id = setInterval(beat, 4000);
    const onUnload = () => {
      // DELETE with keepalive is reliable on page hide in modern browsers
      // and avoids the prior POST-without-body which the route 400s on.
      try {
        fetch(`/api/presence/${encodeURIComponent(slug)}?sessionId=${encodeURIComponent(sid)}`, { method: "DELETE", keepalive: true }).catch(() => {});
      } catch {}
    };
    window.addEventListener("beforeunload", onUnload);
    return () => { clearInterval(id); window.removeEventListener("beforeunload", onUnload); onUnload(); };
  }, [slug, decidePad]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        manualSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [manualSave]);

  // Excalidraw's official collab pattern (lifted from
  // excalidraw-app/collab/Collab.tsx). One counter is shared between
  // outgoing broadcasts and incoming applies: we only emit when the
  // local scene version exceeds it, and we set it to the reconciled
  // version on every remote apply. That is the single source of truth
  // for "did anything actually change?" and replaces our home-grown
  // fingerprint + lastEditAt + applyingRemoteUntil heuristics.
  const excalModRef = useRef<ExcalMod | null>(null);
  useEffect(() => { excalModRef.current = excalMod; }, [excalMod]);
  const lastBroadcastedOrReceivedSceneVersion = useRef(-1);

  const miniThrottle = useRef(0);
  const lastEditAt = useRef(0);
  const lastSeenFingerprint = useRef("");
  const wsRef = useRef<WebSocket | null>(null);
  const wsSendThrottle = useRef(0);
  const pendingSend = useRef<{ elements: readonly unknown[]; bg?: string } | null>(null);
  const trailingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingRaf = useRef<number | null>(null);
  const incomingPending = useRef<unknown[] | null>(null);
  // Per-tab random senderId + monotonically increasing seq so peers
  // can drop their own loopbacks and out-of-order frames deterministically,
  // independent of timing heuristics. Survives the timing-window
  // edge cases that broke laptop→tablet sync.
  const senderId = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );
  const seqRef = useRef(0);
  const lastSeqBySender = useRef<Map<string, number>>(new Map());
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
  // Window during which onChange events are coming from updateScene-of-a-
  // remote-payload, not from local user input. See identical comment in
  // src/app/sketch/[slug]/page.tsx — without this guard, applying an
  // incoming WS scene would set lastEditAt = now, which then blocks the
  // very next incoming scene and breaks one-way sync after a single stroke.
  const applyingRemoteUntil = useRef(0);
  // Prevent stale save timers from a previous skill firing after navigation
  // and overwriting the new skill's data (or worse, the iPad's drawing on
  // the previous skill). Clear on slug change + on unmount.
  useEffect(() => {
    return () => {
      if (t.current) { clearTimeout(t.current); t.current = null; }
      last.current = "";
    };
  }, [slug]);
  // Realtime peer count from the WS room. When > 0 (iPad connected), the
  // laptop yields authorship: autosave PUTs paused + outgoing scene
  // broadcasts skipped. iPad becomes the sole writer to avoid table-overwrite
  // races. The laptop still RECEIVES iPad's scenes via WS to stay in view.
  const [livePeers, setLivePeers] = useState(0);
  const livePeersRef = useRef(0);
  useEffect(() => { livePeersRef.current = livePeers; }, [livePeers]);
  const onChange = useCallback((
    elements: readonly unknown[],
    appState: unknown,
    files: Record<string, unknown>,
  ) => {
    // Block save until the server's scene has been seen at least once.
    // Without this, Excalidraw's mount-time empty onChange would PUT empty
    // elements to the backend and wipe the drawing on every reload.
    if (!doc) return;
    // Also block until we've actually applied the server scene into
    // Excalidraw — otherwise the empty onChange that fires right before
    // `appliedFor` flips can race the apply and overwrite the doc.
    if (appliedFor.current !== slug) return;
    // Excalidraw's collab gate: only broadcast when the scene version
    // has actually advanced past what we last sent or received.
    // Echo from `updateScene({...captureUpdate: NEVER})` lands here
    // but with the same version we set on apply → return immediately.
    // Local mutation increments element.version → scene version
    // grows → we broadcast. Same counter for both directions = no
    // timing windows, no fingerprint heuristics.
    const mod = excalModRef.current;
    if (mod) {
      const sceneVersion = mod.getSceneVersion(elements as never);
      if (sceneVersion <= lastBroadcastedOrReceivedSceneVersion.current) {
        const now0 = Date.now();
        if (now0 - miniThrottle.current > 280) {
          miniThrottle.current = now0;
          setMiniData({ els: elements, app: appState as Record<string, unknown> });
        }
        return;
      }
      lastBroadcastedOrReceivedSceneVersion.current = sceneVersion;
    }
    lastEditAt.current = Date.now();
    if (t.current) clearTimeout(t.current);
    // Both sides autosave now — backend reconciles elements by (id, version)
    // so concurrent PUTs from laptop + tablet merge instead of overwriting.
    // This unblocks the "tablet save wipes laptop strokes" data loss path.
    t.current = setTimeout(() => {
      save({ elements: [...elements], appState: appState as Record<string, unknown>, files });
    }, DEBOUNCE_MS);
    const now = Date.now();
    if (now - miniThrottle.current > 280) {
      miniThrottle.current = now;
      setMiniData({ els: elements, app: appState as Record<string, unknown> });
    }
    // Outgoing broadcast stays on regardless of peers — iPad needs to see
    // laptop strokes too. Leading-edge 16ms + trailing flush so the final
    // stroke frame always lands on the receiver (the missing trailing send
    // is what made remote rendering feel choppy).
    const bg = (appState as { viewBackgroundColor?: string })?.viewBackgroundColor;
    pendingSend.current = { elements, bg };
    // 16ms ≈ 60 msg/s. With seq-based dedup the receiver discards
    // out-of-order frames, so a higher rate doesn't risk deadlocks
    // — it just lets fast Apple-Pencil strokes paint smoothly on
    // the laptop. Trailing flush keeps the final frame.
    if (now - wsSendThrottle.current >= 16 && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      flushPending();
    } else if (!trailingTimer.current) {
      const wait = Math.max(4, 16 - (now - wsSendThrottle.current));
      trailingTimer.current = setTimeout(() => {
        trailingTimer.current = null;
        flushPending();
      }, wait);
    }
  }, [save, flushPending]);

  // Realtime collab WebSocket — pairs with the FastAPI `/ws/drawings/{slug}`
  // room. Outgoing throttled (~150ms); incoming applied via updateScene
  // unless the local pointer is mid-stroke.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.hostname;
    const tok = readSketchToken();
    // Backend WS port — env-driven so deployments not on :8000 don't
    // have to fork the client. Defaults to 8000 (FastAPI dev port).
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
          const msg = JSON.parse(ev.data) as { type: string; elements?: unknown[]; count?: number; senderId?: string; seq?: number };
          if (msg.type === "peers") {
            // Subtract 1 because the server counts ourselves in the room.
            setLivePeers(Math.max(0, (msg.count ?? 1) - 1));
            return;
          }
          if (msg.type !== "scene" || !Array.isArray(msg.elements)) return;
          // Drop own loopback frames (server should already skip the
          // sender; defense in depth) and stale/out-of-order frames
          // from any peer.
          if (msg.senderId === senderId.current) return;
          if (msg.senderId && typeof msg.seq === "number") {
            const last = lastSeqBySender.current.get(msg.senderId) ?? 0;
            if (msg.seq <= last) return;
            lastSeqBySender.current.set(msg.senderId, msg.seq);
          }
          const api = excalRef.current;
          if (!api) return;
          if (!shouldApplyIncomingScene(Date.now(), lastEditAt.current)) return;
          // Coalesce bursty incoming scenes (iPad sends ~60/s during a
          // stroke) into one updateScene per animation frame.
          incomingPending.current = msg.elements;
          if (incomingRaf.current != null) return;
          incomingRaf.current = requestAnimationFrame(() => {
            incomingRaf.current = null;
            const next = incomingPending.current;
            incomingPending.current = null;
            if (!next) return;
            const a = excalRef.current;
            if (!a) return;
            const mod = excalModRef.current;
            // Reconcile remote against local using Excalidraw's own
            // function (higher version wins, lower versionNonce
            // tiebreak). Apply with `captureUpdate: NEVER` so the
            // remote update doesn't land on undo stack and so it
            // doesn't echo back into our local onChange as a "real"
            // edit. Bump the shared scene-version counter so the
            // resulting onChange short-circuits.
            try {
              if (mod) {
                const local = a.getSceneElements() as never;
                const appState = a.getAppState() as never;
                const reconciled = mod.reconcileElements(local, next as never, appState);
                (a.updateScene as unknown as (d: { elements?: unknown[]; captureUpdate?: string }) => void)({
                  elements: reconciled as unknown as unknown[],
                  captureUpdate: mod.CaptureUpdateAction.NEVER,
                });
                lastBroadcastedOrReceivedSceneVersion.current = mod.getSceneVersion(reconciled as never);
              } else {
                (a.updateScene as unknown as (d: { elements?: unknown[] }) => void)({ elements: next });
              }
            } catch {}
          });
        } catch {}
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
  }, [slug]);

  // rAF-coalesce pan updates so a 60Hz drag doesn't trigger 60
  // React renders — the per-stroke jitter that made the minimap
  // feel clunky.
  const miniNavPending = useRef<{ wx: number; wy: number } | null>(null);
  const miniNavRaf = useRef<number | null>(null);
  const onMiniNav = (worldX: number, worldY: number) => {
    miniNavPending.current = { wx: worldX, wy: worldY };
    if (miniNavRaf.current != null) return;
    miniNavRaf.current = requestAnimationFrame(() => {
      miniNavRaf.current = null;
      const pending = miniNavPending.current;
      miniNavPending.current = null;
      if (!pending) return;
      const api = excalRef.current as (ExcalApi & {
        updateScene?: (d: { appState?: Record<string, unknown> }) => void;
      }) | null;
      if (!api) return;
      const app = api.getAppState() as { width?: number; height?: number; zoom?: { value?: number } };
      const zoom = app.zoom?.value ?? 1;
      const w = app.width ?? 0;
      const h = app.height ?? 0;
      api.updateScene({
        appState: {
          scrollX: -(pending.wx - (w / zoom) / 2),
          scrollY: -(pending.wy - (h / zoom) / 2),
        },
      });
    });
  };
  // Wheel-zoom on the minimap: anchor zoom around the pointer's world
  // position so the point under the cursor stays put (Figma/Photoshop
  // behavior). Without this, wheel just panned the canvas, which is
  // never what you want from a minimap.
  const onMiniZoom = (worldX: number, worldY: number, deltaY: number) => {
    const api = excalRef.current;
    if (!api) return;
    const app = api.getAppState() as { width?: number; height?: number; zoom?: { value?: number } };
    const w = app.width ?? 0;
    const h = app.height ?? 0;
    const curZoom = app.zoom?.value ?? 1;
    // Exponential zoom step — matches Excalidraw's pinch feel.
    const factor = Math.exp(-deltaY * 0.0015);
    const nextZoom = Math.max(0.1, Math.min(8, curZoom * factor));
    if (nextZoom === curZoom) return;
    api.updateScene({
      appState: {
        zoom: { value: nextZoom },
        scrollX: -(worldX - (w / nextZoom) / 2),
        scrollY: -(worldY - (h / nextZoom) / 2),
      },
    });
  };


  const reset = async () => {
    if (!confirm(`Clear all elements on ${skill} sketch?`)) return;
    await fetch(`${API}/api/drawings/${slug}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ data: { title: skill, elements: [], appState: {}, files: {} } }),
    });
    last.current = "";
    mutate();
  };

  // Compute bbox of existing elements (skipping deleted/missing dims) so we can
  // offset inserts to empty space and avoid the scrambled stack we got before.
  const sceneBBox = (els: readonly unknown[]) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const raw of els) {
      const e = raw as { x?: number; y?: number; width?: number; height?: number; isDeleted?: boolean } | null;
      if (!e || e.isDeleted) continue;
      if (typeof e.x !== "number" || typeof e.y !== "number") continue;
      const w = typeof e.width === "number" ? e.width : 0;
      const h = typeof e.height === "number" ? e.height : 0;
      minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x + w); maxY = Math.max(maxY, e.y + h);
    }
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  };

  // Normalize skeleton through Excalidraw's converter, then translate so it
  // sits to the right of existing content (or at viewport center if empty).
  const addElements = async (skeleton: readonly unknown[]) => {
    const api = excalRef.current;
    if (!api) return toast.error("Canvas not ready");
    const mod = await loadExcal();
    const conv = (mod as unknown as {
      convertToExcalidrawElements: (els: unknown[], opts?: { regenerateIds?: boolean }) => unknown[]
    }).convertToExcalidrawElements;
    const fresh = conv ? conv(skeleton as unknown[], { regenerateIds: true }) as Array<Record<string, unknown>>
                       : (skeleton as Array<Record<string, unknown>>);
    if (fresh.length === 0) return 0;

    // Translate so top-left of new batch lands in an empty area.
    const freshBBox = sceneBBox(fresh);
    if (freshBBox) {
      const current = api.getSceneElements();
      const sceneBB = sceneBBox(current);
      const appState = api.getAppState() as { scrollX?: number; scrollY?: number; width?: number; height?: number; zoom?: { value?: number } };
      let targetX: number, targetY: number;
      if (sceneBB) {
        targetX = sceneBB.maxX + 80; // park to right of existing
        targetY = sceneBB.minY;
      } else if (typeof appState.scrollX === "number" && typeof appState.width === "number") {
        const zoom = appState.zoom?.value ?? 1;
        targetX = -appState.scrollX + (appState.width / zoom) / 2 - (freshBBox.maxX - freshBBox.minX) / 2;
        targetY = -(appState.scrollY ?? 0) + ((appState.height ?? 0) / zoom) / 2 - (freshBBox.maxY - freshBBox.minY) / 2;
      } else {
        targetX = 100; targetY = 100;
      }
      const dx = targetX - freshBBox.minX;
      const dy = targetY - freshBBox.minY;
      for (const el of fresh) {
        if (typeof el.x === "number") el.x = (el.x as number) + dx;
        if (typeof el.y === "number") el.y = (el.y as number) + dy;
      }
    }

    const current = api.getSceneElements();
    api.updateScene({ elements: [...(current as unknown[]), ...fresh] });
    try { api.scrollToContent(fresh as never); } catch {}
    return fresh.length;
  };

  const insertTemplate = async (key: TemplateKey) => {
    const skeleton = TEMPLATES[key]();
    const n = await addElements(skeleton);
    if (typeof n === "number") toast.success(`${TEMPLATE_META[key].label} inserted`);
  };

  const runAiGenerate = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    const api = excalRef.current;
    if (!api) { toast.error("Canvas not ready"); return; }
    setAiBusy(true);
    try {
      const r = await fetch(`${API}/api/sketch/generate`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ prompt, style: aiStyle, skill }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `${r.status}`);
      const els = d.elements as unknown[];
      if (!Array.isArray(els) || els.length === 0) throw new Error("AI returned no elements");
      const n = await addElements(els);
      if (typeof n === "number") toast.success(`Added ${n} element${n > 1 ? "s" : ""}`);
      setAiOpen(false);
      setAiPrompt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setAiBusy(false);
    }
  };

  const copyShareLink = async (mode: "view" | "edit" = "view") => {
    const url = appendTokenToUrl(`${window.location.origin}/sketch/${slug}${mode === "edit" ? "?mode=edit" : ""}`);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${mode === "edit" ? "Editor" : "Viewer"} link copied`, { description: url });
    } catch {
      toast.error("Clipboard blocked");
    }
  };

  const exportPng = async () => {
    const api = excalRef.current;
    if (!api) return toast.error("Canvas not ready");
    const { exportToBlob } = await loadExcal();
    const blob = await exportToBlob({
      elements: api.getSceneElements() as never,
      appState: { ...api.getAppState(), exportWithDarkMode: resolvedTheme === "dark" } as never,
      files: api.getFiles() as never,
      mimeType: "image/png",
    });
    triggerDownload(blob, `${skill}-sketch.png`);
  };

  const exportPptx = async () => {
    const api = excalRef.current;
    if (!api) return toast.error("Canvas not ready");
    const els = api.getSceneElements() as Array<Record<string, unknown>>;
    const frames = els.filter((e) => e.type === "frame" && !e.isDeleted);
    if (!frames.length) { toast.info("Add at least one Frame first."); return; }
    const tid = toast.loading(`Exporting ${frames.length} slide${frames.length === 1 ? "" : "s"}…`);
    try {
      const [{ exportToBlob }, { default: PptxGenJS }] = await Promise.all([
        loadExcal(),
        import("pptxgenjs"),
      ]);
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE"; // 13.333" × 7.5"
      const slideW = 13.333;
      const slideH = 7.5;
      for (const frame of frames) {
        const blob = await exportToBlob({
          elements: els as never,
          appState: {
            ...api.getAppState(),
            exportWithDarkMode: resolvedTheme === "dark",
            exportScale: 3,
            exportEmbedScene: false,
          } as never,
          files: api.getFiles() as never,
          mimeType: "image/png",
          exportingFrame: frame as never,
          // Force-render at 3840px on the long edge for crisp PPTX slides.
          getDimensions: (w: number, h: number) => {
            const max = 3840;
            const scale = Math.min(max / w, max / h, 3);
            return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
          },
        } as never);
        const dataUrl: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onloadend = () => res(String(r.result));
          r.onerror = rej;
          r.readAsDataURL(blob);
        });
        const slide = pptx.addSlide();
        slide.background = { color: resolvedTheme === "dark" ? "1B1B1F" : "FFFFFF" };
        slide.addImage({
          data: dataUrl,
          x: 0.25, y: 0.25,
          w: slideW - 0.5, h: slideH - 0.5,
          sizing: { type: "contain", w: slideW - 0.5, h: slideH - 0.5 },
        });
      }
      await pptx.writeFile({ fileName: `${skill}-slides.pptx` });
      toast.success(`Exported ${frames.length} slide${frames.length === 1 ? "" : "s"}`, { id: tid });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PPTX export failed", { id: tid });
    }
  };

  const exportSvg = async () => {
    const api = excalRef.current;
    if (!api) return toast.error("Canvas not ready");
    const { exportToSvg } = await loadExcal();
    const svg = await exportToSvg({
      elements: api.getSceneElements() as never,
      appState: api.getAppState() as never,
      files: api.getFiles() as never,
    });
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    triggerDownload(blob, `${skill}-sketch.svg`);
  };

  const copyShareJson = async () => {
    const api = excalRef.current;
    if (!api) return toast.error("Canvas not ready");
    const scene = {
      type: "excalidraw", version: 2, source: "iwantajob",
      elements: api.getSceneElements(),
      appState: { viewBackgroundColor: api.getAppState().viewBackgroundColor ?? "#ffffff" },
      files: api.getFiles(),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(scene));
      toast.success("Scene JSON copied");
    } catch {
      toast.error("Clipboard blocked. Use PNG/SVG export.");
    }
  };

  return (
    <div className={full ? "fixed inset-0 z-50 bg-background p-3 flex flex-col gap-2" : "flex flex-col gap-2"}>
      {!full && (
        <div className="flex items-center gap-3 text-xs">
          {homeHref && (
            <NextLink
              href={homeHref}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </NextLink>
          )}
          <span className="text-muted-foreground">
            Sketch · {livePeers > 0 ? `live · ${livePeers} peer${livePeers === 1 ? "" : "s"}` : "auto-saves"}
          </span>
          <button
            type="button"
            onClick={manualSave}
            disabled={saving}
            title="Force save now (Ctrl/Cmd+S)"
            className="inline-flex items-center gap-1 rounded-md border border-foreground/15 px-2 py-1 hover:bg-foreground/5 disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            <span>{saving ? "Saving…" : "Save"}</span>
          </button>
          {saved && <span className="inline-flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3 w-3" /> saved</span>}
          {presence.pad > 0 && (
            <span className="inline-flex items-center gap-1 text-[#6965db]" title={`${presence.pad} iPad${presence.pad === 1 ? "" : "s"} connected`}>
              <Tablet className="h-3 w-3" /> {presence.pad}
            </span>
          )}
          {presence.viewer > 0 && (
            <span className="inline-flex items-center gap-1 text-muted-foreground" title={`${presence.viewer} viewer${presence.viewer === 1 ? "" : "s"}`}>
              <Users className="h-3 w-3" /> {presence.viewer}
            </span>
          )}
        </div>
      )}

      <div className={`relative rounded-xl overflow-hidden border border-foreground/10 bg-card ${full ? "flex-1" : "h-[70vh]"}`}>
        <Excalidraw
          key={slug}
          initialData={initialData}
          onChange={onChange}
          theme={resolvedTheme === "light" ? "light" : "dark"}
          aiEnabled={false}
          excalidrawAPI={(api) => { excalRef.current = api as ExcalApi; setExcalReady(true); }}
        >
          {excalMod && (() => {
            const MM = excalMod.MainMenu as unknown as React.ComponentType<{ children?: React.ReactNode }> & {
              Item: React.ComponentType<{ onSelect?: () => void; icon?: React.ReactNode; shortcut?: string; children?: React.ReactNode }>;
              ItemLink: React.ComponentType<{ href: string; icon?: React.ReactNode; children?: React.ReactNode }>;
              Separator: React.ComponentType;
              Group: React.ComponentType<{ title?: string; children?: React.ReactNode }>;
              DefaultItems: {
                ToggleTheme: React.ComponentType;
                ChangeCanvasBackground: React.ComponentType;
                SearchMenu: React.ComponentType;
                Help: React.ComponentType;
                LoadScene: React.ComponentType;
                ClearCanvas: React.ComponentType;
                SaveAsImage: React.ComponentType;
              };
            };
            return (
              <MM>
                {homeHref && (
                  <>
                    <MM.ItemLink href={homeHref} icon={<ArrowLeft style={{ width: 14, height: 14 }} />}>
                      Home
                    </MM.ItemLink>
                    <MM.Separator />
                  </>
                )}
                <MM.DefaultItems.SearchMenu />
                <MM.DefaultItems.LoadScene />
                <MM.DefaultItems.SaveAsImage />
                <MM.DefaultItems.Help />
                <MM.Separator />
                <MM.DefaultItems.ChangeCanvasBackground />
                <MM.DefaultItems.ToggleTheme />
                <MM.Separator />
                <MM.DefaultItems.ClearCanvas />
              </MM>
            );
          })()}
        </Excalidraw>
        <ShapeIslandTools
          onAi={() => setAiOpen(true)}
          onChat={() => setChatOpen(true)}
          onTemplate={insertTemplate}
          onExportPng={exportPng}
          onExportSvg={exportSvg}
          onCopyJson={copyShareJson}
          full={full}
          onToggleFull={() => setFull((v) => !v)}
          framesCount={miniData.els.filter((e) => (e as { type?: string }).type === "frame" && !(e as { isDeleted?: boolean }).isDeleted).length}
          presenting={presenting}
          onPresentToggle={() => {
            if (presenting) { setPresentIdx(null); setPreviewOpen(false); return; }
            const api = excalRef.current;
            if (!api) { toast.info("Canvas not ready yet."); return; }
            const frames = (api.getSceneElements() as Array<Record<string, unknown>>)
              .filter((e) => e.type === "frame" && !e.isDeleted);
            if (!frames.length) {
              toast.info("Add a Frame first (More tools → Frame), then press Play.");
              setPreviewOpen(true);
              return;
            }
            // Open the preview panel AND start on frame 0. Was: only
            // opened the panel and waited for the user to click a
            // thumbnail — which is the "start button does nothing"
            // bug reported.
            setPreviewOpen(true);
            showFrame(0);
          }}
          penOn={penMode}
          onTogglePen={togglePen}
          padUrl={typeof window !== "undefined" ? appendTokenToUrl(`${window.location.origin}/sketch/${slug}?mode=edit&pen=1`) : ""}
          padCount={presence.pad}
          viewerCount={presence.viewer}
          pendingPads={presence.pads}
          onApprovePad={(sid) => decidePad(sid, "approved")}
          onDenyPad={(sid) => decidePad(sid, "denied")}
          onSave={manualSave}
          saving={saving}
          savedTick={saved}
        />
        {/* Share button removed — realtime WS sync replaces link sharing.
            The iPad dropdown (in TopRightTools) still shows the QR for
            opening on tablet. */}
        {previewOpen && (
          <PresentPreviewPanel
            elements={miniData.els}
            activeIdx={presentIdx}
            onJump={(i) => showFrame(i)}
            onExportPptx={exportPptx}
            onClose={() => setPreviewOpen(false)}
          />
        )}
        {presenting && (
          <PresentOverlay
            index={presentIdx ?? 0}
            onPrev={() => showFrame((presentIdx ?? 0) - 1)}
            onNext={() => showFrame((presentIdx ?? 0) + 1)}
            onExit={() => setPresentIdx(null)}
            onTogglePanel={() => setPreviewOpen((v) => !v)}
            panelOpen={previewOpen}
            onToggleFocus={toggleSlideFocus}
            focused={slideFocus}
          />
        )}
        <Minimap
          elements={miniData.els}
          appState={miniData.app}
          open={miniOpen}
          onToggle={() => setMiniOpen((v) => !v)}
          onNavigate={onMiniNav}
          onZoom={onMiniZoom}
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
              (api.updateScene as (d: { appState?: Record<string, unknown> }) => void)({
                appState: { zoom: { value: next.zoom }, scrollX: next.scrollX, scrollY: next.scrollY },
              });
            } catch {}
          }}
        />
        {chatOpen && (
          <SketchChatPanel
            skill={skill}
            getElements={() => excalRef.current?.getSceneElements() ?? []}
            onFocusElement={(id) => {
              const api = excalRef.current;
              if (!api) return;
              const el = (api.getSceneElements() as Array<Record<string, unknown>>).find((e) => e.id === id);
              if (el) { try { api.scrollToContent([el] as never); } catch {} }
            }}
            onClose={() => setChatOpen(false)}
          />
        )}
        {aiOpen && (
          <AiPromptDialog
            value={aiPrompt}
            onChange={setAiPrompt}
            style={aiStyle}
            onStyle={setAiStyle}
            busy={aiBusy}
            onClose={() => { if (!aiBusy) setAiOpen(false); }}
            onSubmit={runAiGenerate}
            skill={skill}
          />
        )}
      </div>
    </div>
  );
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function SketchPreloader() {
  useEffect(() => { loadExcal().catch(() => {}); }, []);
  return null;
}

// Watches the DOM for Excalidraw's shape-island toolbar, then portals our
// AI/Chat/Templates/Share/Export buttons inside it so they read as one bar.
function ShapeIslandTools(props: React.ComponentProps<typeof TopRightTools>) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let mine: HTMLDivElement | null = null;
    const attach = () => {
      // Prefer the inner content row so we sit alongside shape buttons. Fall
      // back to the outer toolbar if the inner is missing on mobile.
      // The shape buttons live in a horizontal Stack inside `.App-toolbar`.
      // `.App-toolbar` itself is a flex column (hint text above buttons), so
      // appending there drops us underneath. Inject inside the Stack so we sit
      // on the same row as the shape buttons.
      const island =
        document.querySelector(".excalidraw .App-toolbar .Stack_horizontal") ||
        document.querySelector(".excalidraw .App-toolbar-content") ||
        document.querySelector(".excalidraw .App-toolbar");
      if (!island) return;
      if (mine && island.contains(mine)) return;
      mine?.remove();
      const el = document.createElement("div");
      el.className = "excal-tools excal-tools-inline";
      island.appendChild(el);
      mine = el;
      setHost(el);
    };
    attach();
    const obs = new MutationObserver(() => attach());
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { obs.disconnect(); mine?.remove(); setHost(null); };
  }, []);

  if (!host) return null;
  return createPortal(<TopRightTools {...props} />, host);
}

function TopRightTools({
  onAi, onChat, onTemplate, onExportPng, onExportSvg, onCopyJson,
  full, onToggleFull, framesCount, presenting, onPresentToggle,
  penOn, onTogglePen, padUrl, padCount, viewerCount, onSave, saving, savedTick,
  pendingPads, onApprovePad, onDenyPad,
}: {
  onAi: () => void;
  onChat: () => void;
  onTemplate: (k: TemplateKey) => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onCopyJson: () => void;
  full: boolean;
  onToggleFull: () => void;
  framesCount: number;
  presenting: boolean;
  onPresentToggle: () => void;
  penOn: boolean;
  onTogglePen: () => void;
  padUrl: string;
  padCount: number;
  viewerCount: number;
  onSave: () => void;
  saving: boolean;
  savedTick: boolean;
  pendingPads: Array<{ sessionId: string; approval: "pending" | "approved" | "denied"; label?: string; device?: { ip?: string; screen?: string; language?: string } }>;
  onApprovePad: (sessionId: string) => void;
  onDenyPad: (sessionId: string) => void;
}) {
  const [open, setOpen] = useState<null | "ai" | "export" | "pad">(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(null);
    window.addEventListener("click", onDoc);
    return () => window.removeEventListener("click", onDoc);
  }, [open]);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div onClick={stop} className="excal-tools inline-flex items-center gap-1">
      <button
        onClick={onSave}
        disabled={saving}
        className={`excal-btn ${savedTick ? "excal-btn-active" : ""}`}
        title={saving ? "Saving…" : "Save now (Ctrl/Cmd+S)"}
      >
        {savedTick
          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          : <Save className="h-3.5 w-3.5" />}
      </button>
      <ExcalDropdown
        label="AI & templates"
        icon={<Sparkles className="h-3.5 w-3.5" />}
        primary
        open={open === "ai"}
        onToggle={() => setOpen(open === "ai" ? null : "ai")}
      >
        <li className="excal-popover-section">AI</li>
        <ExcalDropdownItem icon={<Sparkles className="h-4 w-4" />}      label="AI generate"   hint="prompt → diagram" onClick={() => { onAi(); setOpen(null); }} />
        <ExcalDropdownItem icon={<MessageCircle className="h-4 w-4" />} label="Ask AI"        hint="chat about scene"  onClick={() => { onChat(); setOpen(null); }} />
        <li className="excal-popover-section">Templates</li>
        <ExcalDropdownItem icon={<Network className="h-4 w-4" />}   label="Mind map"  hint="branches"  onClick={() => { onTemplate("mindmap"); setOpen(null); }} />
        <ExcalDropdownItem icon={<ArrowDown className="h-4 w-4" />} label="Flowchart" hint="top-down"  onClick={() => { onTemplate("flowchart"); setOpen(null); }} />
        <ExcalDropdownItem icon={<Columns3 className="h-4 w-4" />}  label="Kanban"    hint="3 columns" onClick={() => { onTemplate("kanban"); setOpen(null); }} />
        <ExcalDropdownItem icon={<Grid2x2 className="h-4 w-4" />}   label="SWOT"      hint="2×2 grid"  onClick={() => { onTemplate("swot"); setOpen(null); }} />
      </ExcalDropdown>
      {framesCount > 0 && (
        <button
          onClick={onPresentToggle}
          title={presenting ? "Stop presenting (Esc)" : `Present ${framesCount} frame${framesCount === 1 ? "" : "s"} · → advance · Esc exit`}
          className={`excal-btn ${presenting ? "excal-btn-active" : ""}`}
        >
          {presenting ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          <span className="ml-1 font-mono text-[10px] opacity-70">{framesCount}</span>
        </button>
      )}
      <ExcalDropdown
        label="Export"
        icon={<Download className="h-3.5 w-3.5" />}
        open={open === "export"}
        onToggle={() => setOpen(open === "export" ? null : "export")}
      >
        <ExcalDropdownItem icon={<ImageIcon className="h-4 w-4" />} label="Export as PNG" onClick={() => { onExportPng(); setOpen(null); }} />
        <ExcalDropdownItem icon={<FileCode className="h-4 w-4" />}  label="Export as SVG" onClick={() => { onExportSvg(); setOpen(null); }} />
        <ExcalDropdownItem icon={<Copy className="h-4 w-4" />}      label="Copy scene JSON" onClick={() => { onCopyJson(); setOpen(null); }} />
      </ExcalDropdown>
      <ExcalDropdown
        label="iPad & pen"
        icon={<Tablet className="h-3.5 w-3.5" />}
        open={open === "pad"}
        onToggle={() => setOpen(open === "pad" ? null : "pad")}
        badge={padCount > 0 ? padCount : viewerCount > 0 ? viewerCount : 0}
        badgeTone={padCount > 0 ? "live" : "muted"}
      >
        <PadPanel
          penOn={penOn}
          onTogglePen={onTogglePen}
          url={padUrl}
          padCount={padCount}
          viewerCount={viewerCount}
          pendingPads={pendingPads}
          onApprovePad={onApprovePad}
          onDenyPad={onDenyPad}
        />
      </ExcalDropdown>
      <button onClick={onToggleFull} className="excal-btn" title={full ? "Exit fullscreen (F)" : "Fullscreen (F)"}>
        {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// Portal share button into Excalidraw's native sidebar-triggers cluster so it
// sits in a single horizontal bar alongside the Library trigger.
function FloatingShare({
  onShareView, onShareEdit,
}: { onShareView: () => void; onShareEdit: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let mine: HTMLDivElement | null = null;
    const attach = () => {
      // Restrict to the OUTER top-right cluster. When the sidebar opens,
      // Excalidraw re-renders a second `.sidebar-triggers` inside the sidebar
      // header — we don't want our button to hop in there.
      const cluster =
        document.querySelector(".excalidraw .layer-ui__wrapper__top-right .sidebar-triggers") ||
        document.querySelector(".excalidraw .layer-ui__wrapper__top-right");
      if (!cluster) return;
      if (mine && cluster.contains(mine)) return;
      mine?.remove();
      const el = document.createElement("div");
      el.className = "excal-share-inline";
      cluster.appendChild(el);
      mine = el;
      setHost(el);
    };
    attach();
    const obs = new MutationObserver(() => attach());
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { obs.disconnect(); mine?.remove(); setHost(null); };
  }, []);
  if (!host) return null;
  return createPortal(<ShareControl onShareView={onShareView} onShareEdit={onShareEdit} />, host);
}

function ShareControl({
  onShareView, onShareEdit,
}: { onShareView: () => void; onShareEdit: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(false);
    window.addEventListener("click", onDoc);
    return () => window.removeEventListener("click", onDoc);
  }, [open]);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="excal-share-cluster" onClick={stop}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`excal-share-btn ${open ? "excal-btn-active" : ""}`}
        title="Share sketch"
      >
        <LinkIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="excal-popover">
          <ul className="py-0">
            <li className="excal-popover-section">Share</li>
            <ExcalDropdownItem icon={<Eye className="h-4 w-4" />}    label="Share as viewer" hint="read-only" onClick={() => { onShareView(); setOpen(false); }} />
            <ExcalDropdownItem icon={<Pencil className="h-4 w-4" />} label="Share as editor" hint="can edit"  onClick={() => { onShareEdit(); setOpen(false); }} />
          </ul>
        </div>
      )}
    </div>
  );
}

type FrameEl = { id: string; type: string; x: number; y: number; width: number; height: number; name?: string; isDeleted?: boolean };
type SceneEl = { id?: string; type?: string; x?: number; y?: number; width?: number; height?: number; frameId?: string | null; isDeleted?: boolean; strokeColor?: string };

function PresentPreviewPanel({
  elements, activeIdx, onJump, onExportPptx, onClose,
}: {
  elements: readonly unknown[];
  activeIdx: number | null;
  onJump: (i: number) => void;
  onExportPptx: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const frames = useMemo(() => {
    return (elements as SceneEl[])
      .filter((e): e is FrameEl =>
        !!e && e.type === "frame" && !e.isDeleted &&
        typeof e.x === "number" && typeof e.y === "number" &&
        typeof e.width === "number" && typeof e.height === "number")
      .map((f, i) => ({ frame: f, idx: i }));
  }, [elements]);

  // Group non-frame elements by which frame contains them (frameId or
  // center-in-bbox fallback) so each thumbnail renders only its slide.
  const childrenByFrame = useMemo(() => {
    const map = new Map<string, SceneEl[]>();
    for (const f of frames) map.set(f.frame.id, []);
    for (const raw of elements as SceneEl[]) {
      if (!raw || raw.isDeleted || raw.type === "frame") continue;
      if (typeof raw.x !== "number" || typeof raw.y !== "number") continue;
      if (raw.frameId && map.has(raw.frameId)) {
        map.get(raw.frameId)!.push(raw);
        continue;
      }
      const cx = raw.x + (raw.width ?? 0) / 2;
      const cy = raw.y + (raw.height ?? 0) / 2;
      for (const { frame: f } of frames) {
        if (cx >= f.x && cx <= f.x + f.width && cy >= f.y && cy <= f.y + f.height) {
          map.get(f.id)!.push(raw);
          break;
        }
      }
    }
    return map;
  }, [elements, frames]);

  return (
    <div className="excal-ai-panel absolute top-0 right-0 bottom-0 z-50 w-[340px] max-w-full flex flex-col animate-in slide-in-from-right duration-150">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--default-border-color,rgba(127,127,127,0.15))] shrink-0">
        <div className="inline-flex items-center gap-2">
          <span className="grid place-items-center h-7 w-7 rounded-md bg-[#6965db] text-white">
            <Play className="h-3.5 w-3.5 fill-current" />
          </span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Slides</h3>
            <p className="text-[10px] opacity-60 leading-tight font-mono">{frames.length} frame{frames.length === 1 ? "" : "s"} · click to present</p>
          </div>
        </div>
        <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-md opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {frames.length === 0 && (
          <p className="text-[12px] opacity-60 px-2 py-6 text-center">No frames yet. Add a Frame via the canvas&apos; More tools menu.</p>
        )}
        {frames.map(({ frame, idx }) => {
          const kids = childrenByFrame.get(frame.id) ?? [];
          const active = idx === activeIdx;
          return (
            <button
              key={frame.id}
              onClick={() => onJump(idx)}
              className={`w-full text-left rounded-lg border p-2 transition-colors ${
                active
                  ? "border-[#6965db] bg-[#6965db]/10"
                  : "border-[var(--default-border-color,rgba(127,127,127,0.18))] hover:border-[#6965db]/50"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono uppercase opacity-70">
                <span>slide {idx + 1}</span>
                <span className="truncate ml-2">{frame.name || `frame ${idx + 1}`}</span>
              </div>
              <FrameThumb frame={frame} kids={kids} />
            </button>
          );
        })}
      </div>
      <div className="px-3 py-3 border-t border-[var(--default-border-color,rgba(127,127,127,0.15))] shrink-0">
        <button
          onClick={() => frames.length && onJump(0)}
          disabled={frames.length === 0}
          className="w-full h-9 rounded-md inline-flex items-center justify-center gap-1.5 bg-[#6965db] text-white text-xs font-semibold hover:bg-[#5b57d4] disabled:opacity-40 transition-colors"
        >
          <Play className="h-3.5 w-3.5 fill-current" /> Start presentation
        </button>
        <button
          onClick={onExportPptx}
          disabled={frames.length === 0}
          className="mt-2 w-full h-8 rounded-md inline-flex items-center justify-center gap-1.5 border border-[var(--default-border-color,rgba(127,127,127,0.2))] text-[11px] font-medium hover:border-[#6965db]/50 disabled:opacity-40 transition-colors"
        >
          <Download className="h-3.5 w-3.5" /> Export as PPTX
        </button>
        <p className="mt-1.5 text-center text-[10px] opacity-50 font-mono">→ next · ← prev · Esc exit</p>
      </div>
    </div>
  );
}

function PadPanel({ penOn, onTogglePen, url, padCount, viewerCount, pendingPads, onApprovePad, onDenyPad }: {
  penOn: boolean; onTogglePen: () => void; url: string; padCount: number; viewerCount: number;
  pendingPads: Array<{ sessionId: string; approval: "pending" | "approved" | "denied"; label?: string; device?: { ip?: string; screen?: string; language?: string } }>;
  onApprovePad: (sessionId: string) => void;
  onDenyPad: (sessionId: string) => void;
}) {
  const [qr, setQr] = useState<string>("");
  const [lanUrl, setLanUrl] = useState<string>(url);
  const [lanWarn, setLanWarn] = useState<string>("");
  // All candidate LAN IPv4s — laptops with VPN or Docker bridges often
  // expose several. Stored so the user can rotate to the right NIC if
  // the auto-picked one (highest priority: 192.168>10>172) doesn't
  // route to the tablet's Wi-Fi.
  const [lanIps, setLanIps] = useState<string[]>([]);
  const [lanIdx, setLanIdx] = useState(0);

  // Replace localhost hostname with the dev server's LAN IPv4 so the iPad,
  // which is on another device, can actually reach it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!url) return;
      try {
        const u = new URL(url);
        const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "0.0.0.0";
        if (!isLocal) { setLanUrl(url); setLanWarn(""); setLanIps([]); return; }
        const r = await fetch("/api/lan", { cache: "no-store" });
        const d = await r.json();
        const ips: string[] = Array.isArray(d.lan) ? d.lan : [];
        if (!ips.length) {
          if (!cancelled) { setLanUrl(url); setLanWarn("No LAN IP detected — iPad won't reach localhost."); }
          return;
        }
        if (!cancelled) {
          setLanIps(ips);
          setLanIdx(0);
        }
      } catch {
        if (!cancelled) { setLanUrl(url); setLanWarn("LAN lookup failed — link points to localhost."); }
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  // Rebuild lanUrl whenever the selected NIC changes. Separated from the
  // fetch effect so cycling NICs doesn't re-hit `/api/lan`.
  useEffect(() => {
    if (!lanIps.length || !url) return;
    try {
      const u = new URL(url);
      const ip = lanIps[lanIdx] ?? lanIps[0];
      u.hostname = ip;
      setLanUrl(u.toString());
      setLanWarn(
        lanIps.length > 1
          ? `iPad must be on the same Wi-Fi as ${ip}. Tap ↻ to try ${lanIps.length - 1} other NIC${lanIps.length > 2 ? "s" : ""}.`
          : `iPad must be on the same Wi-Fi as ${ip}.`,
      );
    } catch {}
  }, [lanIps, lanIdx, url]);

  const cycleIp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lanIps.length <= 1) return;
    setLanIdx((i) => (i + 1) % lanIps.length);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!lanUrl) return;
      try {
        const { default: QRCode } = await import("qrcode");
        const dataUrl = await QRCode.toDataURL(lanUrl, { margin: 1, width: 180, color: { dark: "#1b1b1f", light: "#ffffff" } });
        if (!cancelled) setQr(dataUrl);
      } catch {
        if (!cancelled) setQr("");
      }
    })();
    return () => { cancelled = true; };
  }, [lanUrl]);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(lanUrl);
      toast.success("iPad link copied", { description: lanUrl });
    } catch {
      toast.error("Clipboard blocked");
    }
  };
  const live = padCount > 0;
  return (
    <li className="excal-pad-v2" onClick={(e) => e.stopPropagation()}>
      <div className="excal-pad-v2-head">
        <div className="excal-pad-v2-title">
          <Tablet className="h-3.5 w-3.5" />
          <span>iPad bridge</span>
        </div>
        <div className={`excal-pad-v2-status ${live ? "is-live" : viewerCount > 0 ? "is-warn" : ""}`}>
          <span className="excal-pad-v2-dot" />
          {live ? `${padCount} connected` : viewerCount > 0 ? `${viewerCount} viewer${viewerCount === 1 ? "" : "s"}` : "Waiting"}
        </div>
      </div>

      <button onClick={onTogglePen} className={`excal-pad-v2-toggle ${penOn ? "is-on" : ""}`}>
        <span className="excal-pad-v2-toggle-icon"><Pencil className="h-3.5 w-3.5" /></span>
        <span className="excal-pad-v2-toggle-body">
          <span className="excal-pad-v2-toggle-label">Pen mode</span>
          <span className="excal-pad-v2-toggle-hint">{penOn ? "palm rejection active" : "tap input only"}</span>
        </span>
        <span className={`excal-pad-v2-switch ${penOn ? "is-on" : ""}`}>
          <span className="excal-pad-v2-switch-knob" />
        </span>
      </button>

      <div className="excal-pad-v2-qrcard">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR to open on iPad" width={168} height={168} className="excal-pad-v2-qr-img" />
        ) : (
          <div className="excal-pad-v2-qr-skeleton">generating…</div>
        )}
        <div className="excal-pad-v2-url" title={lanUrl}>{lanUrl}</div>
        {lanWarn && (
          <div className="excal-pad-v2-warn">{lanWarn}</div>
        )}
      </div>

      <div className="excal-pad-v2-actions">
        <button onClick={copy} className="excal-pad-v2-action">
          <Copy className="h-3.5 w-3.5" />
          <span>Copy link</span>
        </button>
        <a href={lanUrl} target="_blank" rel="noreferrer" className="excal-pad-v2-action">
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Open</span>
        </a>
        {lanIps.length > 1 && (
          <button
            onClick={cycleIp}
            className="excal-pad-v2-action"
            title={`Cycle NIC — currently ${lanIps[lanIdx]} (${lanIdx + 1}/${lanIps.length})`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>NIC {lanIdx + 1}/{lanIps.length}</span>
          </button>
        )}
      </div>
      {pendingPads.filter((p) => p.approval === "pending").length > 0 && (
        <div className="mt-3 space-y-2">
          {pendingPads
            .filter((p) => p.approval === "pending")
            .map((p) => (
              <div key={p.sessionId} className="rounded-md border border-foreground/10 bg-foreground/5 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Pair request
                </div>
                <div className="text-xs font-semibold truncate">{p.label ?? "Tablet"}</div>
                {p.device?.ip && (
                  <div className="text-[10px] font-mono text-muted-foreground truncate">{p.device.ip}</div>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    onClick={() => onDenyPad(p.sessionId)}
                    className="flex-1 px-2 py-1 rounded border border-foreground/15 text-[11px] hover:bg-foreground/5"
                  >
                    Deny
                  </button>
                  <button
                    onClick={() => onApprovePad(p.sessionId)}
                    className="flex-1 px-2 py-1 rounded bg-primary text-primary-foreground text-[11px] font-semibold"
                  >
                    Accept
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </li>
  );
}

function FrameThumb({ frame, kids }: { frame: FrameEl; kids: SceneEl[] }) {
  const W = 280;
  const H = 140;
  const PAD = 6;
  const sx = (W - PAD * 2) / Math.max(1, frame.width);
  const sy = (H - PAD * 2) / Math.max(1, frame.height);
  const s = Math.min(sx, sy);
  const offX = PAD + ((W - PAD * 2) - frame.width * s) / 2;
  const offY = PAD + ((H - PAD * 2) - frame.height * s) / 2;
  const tx = (x: number) => offX + (x - frame.x) * s;
  const ty = (y: number) => offY + (y - frame.y) * s;
  return (
    <svg width={W} height={H} className="block rounded-md bg-black/30 dark:bg-white/[0.03] border border-white/5">
      <rect x={offX} y={offY} width={frame.width * s} height={frame.height * s} fill="rgba(127,127,127,0.06)" stroke="rgba(127,127,127,0.35)" strokeDasharray="3 3" />
      {kids.map((k, i) => {
        const x = tx(k.x ?? 0);
        const y = ty(k.y ?? 0);
        const w = Math.max(1, (k.width ?? 1) * s);
        const h = Math.max(1, (k.height ?? 1) * s);
        const c = k.strokeColor || "#94a3b8";
        if (k.type === "arrow" || k.type === "line") {
          return <line key={i} x1={x} y1={y} x2={x + w} y2={y + h} stroke={c} strokeWidth={1} opacity={0.7} />;
        }
        if (k.type === "ellipse") {
          return <ellipse key={i} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} stroke={c} strokeWidth={1} fill="none" opacity={0.8} />;
        }
        if (k.type === "text") {
          return <rect key={i} x={x} y={y} width={w} height={Math.max(2, h)} fill={c} opacity={0.45} />;
        }
        return <rect key={i} x={x} y={y} width={w} height={h} stroke={c} fill={c} fillOpacity={0.1} strokeWidth={1} opacity={0.9} />;
      })}
    </svg>
  );
}

function PresentOverlay({
  index, onPrev, onNext, onExit, onTogglePanel, panelOpen, onToggleFocus, focused,
}: {
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
  onToggleFocus: () => void;
  focused: boolean;
}) {
  return (
    <div className="excal-present-bar absolute bottom-4 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-1">
      <button onClick={onPrev} className="excal-present-btn" title="Previous (←)">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="excal-present-counter">frame {index + 1}</span>
      <button onClick={onNext} className="excal-present-btn" title="Next (→ or space)">
        <ChevronRight className="h-4 w-4" />
      </button>
      <span className="excal-present-sep" />
      <button
        onClick={onTogglePanel}
        title={panelOpen ? "Hide slides panel" : "Show slides panel"}
        className={`excal-present-btn ${panelOpen ? "is-active" : ""}`}
      >
        <PanelRightOpen className="h-4 w-4" />
      </button>
      <button
        onClick={onToggleFocus}
        title={focused ? "Zoom to fit (F)" : "Zoom to slide (F)"}
        className={`excal-present-btn ${focused ? "is-active" : ""}`}
      >
        {focused ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
      </button>
      <span className="excal-present-sep" />
      <button onClick={onExit} title="Stop presentation (Esc)" className="excal-present-btn excal-present-btn--danger">
        <Square className="h-3 w-3 fill-current" />
      </button>
    </div>
  );
}

function ExcalDropdown({
  label, icon, open, onToggle, primary, children, badge, badgeTone,
}: {
  label: string; icon: React.ReactNode; open: boolean; onToggle: () => void; primary?: boolean; children: React.ReactNode;
  badge?: number; badgeTone?: "live" | "muted";
}) {
  return (
    <div className="relative">
      <button onClick={onToggle} className={`excal-btn ${primary ? "excal-btn-primary" : ""} ${open ? "excal-btn-active" : ""}`} title={label}>
        {icon}
        {badge && badge > 0 ? (
          <span
            className={`absolute -top-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full text-[9px] leading-[14px] font-bold text-white grid place-items-center ${
              badgeTone === "live" ? "bg-emerald-500 animate-pulse" : "bg-zinc-500"
            }`}
          >
            {badge}
          </span>
        ) : null}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 min-w-[200px] excal-popover">
          <ul className="py-0">{children}</ul>
        </div>
      )}
    </div>
  );
}

function ExcalDropdownItem({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="excal-popover-item">
        <span className="excal-popover-item-icon">{icon}</span>
        <span className="excal-popover-item-label">{label}</span>
        {hint && <span className="excal-popover-item-hint">{hint}</span>}
      </button>
    </li>
  );
}

export function Minimap({
  elements, appState, open, onToggle, onNavigate, onZoom, onFitAll, size = "sm", defaultCorner = "br",
}: {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  open: boolean;
  onToggle: () => void;
  onNavigate: (worldX: number, worldY: number) => void;
  onZoom?: (worldX: number, worldY: number, deltaY: number) => void;
  onFitAll?: () => void;
  size?: "sm" | "lg";
  defaultCorner?: "tl" | "tr" | "bl" | "br";
}) {
  const W = size === "lg" ? 320 : 220;
  const H = size === "lg" ? 220 : 150;
  const PAD = 24;

  // Compute scene bbox + viewport rect in world coords.
  const { bbox, viewport, items } = useMemo(() => {
    type E = { x?: number; y?: number; width?: number; height?: number; isDeleted?: boolean; strokeColor?: string; type?: string };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const items: Array<{ x: number; y: number; w: number; h: number; color: string; type: string }> = [];
    for (const raw of elements) {
      const e = raw as E | null;
      if (!e || e.isDeleted) continue;
      if (typeof e.x !== "number" || typeof e.y !== "number") continue;
      const w = typeof e.width === "number" ? e.width : 1;
      const h = typeof e.height === "number" ? e.height : 1;
      items.push({ x: e.x, y: e.y, w, h, color: e.strokeColor || "#94a3b8", type: e.type || "rectangle" });
      minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x + w); maxY = Math.max(maxY, e.y + h);
    }
    const a = appState as { scrollX?: number; scrollY?: number; width?: number; height?: number; zoom?: { value?: number } };
    const zoom = a.zoom?.value ?? 1;
    const vw = (a.width ?? 0) / zoom;
    const vh = (a.height ?? 0) / zoom;
    const vx = -(a.scrollX ?? 0);
    const vy = -(a.scrollY ?? 0);
    if (isFinite(minX)) {
      minX = Math.min(minX, vx); minY = Math.min(minY, vy);
      maxX = Math.max(maxX, vx + vw); maxY = Math.max(maxY, vy + vh);
    } else {
      minX = vx; minY = vy; maxX = vx + vw; maxY = vy + vh;
    }
    return {
      bbox: { minX, minY, maxX, maxY },
      viewport: { x: vx, y: vy, w: vw, h: vh },
      items,
    };
  }, [elements, appState]);

  const sceneW = Math.max(1, bbox.maxX - bbox.minX);
  const sceneH = Math.max(1, bbox.maxY - bbox.minY);
  const scale = Math.min((W - PAD) / sceneW, (H - PAD) / sceneH);
  const offX = (W - sceneW * scale) / 2;
  const offY = (H - sceneH * scale) / 2;
  const toX = (x: number) => offX + (x - bbox.minX) * scale;
  const toY = (y: number) => offY + (y - bbox.minY) * scale;

  const toWorld = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return {
      worldX: bbox.minX + (px - offX) / scale,
      worldY: bbox.minY + (py - offY) / scale,
    };
  };
  // Drag-pan modes:
  //  - "jump": pointerdown OUTSIDE the viewport rect → snap viewport
  //    center to the click point, then continue panning under finger.
  //  - "grab": pointerdown INSIDE the viewport rect → preserve the
  //    pointer-to-viewport offset, so the rect moves with the cursor
  //    instead of snapping under it. Matches every Figma/Photoshop
  //    minimap and was the single biggest source of "clunky" feel.
  const svgDrag = useRef<{ mode: "jump" | "grab"; offsetX: number; offsetY: number } | null>(null);
  const isInsideViewport = (wx: number, wy: number) =>
    wx >= viewport.x && wx <= viewport.x + viewport.w &&
    wy >= viewport.y && wy <= viewport.y + viewport.h;
  const onSvgDown = (e: React.PointerEvent<SVGSVGElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    const { worldX, worldY } = toWorld(e);
    if (isInsideViewport(worldX, worldY)) {
      // Offset = pointer position - viewport center, in world coords.
      svgDrag.current = {
        mode: "grab",
        offsetX: worldX - (viewport.x + viewport.w / 2),
        offsetY: worldY - (viewport.y + viewport.h / 2),
      };
    } else {
      svgDrag.current = { mode: "jump", offsetX: 0, offsetY: 0 };
      onNavigate(worldX, worldY);
    }
  };
  const onSvgMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = svgDrag.current;
    if (!d) return;
    const { worldX, worldY } = toWorld(e);
    onNavigate(worldX - d.offsetX, worldY - d.offsetY);
  };
  const onSvgUp = () => { svgDrag.current = null; };
  const onSvgWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!onZoom) return;
    // No preventDefault — React onWheel is passive on the listener
    // attached by React in modern versions, but the inner browser
    // listener is what controls scroll. We attach a non-passive native
    // listener via ref below to actually stop the page from scrolling.
    const { worldX, worldY } = toWorld(e);
    onZoom(worldX, worldY, e.deltaY);
  };
  // Attach a non-passive wheel listener so we can preventDefault and
  // stop the page from scrolling when zooming the minimap. Without
  // this, the wheel zooms the minimap AND scrolls the page — clunky.
  const svgRef = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !onZoom) return;
    const handler = (e: WheelEvent) => { e.preventDefault(); };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [onZoom]);

  // Draggable: default-parked at bottom-right via `right`/`bottom`; first drag
  // switches to absolute `left`/`top` and stays where the user drops it.
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const onHeadDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return; // let toggle click through
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeadMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !rootRef.current) return;
    const parent = rootRef.current.parentElement?.getBoundingClientRect();
    if (!parent) return;
    const w = rootRef.current.offsetWidth;
    const h = rootRef.current.offsetHeight;
    const left = Math.max(0, Math.min(parent.width - w, e.clientX - parent.left - drag.current.dx));
    const top = Math.max(0, Math.min(parent.height - h, e.clientY - parent.top - drag.current.dy));
    setPos({ left, top });
  };
  const onHeadUp = () => { drag.current = null; };

  const style: React.CSSProperties = pos
    ? { position: "absolute", left: pos.left, top: pos.top, zIndex: 4 }
    : { position: "absolute", ...pickMinimapCornerStyle(defaultCorner), zIndex: 4 };

  return (
    <div ref={rootRef} className="excal-minimap select-none" style={style}>
      <div className="excal-island">
        <div
          className="excal-island-head excal-minimap-drag"
          onPointerDown={onHeadDown}
          onPointerMove={onHeadMove}
          onPointerUp={onHeadUp}
          onPointerCancel={onHeadUp}
        >
          <span className="excal-island-title">
            <MapIcon className="h-3 w-3" /> minimap · {items.length}
          </span>
          <span className="inline-flex items-center gap-1">
            {onFitAll && (
              <button
                onClick={onFitAll}
                className="excal-island-btn"
                title="Fit all"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={onToggle}
              className="excal-island-btn"
              title={open ? "Hide minimap" : "Show minimap"}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "" : "rotate-180"}`} />
            </button>
          </span>
        </div>
        {open && (
          <svg
            ref={svgRef}
            width={W} height={H}
            onPointerDown={onSvgDown}
            onPointerMove={onSvgMove}
            onPointerUp={onSvgUp}
            onPointerCancel={onSvgUp}
            onWheel={onSvgWheel}
            className="excal-minimap-svg"
            style={{
              touchAction: "none",
              cursor: svgDrag.current?.mode === "grab" ? "grabbing" : "crosshair",
            }}
          >
            {items.map((it, i) => {
              const x = toX(it.x);
              const y = toY(it.y);
              const w = Math.max(1, it.w * scale);
              const h = Math.max(1, it.h * scale);
              if (it.type === "arrow" || it.type === "line") {
                return <line key={i} x1={x} y1={y} x2={x + w} y2={y + h} stroke={it.color} strokeWidth={1} opacity={0.55} />;
              }
              if (it.type === "ellipse") {
                return <ellipse key={i} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} stroke={it.color} strokeWidth={1} fill="none" opacity={0.7} />;
              }
              if (it.type === "text") {
                return <rect key={i} x={x} y={y} width={w} height={h} fill={it.color} opacity={0.25} />;
              }
              return <rect key={i} x={x} y={y} width={w} height={h} stroke={it.color} strokeWidth={1} fill={it.color} fillOpacity={0.08} opacity={0.85} />;
            })}
            <rect
              x={toX(viewport.x)} y={toY(viewport.y)}
              width={Math.max(2, viewport.w * scale)} height={Math.max(2, viewport.h * scale)}
              fill="none" stroke="#6965db"
              strokeWidth={1.5} strokeDasharray="3 2" opacity={0.95}
            />
          </svg>
        )}
      </div>
    </div>
  );
}

type ChatMsg = { role: "user" | "assistant"; text: string; refs?: { id: string; label: string }[] };

function SketchChatPanel({
  skill, getElements, onFocusElement, onClose,
}: {
  skill: string;
  getElements: () => readonly unknown[];
  onFocusElement: (id: string) => void;
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: "assistant", text: `Hi — ask me anything about this ${skill} sketch. I can summarize it, find a node, or suggest what's missing.` },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const summarizeScene = () => {
    type E = { id?: string; type?: string; text?: string; isDeleted?: boolean; containerId?: string };
    const els = getElements() as E[];
    const labels: Record<string, string> = {};
    for (const e of els) {
      if (e && !e.isDeleted && e.type === "text" && e.containerId && e.text) {
        labels[e.containerId] = String(e.text);
      }
    }
    const nodes: { id: string; type: string; label: string }[] = [];
    for (const e of els) {
      if (!e || e.isDeleted || !e.id || !e.type) continue;
      if (e.type === "text" && e.containerId) continue;
      const label = labels[e.id] || (e.type === "text" ? String(e.text || "") : "");
      nodes.push({ id: e.id, type: e.type, label: label.slice(0, 40) });
    }
    return nodes;
  };

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const scene = summarizeScene();
      const r = await fetch(`${API}/api/sketch/ask`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          question: q,
          skill,
          elements: scene,
          history: msgs.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `${r.status}`);
      const refs: { id: string; label: string }[] = Array.isArray(d.refs) ? d.refs.slice(0, 6) : [];
      setMsgs((m) => [...m, { role: "assistant", text: String(d.answer || "—"), refs }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `Error: ${e instanceof Error ? e.message : e}` }]);
    } finally {
      setBusy(false);
    }
  };

  const quick = ["Summarize this sketch", "What's missing?", "Find the entry point", "Suggest next nodes"];

  return (
    <div className="excal-ai-panel absolute top-0 right-0 bottom-0 z-50 w-[380px] max-w-full flex flex-col animate-in slide-in-from-right duration-150">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--default-border-color,rgba(127,127,127,0.15))] shrink-0">
        <div className="inline-flex items-center gap-2">
          <span className="grid place-items-center h-7 w-7 rounded-md bg-[#6965db] text-white">
            <MessageCircle className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Sketch chat</h3>
            <p className="text-[10px] opacity-60 leading-tight font-mono">ask about this canvas · jump to nodes</p>
          </div>
        </div>
        <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-md opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-snug ${
              m.role === "user"
                ? "bg-[#6965db] text-white"
                : "bg-black/[0.04] dark:bg-white/[0.04] border border-[var(--default-border-color,rgba(127,127,127,0.15))]"
            }`}>
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.refs && m.refs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.refs.map((r) => (
                    <button key={r.id} onClick={() => onFocusElement(r.id)}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-white/15 hover:bg-white/30 text-current border border-white/20">
                      → {r.label || r.id.slice(0, 6)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-black/[0.04] dark:bg-white/[0.04] border border-[var(--default-border-color,rgba(127,127,127,0.15))] rounded-lg px-3 py-2 text-[12px] inline-flex items-center gap-2">
              <Loader2Spin /> thinking…
            </div>
          </div>
        )}
      </div>
      <div className="px-3 pt-1 pb-2 border-t border-[var(--default-border-color,rgba(127,127,127,0.15))] shrink-0">
        <div className="flex flex-wrap gap-1 mb-2">
          {quick.map((q) => (
            <button key={q} onClick={() => setInput(q)}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--default-border-color,rgba(127,127,127,0.2))] opacity-70 hover:opacity-100 hover:border-[#6965db]/50">
              {q}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            rows={2}
            placeholder="Ask about this sketch…"
            className="flex-1 rounded-md border border-[var(--default-border-color,rgba(127,127,127,0.2))] bg-black/[0.02] dark:bg-white/[0.02] px-3 py-2 text-[13px] outline-none focus:border-[#6965db] focus:ring-2 focus:ring-[#6965db]/20 resize-none"
          />
          <button onClick={send} disabled={busy || !input.trim()}
                  className="h-9 px-3 rounded-md inline-flex items-center gap-1.5 bg-[#6965db] text-white text-xs font-semibold hover:bg-[#5b57d4] disabled:opacity-40 transition-colors">
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Loader2Spin() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function AiPromptDialog({
  value, onChange, style, onStyle, busy, onClose, onSubmit, skill,
}: {
  value: string;
  onChange: (v: string) => void;
  style: AiStyle;
  onStyle: (s: AiStyle) => void;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
  skill: string;
}) {
  const [improving, setImproving] = useState(false);
  const improvePrompt = async () => {
    const text = value.trim();
    if (!text) { toast.info("Type something first."); return; }
    setImproving(true);
    try {
      const r = await fetch(`${API}/api/ai/search-improve`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          query: text,
          context: "learn",
          hint: `Rewrite this as a clear, concrete whiteboard-diagram prompt for ${skill}. Add specific entities/steps the diagram should include. ≤ 28 words.`,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `${r.status}`);
      if (d.query && d.query !== text) {
        onChange(d.query);
        toast.success("Prompt sharpened");
      } else {
        toast.info("Already clear.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Improve failed");
    } finally {
      setImproving(false);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onSubmit]);

  const styles: Array<{ id: AiStyle; label: string; glyph: string }> = [
    { id: "freeform",   label: "Auto",      glyph: "✦" },
    { id: "flowchart",  label: "Flow",      glyph: "↓" },
    { id: "mindmap",    label: "Mind map",  glyph: "✺" },
    { id: "tree",       label: "Tree",      glyph: "Y" },
    { id: "sequence",   label: "Sequence",  glyph: "→" },
    { id: "comparison", label: "Compare",   glyph: "⇆" },
    { id: "matrix",     label: "Matrix",    glyph: "⊞" },
    { id: "swimlane",   label: "Lanes",     glyph: "≡" },
    { id: "venn",       label: "Venn",      glyph: "⊕" },
  ];

  return (
    <div className="excal-ai-panel absolute top-0 right-0 bottom-0 z-50 w-[380px] max-w-full flex flex-col animate-in slide-in-from-right duration-150">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--default-border-color,rgba(127,127,127,0.15))] shrink-0">
        <div className="inline-flex items-center gap-2">
          <span className="grid place-items-center h-7 w-7 rounded-md bg-[#6965db] text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">AI sketch</h3>
            <p className="text-[10px] opacity-60 leading-tight font-mono">describe → layout → diagram</p>
          </div>
        </div>
        <button onClick={onClose}
                className="h-7 w-7 grid place-items-center rounded-md opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 space-y-4 overflow-y-auto">
        <div className="relative">
          <textarea
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`What do you want to draw? e.g. ${skill} request flow`}
            rows={3}
            className="w-full rounded-md border border-[var(--default-border-color,rgba(127,127,127,0.2))] bg-black/[0.02] dark:bg-white/[0.02] px-3 py-2 pr-9 text-[13px] outline-none focus:border-[#6965db] focus:ring-2 focus:ring-[#6965db]/20 resize-none"
          />
          <button
            type="button"
            onClick={improvePrompt}
            disabled={improving || !value.trim()}
            title="AI: sharpen this prompt"
            className="absolute top-2 right-2 h-6 w-6 grid place-items-center rounded text-[#6965db] hover:bg-[#6965db]/10 disabled:opacity-30"
          >
            {improving ? <Loader2Spin /> : <Sparkles className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div>
          <div className="grid grid-cols-3 gap-1">
            {styles.map((s) => (
              <button key={s.id} onClick={() => onStyle(s.id)}
                      title={s.label}
                      className={`inline-flex items-center justify-center gap-1.5 px-2 h-9 rounded-md border text-[11px] font-medium transition-colors ${
                        style === s.id
                          ? "border-[#6965db] bg-[#6965db]/10 text-[#6965db]"
                          : "border-[var(--default-border-color,rgba(127,127,127,0.18))] hover:border-[#6965db]/50 opacity-85"
                      }`}>
                <span className="font-mono opacity-80">{s.glyph}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--default-border-color,rgba(127,127,127,0.15))] shrink-0">
        <span className="mr-auto text-[10px] opacity-50 font-mono">⌘+↵ · Esc</span>
        <button onClick={onClose} disabled={busy}
                className="h-8 px-3 rounded-md text-xs opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-30">
          Cancel
        </button>
        <button onClick={onSubmit} disabled={busy || !value.trim()}
                className="h-8 px-3.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 bg-[#6965db] text-white hover:bg-[#5b57d4] disabled:opacity-40 transition-colors">
          {busy ? (<><Loader2Spin /> Generating…</>) : (<><Sparkles className="h-3.5 w-3.5" /> Generate</>)}
        </button>
      </div>
    </div>
  );
}
