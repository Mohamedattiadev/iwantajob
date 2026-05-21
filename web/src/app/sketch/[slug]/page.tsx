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
import { Minimap } from "@/components/skill-sketch";
import { useSketchGestures } from "@/components/sketch-gestures";
import "@excalidraw/excalidraw/index.css";

type DrawingListItem = { slug: string; title: string; category?: string; updated_at?: number };

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
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

// Hash of an element array tuned for cheap change-detection: total count +
// id of the most-recently-touched element. Survives reorders we don't care
// about, and stays stable when no edits happened.
function sceneFingerprint(els: readonly unknown[]): string {
  let count = 0;
  let lastId = "";
  for (const raw of els) {
    const e = raw as { id?: string; isDeleted?: boolean; updated?: number; version?: number } | null;
    if (!e || e.isDeleted) continue;
    count++;
    if (e.id) lastId = e.id;
  }
  return `${count}:${lastId}`;
}

export default function SharedSketchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const sp = useSearchParams();
  const router = useRouter();
  const editMode = sp.get("mode") === "edit";
  const penMode = sp.get("pen") === "1";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [readMode, setReadMode] = useState(false);
  const { data, isLoading, error, mutate } = useSWR<DrawingDoc>(`/api/drawings/${encodeURIComponent(slug)}`, fetcher);

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
    if (appliedFor.current === slug) return;
    appliedFor.current = slug;
    const api = excalRef.current;
    if (!api) return;
    const els = Array.isArray(data.elements) ? data.elements : [];
    try {
      (api.updateScene as (d: { elements?: unknown[] }) => void)({ elements: els as unknown[] });
    } catch {}
  }, [slug, data, excalReady]);
  // Reset the applied flag when slug changes so the next data arrival
  // re-applies for the new notebook.
  useEffect(() => { appliedFor.current = ""; lastBody.current = ""; }, [slug]);
  const [savedTick, setSavedTick] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = useCallback(async (payload: object) => {
    const body = JSON.stringify({ data: { ...payload, title: data?.title ?? slug } });
    if (body === lastBody.current) return;
    lastBody.current = body;
    const r = await fetch(`${API}/api/drawings/${encodeURIComponent(slug)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body,
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
        method: "PUT", headers: { "Content-Type": "application/json" }, body,
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
  const localDrawingUntil = useRef(0);
  const [livePeers, setLivePeers] = useState(0);
  const [miniData, setMiniData] = useState<{ els: readonly unknown[]; app: Record<string, unknown> }>({ els: [], app: {} });
  const miniThrottle = useRef(0);
  const [miniOpen, setMiniOpen] = useState(true);

  const onChange = useCallback((elements: readonly unknown[], appState: unknown, files: Record<string, unknown>) => {
    if (!editMode) return;
    // Critical guard: don't autosave before the server's scene has been
    // applied to Excalidraw. Otherwise the initial empty onChange (Excalidraw
    // fires it on mount) would PUT empty elements and wipe the drawing on
    // every reload.
    if (appliedFor.current !== slug) return;
    lastEditAt.current = Date.now();
    lastSeenFingerprint.current = sceneFingerprint(elements);
    const tnow = Date.now();
    if (tnow - miniThrottle.current > 120) {
      miniThrottle.current = tnow;
      setMiniData({ els: elements, app: appState as Record<string, unknown> });
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save({ elements: [...elements], appState: appState as Record<string, unknown>, files });
    }, 1500);
    // Realtime broadcast — 30ms ≈ 33 msg/s for snappier remote rendering.
    const now = Date.now();
    if (now - wsSendThrottle.current >= 30 && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsSendThrottle.current = now;
      try {
        wsRef.current.send(JSON.stringify({
          type: "scene",
          elements,
          appState: { viewBackgroundColor: (appState as { viewBackgroundColor?: string })?.viewBackgroundColor },
          ts: now,
        }));
      } catch {}
    }
  }, [editMode, save]);

  useEffect(() => {
    if (typeof window === "undefined" || !editMode) return;
    // Backend WS host: iPad reaches the laptop's LAN IP. Use the page host
    // and force port 8000 (FastAPI). HTTPS pages would need wss:// — we're
    // on http here.
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.hostname;
    const url = `${proto}://${host}:8000/ws/drawings/${encodeURIComponent(slug)}`;
    let ws: WebSocket | null = null;
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!alive) return;
      try { ws = new WebSocket(url); } catch { return; }
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { type: string; elements?: unknown[]; count?: number };
          if (msg.type === "peers") {
            // server count includes us — show other-peer count.
            setLivePeers(Math.max(0, (msg.count ?? 1) - 1));
            return;
          }
          if (msg.type !== "scene" || !Array.isArray(msg.elements)) return;
          const api = excalRef.current;
          if (!api) return;
          // Skip apply while the local pen/finger is mid-stroke — applying
          // updateScene during a drag jitters the active stroke.
          if (Date.now() < localDrawingUntil.current) return;
          (api.updateScene as (d: { elements?: unknown[] }) => void)({ elements: msg.elements });
          lastSeenFingerprint.current = sceneFingerprint(msg.elements);
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
  }, [editMode, slug]);

  // Mark a small "actively drawing" window on every pointerdown so the
  // incoming-scene apply skips that frame and we don't interrupt strokes.
  useEffect(() => {
    if (!editMode) return;
    const bump = () => { localDrawingUntil.current = Date.now() + 400; };
    window.addEventListener("pointerdown", bump, { passive: true });
    window.addEventListener("pointermove", bump, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("pointermove", bump);
    };
  }, [editMode]);

  // Pen post-processor — Excalidraw freedraw can't switch its perfect-freehand
  // `simulatePressure` via appState, so we patch newly-finished strokes here.
  // Ballpoint & highlighter want a flat constant width (no taper); fountain &
  // brush want the natural velocity/Pencil-pressure taper, which is the
  // freedraw default — so we leave those untouched. No `pressures` rewriting:
  // overwriting the captured pressures caused a visible "snap" on pointer-up.
  const penRef = useRef<PenPreset["key"]>("ballpoint");
  const patchedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!editMode || !penMode) return;
    const onUp = () => {
      const api = excalRef.current;
      if (!api) return;
      const els = api.getSceneElements() as ReadonlyArray<Record<string, unknown>>;
      let mutated = false;
      const next = els.map((el) => {
        if (el.type !== "freedraw") return el;
        const id = el.id as string;
        if (patchedIdsRef.current.has(id)) return el;
        const pts = el.points as Array<[number, number]> | undefined;
        if (!pts || pts.length < 2) return el;
        patchedIdsRef.current.add(id);
        const pen = penRef.current;
        if (pen === "ballpoint" || pen === "highlighter") {
          mutated = true;
          return { ...el, simulatePressure: false };
        }
        return el;
      });
      if (mutated) {
        try { (api.updateScene as (d: { elements?: unknown[] }) => void)({ elements: next }); } catch {}
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
  const sessionIdRef = useRef<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sessionIdRef.current) {
      sessionIdRef.current = (crypto.randomUUID?.() ?? `s-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`);
    }
    const sid = sessionIdRef.current;
    const role = penMode ? "pad" : editMode ? "viewer" : "viewer";
    const beat = () => {
      fetch(`/api/presence/${encodeURIComponent(slug)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, role }),
      }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 5000);
    const onUnload = () => {
      try {
        fetch(`/api/presence/${encodeURIComponent(slug)}?sessionId=${encodeURIComponent(sid)}`, { method: "DELETE", keepalive: true }).catch(() => {});
      } catch {}
    };
    window.addEventListener("pagehide", onUnload);
    return () => { clearInterval(id); window.removeEventListener("pagehide", onUnload); onUnload(); };
  }, [slug, penMode, editMode]);

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
      <header className={`flex items-center px-4 py-2 border-b border-border/50 bg-card/60 backdrop-blur shrink-0 ${penMode ? "justify-center gap-4" : "justify-between"}`}>
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
              {editMode ? (penMode ? "iPad (pen)" : "Shared (editing)") : "Shared (read-only)"}
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
      </header>
      <div className="flex-1 min-h-0 relative">
        <Excalidraw
          initialData={initialData}
          viewModeEnabled={!editMode}
          onChange={editMode ? onChange : undefined}
          theme="dark"
          aiEnabled={false}
          excalidrawAPI={(api) => {
            excalRef.current = api as ExcalApi;
            setExcalReady(true);
            // GoodNotes-feel: when iPad opens via QR (`?pen=1`):
            // 1. Force penMode on so finger pans / Apple Pencil draws.
            // 2. Default tool = freedraw, ready to write immediately.
            if (penMode && editMode) {
              setTimeout(() => {
                try {
                  (api as ExcalApi).updateScene({
                    appState: { penMode: true, penDetected: true, currentItemStrokeWidth: 2 },
                  });
                  (api as ExcalApi).setActiveTool?.({ type: "freedraw" });
                } catch {}
              }, 50);
            }
          }}
        />
        {editMode && (
          <Minimap
            size="lg"
            elements={miniData.els}
            appState={miniData.app}
            open={miniOpen}
            onToggle={() => setMiniOpen((v) => !v)}
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
        {editMode && (
          <div className="absolute top-2 right-3 z-[65] inline-flex items-center gap-2">
            {penMode && (
              <span className="px-2 py-1 rounded-md bg-violet-500/15 border border-violet-500/40 text-violet-300 text-[10px] font-mono uppercase tracking-wider inline-flex items-center gap-1">
                <Pencil className="h-3 w-3" /> pen mode
              </span>
            )}
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
  key: "ballpoint" | "fountain" | "brush" | "highlighter";
  label: string;
  icon: React.ReactNode;
  width: number;
  roughness: 0 | 1 | 2;
  opacity: number;
  defaultColor?: string;
};
// Pen presets exaggerated so each one is clearly visibly different from
// the others on the canvas. Excalidraw doesn't ship true fountain/brush
// engines, so we lean on width + roughness + opacity to fake the look.
const PEN_PRESETS: PenPreset[] = [
  // ballpoint  — thin uniform line (no taper, post-patched to simulatePressure=false)
  // fountain   — medium with natural velocity/Pencil-pressure taper
  // brush      — thick, slightly translucent, taper kept
  // highlighter — very thick, flat (no taper), translucent yellow
  { key: "ballpoint",  label: "Ballpoint",   icon: <PenTool size={16} />,    width: 1.5, roughness: 0, opacity: 100 },
  { key: "fountain",   label: "Fountain",    icon: <Feather size={16} />,    width: 4,   roughness: 0, opacity: 100 },
  { key: "brush",      label: "Brush",       icon: <Brush size={16} />,      width: 12,  roughness: 0, opacity: 80 },
  { key: "highlighter",label: "Highlighter", icon: <Highlighter size={16} />,width: 28,  roughness: 0, opacity: 28, defaultColor: "#fbbf24" },
];

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
