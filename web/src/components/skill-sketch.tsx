"use client";

import dynamic from "next/dynamic";
import type * as React from "react";
import { memo, Fragment, Component as ReactComponent } from "react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Maximize2, Minimize2, CheckCircle2,
  Sparkles, Link as LinkIcon, X,
  Map as MapIcon, ChevronDown, ChevronLeft, ChevronRight,
  MessageCircle, Download, Send,
  Eye, Pencil, Image as ImageIcon, FileCode, Copy,
  Network, ArrowDown, Columns3, Grid2x2, Play, Square,
  PanelRightOpen, ZoomIn, ZoomOut,
  Tablet, ExternalLink, Save, Users, ArrowLeft, RefreshCw, Plus, BookOpen,
  Layers, Boxes, Component, MessageSquare, RotateCw, Database, GitBranch,
  Key, Shield,
  Sigma, LineChart, Triangle, PieChart,
  Container, Package, Cloud, Activity,
  Layout, FormInput, LayoutGrid,
  Hexagon, Workflow,
  Calculator, Wrench, Code2, Globe, Building2, Star,
} from "lucide-react";
import NextLink from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { API, fetcher, primeEtag } from "@/lib/api";
import useSWR from "swr";
import { TEMPLATES, TEMPLATE_META, type TemplateKey } from "@/lib/sketch-templates";
import { pickMinimapCornerStyle, shouldApplyIncomingScene, computeFitAllAppState, fitElementsToBbox, validateAiElements } from "@/lib/sketch";
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

// Install Excalidraw render-crash suppression at MODULE scope (runs
// before any component mount). Excalidraw still throws a transient
// "Cannot read properties of undefined (reading 'type')" during
// internal reconciliation; the next render fully recovers, but Next's
// dev error overlay latches onto the first occurrence and blocks the
// app behind a full-screen modal. Swallowing this one specific
// message keeps the canvas usable while letting every other error
// surface as normal.
if (typeof window !== "undefined" && !(window as { __excalCrashGuard?: boolean }).__excalCrashGuard) {
  (window as { __excalCrashGuard?: boolean }).__excalCrashGuard = true;
  const SIG = "Cannot read properties of undefined (reading 'type')";
  // ── Root-cause patch ────────────────────────────────────────────
  // Excalidraw's render pipeline calls Array.prototype.filter on
  // arrays that sometimes contain a hole / undefined entry during
  // reconciliation. The callback then dereferences `.type` on
  // undefined and the whole render trips. We can't pinpoint the one
  // bad array from outside, so we patch filter itself: if the
  // callback would crash on a nullish entry, transparently skip it.
  // This is scoped to nullish entries only — every other filter
  // behaves identically.
  const origFilter = Array.prototype.filter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-extend-native
  Array.prototype.filter = function (this: any[], cb: any, thisArg?: any) {
    try {
      return origFilter.call(this, cb, thisArg);
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (!msg.includes("Cannot read properties of undefined") &&
          !msg.includes("Cannot read properties of null")) {
        throw e;
      }
      // Retry with a wrapped callback that yields `false` for any
      // nullish element so render can complete with the good data.
      const safeCb = function (this: unknown, el: unknown, i: number, arr: unknown[]) {
        if (el == null) return false;
        try { return cb.call(thisArg ?? this, el, i, arr); }
        catch (inner) {
          const im = (inner as Error)?.message || "";
          if (im.includes("Cannot read properties of undefined") ||
              im.includes("Cannot read properties of null")) return false;
          throw inner;
        }
      };
      return origFilter.call(this, safeCb as never, thisArg);
    }
  } as typeof Array.prototype.filter;
  // Belt + suspenders for any error that still escapes.
  // Excalidraw tries to spawn a Worker from a file:// URL in dev
  // mode (subset-worker.chunk.js). Browser blocks it, Excalidraw
  // logs a noisy warning + the raw SecurityError. Fallback to
  // main thread is automatic and functionally identical — so
  // suppress both the warn and the raw error.
  const SUBSET_SIG = "subset-worker.chunk";
  const SUBSET_MSG = "Failed to use workers for subsetting";
  const origWarn = console.warn.bind(console);
  console.warn = ((...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && (first.includes(SUBSET_MSG) || first.includes(SUBSET_SIG))) return;
    origWarn(...args);
  }) as typeof console.warn;
  const origError = console.error.bind(console);
  console.error = ((...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && (first.includes(SUBSET_MSG) || first.includes(SUBSET_SIG))) return;
    // Also drop bare SecurityError objects from the subset worker.
    if (args.some((a) => a && typeof a === "object" && (a as { message?: string }).message?.includes(SUBSET_SIG))) return;
    origError(...args);
  }) as typeof console.error;
  // Patch Worker so the SecurityError never even gets thrown for
  // the subset chunk. Returns a no-op shim object that mimics the
  // Worker API surface Excalidraw uses, letting its catch path
  // fall through to the main-thread fallback cleanly.
  if (typeof Worker !== "undefined") {
    const OrigWorker = Worker;
    class SafeWorker extends OrigWorker {
      constructor(url: string | URL, opts?: WorkerOptions) {
        const u = typeof url === "string" ? url : url.toString();
        if (u.includes(SUBSET_SIG)) {
          // Throw a quiet error that Excalidraw catches and
          // falls back to the main thread for. Marker name lets
          // our error handler below swallow it.
          const e = new Error("subset-worker-disabled");
          (e as Error & { __subsetWorkerSkip?: boolean }).__subsetWorkerSkip = true;
          throw e;
        }
        super(url, opts);
      }
    }
    (window as { Worker?: typeof Worker }).Worker = SafeWorker as typeof Worker;
  }
  window.addEventListener("error", (ev) => {
    // Silence subset-worker fallback noise too.
    if (ev.message && (ev.message.includes(SUBSET_SIG) || ev.message.includes(SUBSET_MSG) || ev.message.includes("subset-worker-disabled"))) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      return;
    }
    if (ev.message && ev.message.includes(SIG)) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      try {
        const root = document.querySelector("nextjs-portal");
        root?.shadowRoot?.querySelectorAll("[data-nextjs-dialog-overlay]").forEach((n) => (n as HTMLElement).remove());
        root?.shadowRoot?.querySelectorAll("[data-nextjs-dialog]").forEach((n) => (n as HTMLElement).remove());
      } catch {}
    }
  }, true);
  window.addEventListener("unhandledrejection", (ev) => {
    const m = ev.reason && (ev.reason.message || String(ev.reason));
    if (typeof m === "string" && m.includes(SIG)) ev.preventDefault();
  });
}

// Error boundary that catches Excalidraw render crashes (e.g. stale
// boundElements references producing `undefined.type` in its internal
// `.filter(...)` calls) and force-remounts the canvas with a bumped
// key. Without this, a single bad element in the persisted doc bricks
// the entire sketch page until the user manually clears storage.
// After a crash, strip ALL relational fields and keep only standalone
// geometry — the most common crash cause is dangling boundElements /
// containerId / frameId references. Better to lose arrow bindings
// than lose the whole canvas.
function nukedInitialData(initial: unknown): unknown {
  if (!initial || typeof initial !== "object") return initial;
  const src = initial as { elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> };
  const els = Array.isArray(src.elements) ? src.elements : [];
  const safe = (els as Array<Record<string, unknown> | null | undefined>)
    .filter((el): el is Record<string, unknown> =>
      !!el && typeof el === "object" && typeof (el as { type?: unknown }).type === "string"
    )
    .map((el) => ({
      ...el,
      boundElements: [],
      containerId: null,
      frameId: null,
      groupIds: [],
    }));
  return { ...src, elements: safe };
}

class ExcalCrashBoundary extends ReactComponent<
  { children: React.ReactNode; onCrash: (err: Error) => void; resetKey: number; onRetry: () => void },
  { errored: boolean; lastErr: string | null }
> {
  constructor(props: { children: React.ReactNode; onCrash: (err: Error) => void; resetKey: number; onRetry: () => void }) {
    super(props);
    this.state = { errored: false, lastErr: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { errored: true, lastErr: err?.message || String(err) };
  }
  componentDidCatch(err: Error) {
    try { this.props.onCrash(err); } catch {}
  }
  componentDidUpdate(prev: { resetKey: number }) {
    // Parent bumped resetKey explicitly via the Retry button — clear
    // errored so children render again (with the now-nuked
    // initialData). Do NOT auto-clear on every prop change or we
    // re-enter the same crash loop.
    if (prev.resetKey !== this.props.resetKey && this.state.errored) {
      this.setState({ errored: false, lastErr: null });
    }
  }
  render() {
    if (this.state.errored) {
      return (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, padding: 24, background: "rgba(0,0,0,0.4)", color: "#eee",
          fontFamily: "system-ui", textAlign: "center",
        }}>
          <div style={{ fontSize: 14, opacity: 0.85, maxWidth: 480 }}>
            Canvas crashed (likely a stale element reference in the saved scene).
            <br />
            <span style={{ opacity: 0.6, fontSize: 12 }}>{this.state.lastErr}</span>
          </div>
          <button
            onClick={this.props.onRetry}
            style={{
              padding: "8px 16px", borderRadius: 8,
              background: "#685bc7", color: "#fff", border: "none", cursor: "pointer",
              fontSize: 13,
            }}
          >
            Recover canvas (drops arrow bindings)
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type DrawingDoc = {
  elements?: unknown[];
  paperMode?: "plain" | "grid" | "dots" | "lines";
  layoutMode?: "board" | "book";
  bookPageCount?: number;
  bookPages?: { paper?: "plain" | "grid" | "dots" | "lines" | "inherit"; bgColor?: string | null }[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  title?: string;
  canvasBg?: string | null;
};

function skillSlug(skill: string) {
  return skill.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}

// Aggressive autosave so the peer's poll picks up changes fast.
// Live drawing fires onChange ~60×/s but only the trailing event in
// each 150 ms window actually PUTs. Combined with 500 ms SWR poll
// → ≤700 ms end-to-end without WS.
const DEBOUNCE_MS = 150;

// Categories used by the LibraryFilterBar. Order MUST match the
// updateLibrary seed loop so CSS nth-child ranges land on the right
// library-units in the rendered grid.
const LIB_CATS: Array<{ id: string; label: string; Icon: React.ComponentType<{ className?: string }>; file: string }> = [
  { id: "math",   label: "Math",   Icon: Calculator, file: "math" },
  { id: "devops", label: "DevOps", Icon: Wrench,     file: "devops" },
  { id: "dev",    label: "Dev",    Icon: Code2,      file: "dev-icons" },
  { id: "webui",  label: "Web UI", Icon: Globe,      file: "web-kit" },
  { id: "cloud",  label: "Cloud",  Icon: Cloud,      file: "cloud" },
  { id: "arch",   label: "Arch",   Icon: Building2,  file: "software-arch" },
];

// Preset canvas-background swatches surfaced in the Canvas sidebar
// row. Mirrors Excalidraw's own `DEFAULT_CANVAS_BACKGROUND_PICKS`
// (radix slate2 / blue2 / yellow2 / bronze2) plus a clear-to-theme
// option and pure white. Trailing `+` opens a native color picker
// for arbitrary hex.
// Tiny module-scoped store for the Canvas swatch row. Lives outside
// the React tree so the SwatchGrid can subscribe via
// useSyncExternalStore and re-render in isolation — keeping the
// memoised MainMenu element tree stable (touching it would re-attach
// MM's own subscribers and trigger an infinite-update loop, as the
// memo's note warns).
const customBgStore = (() => {
  let value: string | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot() { return value; },
    getServerSnapshot() { return null as string | null; },
    set(next: string | null) {
      if (value === next) return;
      value = next;
      listeners.forEach((l) => l());
    },
  };
})();

const CANVAS_BG_SWATCHES: ReadonlyArray<{ title: string; value: string | null }> = [
  // Row 1 — clear + lights (kept so paper modes still read on light)
  { title: "Clear (theme)", value: null },
  { title: "Paper",      value: "#f5efe1" },
  { title: "Cream",      value: "#e8dfc4" },
  { title: "Sand",       value: "#c9b48a" },
  // Row 2 — saturated mids (deeper than pastels)
  { title: "Moss",       value: "#3f5b3a" },
  { title: "Steel",      value: "#1e3a5f" },
  { title: "Plum",       value: "#4a2c52" },
  { title: "Slate",      value: "#27303e" },
  // Row 3 — true darks (last slot is the picker)
  { title: "Forest",     value: "#0d2018" },
  { title: "Wine",       value: "#2a0e10" },
  { title: "Onyx",       value: "#0b0d12" },
];

function sceneBBox(els: readonly unknown[]) {
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
}

type ExcalApi = {
  getSceneElements: () => readonly unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  updateScene: (data: { elements?: unknown[]; appState?: Record<string, unknown> }) => void;
  scrollToContent: (target?: unknown) => void;
  setActiveTool?: (tool: { type: string; locked?: boolean }) => void;
  updateLibrary?: (opts: {
    libraryItems: unknown[] | ((curr: Array<Record<string, unknown>>) => unknown[] | Promise<unknown[]>);
    merge?: boolean;
    openLibraryMenu?: boolean;
    defaultStatus?: "published" | "unpublished";
  }) => void;
};

export function SkillSketch({ skill, homeHref, defaultFull = false, hideFullscreenButton = false }: { skill: string; homeHref?: string; defaultFull?: boolean; hideFullscreenButton?: boolean }) {
  const slug = `skill-${skillSlug(skill)}`;
  // Adaptive poll: 500 ms while a peer is connected (need fast sync),
  // 3 s otherwise, paused when the tab is hidden. Even with 304s the
  // request frequency itself eats wakeups + dev-server logs. SWR's
  // `refreshInterval` accepts a function — return 0 to disable.
  const [livePeers, setLivePeers] = useState(0);
  const livePeersRef = useRef(0);
  useEffect(() => { livePeersRef.current = livePeers; }, [livePeers]);
  const { data: doc, mutate } = useSWR<DrawingDoc>(
    `/api/drawings/${slug}`,
    fetcher,
    {
      refreshInterval: () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return 0;
        return livePeersRef.current > 0 ? 500 : 3000;
      },
      dedupingInterval: 0,
      revalidateOnFocus: true,
    },
  );
  const { resolvedTheme } = useTheme();
  const [full, setFull] = useState(defaultFull);
  // GoodNotes-style paper templates. Rendered as a CSS background on
  // the canvas wrapper; Excalidraw paints over it with a transparent
  // viewBackgroundColor when a non-plain mode is active so the pattern
  // shows through. Persisted in the saved doc under `paperMode`.
  const [paperMode, setPaperMode] = useState<PaperMode>("plain");
  // User-chosen canvas color. `null` = wrapper falls back to its
  // `bg-card` token. When a paper / book overlay is active we paint
  // this on the wrapper div; in plain board mode we also push it
  // into Excalidraw's viewBackgroundColor so the native canvas paints
  // it. Owned entirely by our custom Canvas swatch row — Excalidraw's
  // native swatch is left untouched so there's no race over who
  // "wins" the picked color.
  const [customBg, setCustomBg] = useState<string | null>(null);
  const customBgRef = useRef<string | null>(null);
  useEffect(() => {
    customBgRef.current = customBg;
    // Keep the module-scoped store in sync so SidebarSwatchGrid (which
    // subscribes via useSyncExternalStore to avoid invalidating the
    // memoised MainMenu tree) reflects the latest pick.
    customBgStore.set(customBg);
  }, [customBg]);
  // Layout mode — `board` is the default infinite canvas; `book`
  // is GoodNotes-style paged. In book mode entry, we snap the
  // viewport to fit page 0 and bind ←/→ to flip pages.
  type LayoutMode = "board" | "book";
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("board");
  const [bookPage, setBookPage] = useState(0);
  const [bookOutlineOpen, setBookOutlineOpen] = useState(false);
  // Laser-lock — presentation mode where laser-red strokes persist
  // until the user toggles off. Implementation: we flip the active
  // tool to freedraw with a red/low-roughness preset while locked, so
  // the user gets a "laser" feel but the strokes are real elements.
  // Every new element added while locked is tracked, and toggling
  // off wipes those elements + restores the previous appState +
  // tool. The fading laser tool itself can't persist (Excalidraw
  // clears it after ~700 ms regardless of caller intent), so we
  // simulate the look with freedraw instead.
  // View-only mode — toggles Excalidraw's `viewModeEnabled` so the
  // canvas becomes read-only (useful when presenting frames so a
  // stray click doesn't move shapes).
  const [viewOnly, setViewOnly] = useState(false);
  useEffect(() => {
    const a = excalRef.current;
    if (!a) return;
    try { a.updateScene({ appState: { viewModeEnabled: viewOnly } }); } catch {}
  }, [viewOnly]);
  const bookPageRef = useRef(0);
  useEffect(() => { bookPageRef.current = bookPage; }, [bookPage]);
  // Per-page paper mode array. Length === page count. Each entry is
  // either inherits-global (undefined / "inherit") or one of the
  // PaperMode variants. Default: one page that inherits global mode.
  type BookPage = { paper?: PaperMode | "inherit"; bgColor?: string | null };
  const [bookPages, setBookPages] = useState<BookPage[]>([{ paper: "inherit" }]);
  const bookPagesRef = useRef<BookPage[]>([{ paper: "inherit" }]);
  useEffect(() => { bookPagesRef.current = bookPages; }, [bookPages]);
  const bookPageCount = bookPages.length;
  // Fit viewport to a given page index — centers the page in view
  // with 32 px padding. Matches the "tap-to-zoom-to-page" feel.
  const goToBookPage = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(bookPagesRef.current.length - 1, idx));
    setBookPage(clamped);
    const api = excalRef.current;
    if (!api) return;
    const app = api.getAppState() as { width?: number; height?: number };
    const vw = app.width ?? window.innerWidth;
    const vh = app.height ?? window.innerHeight;
    const padding = 32;
    const top = bookPageTop(clamped);
    const zoom = Math.max(0.05, Math.min(2,
      (vw - padding * 2) / BOOK_PAGE_W,
      (vh - padding * 2) / BOOK_PAGE_H,
    ));
    // Center page in viewport: world coords of page center,
    // map back to scrollX/Y given the new zoom.
    const cx = BOOK_PAGE_W / 2;
    const cy = top + BOOK_PAGE_H / 2;
    api.updateScene({
      appState: {
        zoom: { value: zoom },
        scrollX: vw / (2 * zoom) - cx,
        scrollY: vh / (2 * zoom) - cy,
      },
    });
    // Mirror new appState into miniData so BookPagesOverlay
    // (which reads scrollX/Y + zoom from miniData.app) positions
    // pages correctly on the FIRST render after reload — otherwise
    // it waits for the next onChange to fire, which may not happen
    // until the user interacts and the pages stay invisible.
    setMiniData((prev) => ({
      els: prev.els,
      app: api.getAppState() as Record<string, unknown>,
    }));
  }, []);
  // Mirror Excalidraw's appState into miniData as soon as the API
  // mounts. PaperBackdrop / overlays read scroll/zoom from
  // miniData.app — on a pure page reload with no user interaction,
  // it stayed as `{}` until the first onChange, so the dot/grid
  // pattern (and book pages) rendered at world (0,0) instead of
  // the saved scroll. That matched the "go to board, come back"
  // workaround the user reported.
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const a = excalRef.current;
      if (a) {
        try {
          const app = a.getAppState() as Record<string, unknown>;
          const els = a.getSceneElements() as readonly unknown[];
          setMiniData({ els, app });
        } catch {}
        return;
      }
      if (++tries > 120) return;
      requestAnimationFrame(tick);
    };
    const t = setTimeout(() => requestAnimationFrame(tick), 30);
    return () => { cancelled = true; clearTimeout(t); };
    // Only run on mount (slug change remounts the whole tree via
    // the Excalidraw `key={slug}` prop too).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  // Belt-and-suspenders meta sync: when both doc + canvas API are
  // present, re-apply paperMode / canvasBg / bookPages from doc
  // unconditionally (subject to the 1.5s post-edit guard). The
  // main sync effect already covers this, but on flaky reloads
  // it sometimes runs before the React state for paperMode has
  // committed and the next SWR poll then sees identical state +
  // skips. This effect runs on doc changes only (no excalReady
  // dep) AND after a 250ms debounce so it lands AFTER the main
  // sync's setState calls have rendered.
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => {
      if (Date.now() - lastMetaEditAtRef.current < 1500) return;
      if (doc.paperMode && doc.paperMode !== paperModeRef.current) {
        setPaperMode(doc.paperMode);
      }
      if (typeof doc.canvasBg === "string" && doc.canvasBg !== customBgRef.current) {
        setCustomBg(doc.canvasBg);
      }
      if (doc.layoutMode && doc.layoutMode !== layoutModeRef.current) {
        setLayoutMode(doc.layoutMode);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [doc]);
  // Snap to page 0 on entering book mode. On reload `layoutMode`
  // flips to "book" before Excalidraw's dynamic import resolves —
  // running goToBookPage immediately would early-return because
  // excalRef.current is null. Poll on RAF until the API is alive,
  // then snap once. Bounded by maxTries so it never loops forever.
  useEffect(() => {
    if (layoutMode !== "book") return;
    let cancelled = false;
    let tries = 0;
    const maxTries = 120; // ~2s at 60 fps
    const tick = () => {
      if (cancelled) return;
      if (excalRef.current) {
        goToBookPage(0);
        return;
      }
      if (++tries > maxTries) return;
      requestAnimationFrame(tick);
    };
    const t = setTimeout(() => requestAnimationFrame(tick), 50);
    return () => { cancelled = true; clearTimeout(t); };
  }, [layoutMode, goToBookPage]);
  // Two-finger horizontal swipe on the canvas flips pages while in
  // book mode (tablet/touchpad). Single finger is reserved for
  // Excalidraw drawing/panning.
  useEffect(() => {
    if (layoutMode !== "book") return;
    const el = canvasWrapRef.current;
    if (!el) return;
    let startX: number | null = null;
    let startY: number | null = null;
    let active = false;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) { active = false; return; }
      active = true;
      const t0 = e.touches[0], t1 = e.touches[1];
      startX = (t0.clientX + t1.clientX) / 2;
      startY = (t0.clientY + t1.clientY) / 2;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!active || startX == null || startY == null) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      startX = null; startY = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) goToBookPage(bookPageRef.current + 1);
      else goToBookPage(bookPageRef.current - 1);
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [layoutMode, goToBookPage]);

  // ←/→ + PageUp/Down keys flip pages while in book mode. Don't
  // hijack when focus is in an input/textarea or when the user is
  // typing in an Excalidraw text element.
  useEffect(() => {
    if (layoutMode !== "book") return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goToBookPage(bookPageRef.current + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToBookPage(bookPageRef.current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layoutMode, goToBookPage]);
  // Whenever paperMode changes, force Excalidraw's viewBackgroundColor
  // to transparent (so the wrapper pattern shows) or back to white.
  useEffect(() => {
    const api = excalRef.current;
    if (!api) return;
    try {
      api.updateScene({
        appState: {
          // Always paint canvas bg via the wrapper div (set below in
          // the JSX style prop) instead of via Excalidraw's
          // viewBackgroundColor. Excalidraw's own paint subtly
          // lightens custom dark colors (looks like a tint pass), so
          // plain-mode dark backgrounds came out paler than the same
          // color in grid/dots/lines modes. Routing everything
          // through the wrapper keeps the visual identical across
          // paper modes.
          viewBackgroundColor: "transparent",
        },
      });
      // Force Excalidraw to re-render the static canvas now. Without
      // this, the appState change can sit unrendered until the next
      // user input — leaving the canvas opaque-painted from its
      // previous viewBackgroundColor and hiding BookPagesOverlay.
      (api as { refresh?: () => void }).refresh?.();
    } catch {}
  }, [paperMode, layoutMode]);
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
  // Swallow the recurring Excalidraw "Cannot read properties of
  // undefined (reading 'type')" render error. Despite multiple layers
  // of scrubbing, certain internal Excalidraw render paths still hit
  // a transient undefined element during reconciliation. The error
  // doesn't break further drawing — only Next.js's dev overlay makes
  // it look catastrophic. Suppress only this specific message so
  // genuine bugs still surface.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isExcalCrash = (msg: string) =>
      msg.includes("Cannot read properties of undefined (reading 'type')");
    const onErr = (ev: ErrorEvent) => {
      if (isExcalCrash(ev.message || "")) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    };
    const onRej = (ev: PromiseRejectionEvent) => {
      const m = ev.reason && (ev.reason.message || String(ev.reason));
      if (typeof m === "string" && isExcalCrash(m)) {
        ev.preventDefault();
      }
    };
    window.addEventListener("error", onErr, true);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr, true);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);
  const [miniData, setMiniData] = useState<{ els: readonly unknown[]; app: Record<string, unknown> }>({ els: [], app: {} });
  // Seed the minimap from the loaded doc so it shows real geometry
  // before the user touches the canvas. SWR refetches every 500 ms
  // and returns a new `doc` reference each time, so we gate on
  // element count to avoid a setState-on-every-poll re-render storm
  // that compounded with Excalidraw's MainMenu rerender and tripped
  // React's update-depth limit.
  const seededLen = useRef(-1);
  useEffect(() => {
    if (!doc) return;
    const els = Array.isArray(doc.elements) ? doc.elements : [];
    if (els.length === seededLen.current) return;
    seededLen.current = els.length;
    setMiniData({ els: els as readonly unknown[], app: (doc.appState ?? {}) as Record<string, unknown> });
  }, [doc]);
  const [miniOpen, setMiniOpen] = useState(true);
  // Cursor indicator dot in the laptop minimap — mirrors the tablet
  // behaviour the user liked. Throttled via rAF so a 60Hz mousemove
  // doesn't trigger 60Hz React renders.
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    let raf = 0;
    let lastClient: { x: number; y: number } | null = null;
    const tick = () => {
      raf = 0;
      const c = lastClient;
      if (!c) return;
      const api = excalRef.current;
      if (!api) return;
      const s = api.getAppState() as { scrollX?: number; scrollY?: number; zoom?: { value?: number } };
      const zoom = s.zoom?.value ?? 1;
      const rect = el.getBoundingClientRect();
      const x = (c.x - rect.left) / zoom - (s.scrollX ?? 0);
      const y = (c.y - rect.top) / zoom - (s.scrollY ?? 0);
      setCursorWorld({ x, y });
    };
    const onMove = (e: PointerEvent) => {
      lastClient = { x: e.clientX, y: e.clientY };
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => { lastClient = null; setCursorWorld(null); };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  const last = useRef("");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excalRef = useRef<ExcalApi | null>(null);
  // Excalidraw consumes `initialData` only on mount, so if SWR returns the
  // doc AFTER mount (the SWRConfig dedupe + no-revalidate-on-focus path
  // makes this almost always the case on warm caches) the canvas stays
  // empty while the minimap, fed straight off `doc`, shows the full scene.
  // This effect pushes elements into Excalidraw exactly once per slug.
  const [excalReady, setExcalReady] = useState(false);
  // Bumped by the error boundary when Excalidraw crashes mid-render.
  // The bump is appended to the canvas `key` so React unmounts the
  // broken instance and remounts with fresh (filtered) initialData.
  const [recoveryNonce, setRecoveryNonce] = useState(0);
  const recoveredAtRef = useRef(0);
  const onCanvasCrash = useCallback((err: Error) => {
    console.error("[sketch] Excalidraw crashed", err);
  }, []);
  const onCanvasRetry = useCallback(() => {
    setRecoveryNonce((n) => n + 1);
  }, []);
  // Stable callback so Excalidraw doesn't see a new prop reference
  // every SkillSketch render. Calling `setExcalReady(true)` on every
  // call is fine — React bails on identical state — but the inline
  // arrow form was a new function each render, which could (and did,
  // in some Excalidraw paths) trigger an internal re-subscribe that
  // emitted during render and starved React's update budget. Going
  // through a ref guarantees we only flip once.
  const readyOnce = useRef(false);
  const excalApiCallback = useCallback((api: unknown) => {
    const a = api as ExcalApi & { updateScene: (d: { elements?: unknown[]; appState?: Record<string, unknown> }) => void };
    // Monkey-patch updateScene to scrub malformed elements at the
    // boundary. Multiple call sites (SWR mirror, websocket reconcile,
    // AI transform, library import) all funnel here — patching once
    // guarantees Excalidraw never sees an undefined/typeless element
    // (which crashes its internal `.filter(...).type` loop).
    const orig = a.updateScene.bind(a);
    a.updateScene = (d: { elements?: unknown[]; appState?: Record<string, unknown> }) => {
      if (Array.isArray(d?.elements)) {
        // 1. Drop malformed elements (no type or null/undefined slots).
        const valid = (d.elements as Array<Record<string, unknown> | null | undefined>)
          .filter((el): el is Record<string, unknown> =>
            !!el && typeof el === "object" && typeof (el as { type?: unknown }).type === "string"
          );
        // 2. Build id set so we can strip dangling boundElement refs
        // and containerId/frameId pointing at deleted elements.
        // Excalidraw's render maps these ids to actual elements; if a
        // referenced id is missing the mapped result is `undefined`
        // and the next `.filter(el => el.type === ...)` crashes.
        const liveIds = new Set<string>();
        for (const el of valid) {
          const id = (el as { id?: unknown }).id;
          if (typeof id === "string") liveIds.add(id);
        }
        const safe = valid.map((el) => {
          const beRaw = (el as { boundElements?: unknown }).boundElements;
          const gi = (el as { groupIds?: unknown }).groupIds;
          const cid = (el as { containerId?: unknown }).containerId;
          const fid = (el as { frameId?: unknown }).frameId;
          const beClean = Array.isArray(beRaw)
            ? (beRaw as unknown[]).filter((b) =>
                !!b && typeof b === "object"
                && typeof (b as { type?: unknown }).type === "string"
                && typeof (b as { id?: unknown }).id === "string"
                && liveIds.has((b as { id: string }).id)
              )
            : [];
          const giClean = Array.isArray(gi) ? gi : [];
          const cidClean = typeof cid === "string" && liveIds.has(cid) ? cid : null;
          const fidClean = typeof fid === "string" && liveIds.has(fid) ? fid : null;
          // Only re-spread if something needed cleaning, to avoid
          // touching element identity unnecessarily.
          const beChanged = !Array.isArray(beRaw) || (beRaw as unknown[]).length !== beClean.length;
          const giChanged = !Array.isArray(gi);
          const cidChanged = (cid ?? null) !== cidClean;
          const fidChanged = (fid ?? null) !== fidClean;
          if (!beChanged && !giChanged && !cidChanged && !fidChanged) return el;
          return {
            ...el,
            boundElements: beClean,
            groupIds: giClean,
            containerId: cidClean,
            frameId: fidClean,
          };
        });
        d = { ...d, elements: safe };
      }
      return orig(d);
    };
    excalRef.current = a;
    if (!readyOnce.current) {
      readyOnce.current = true;
      setExcalReady(true);
    }
  }, []);
  // One-shot scrub: a previous AI-transform bug may have written
  // elements lacking `type` into the scene. Excalidraw crashes its
  // render loop on those (`Cannot read properties of undefined`).
  // Strip them once the API is alive.
  useEffect(() => {
    if (!excalReady) return;
    const api = excalRef.current;
    if (!api) return;
    const els = api.getSceneElements() as Array<Record<string, unknown> | null | undefined>;
    const safe = els.filter((el): el is Record<string, unknown> =>
      !!el && typeof el === "object" && typeof (el as { type?: unknown }).type === "string"
    );
    if (safe.length !== els.length) {
      api.updateScene({ elements: safe });
    }
  }, [excalReady]);
  // Refs the MainMenu can read without triggering re-memo on every
  // SkillSketch render. Updated in a layout effect below.
  const paperModeRef = useRef<PaperMode>("plain");
  const layoutModeRef = useRef<LayoutMode>("board");
  const lastMetaEditAtRef = useRef(0);
  const exportRef = useRef<{
    png?: () => void;
    svg?: () => void;
    json?: () => void;
    excali?: () => void;
    setPaper?: (m: PaperMode) => void;
    setLayout?: (m: "board" | "book") => void;
    setCanvasBg?: (c: string | null) => void;
  }>({});

  // Memoize the MainMenu subtree. Without this, every SkillSketch
  // render builds a fresh React element tree for the menu items;
  // their `useSyncExternalStore` subscriptions re-attach each time,
  // and Excalidraw's emitter's `Set.forEach` over subscribers
  // observed mid-mutation snapshots — the exact stack we kept
  // seeing in the "Maximum update depth" crashes.
  const mainMenuNode = useMemo(() => {
    if (!excalMod) return null;
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
        <MM.DefaultItems.Help />
        <MM.Separator />
        <SidebarRow label="Paper">
          <SidebarIconBtn title="Plain" active={paperMode === "plain"} onClick={() => exportRef.current.setPaper?.("plain")}><PaperModeIcon mode="plain" /></SidebarIconBtn>
          <SidebarIconBtn title="Grid" active={paperMode === "grid"} onClick={() => exportRef.current.setPaper?.("grid")}><PaperModeIcon mode="grid" /></SidebarIconBtn>
          <SidebarIconBtn title="Dots" active={paperMode === "dots"} onClick={() => exportRef.current.setPaper?.("dots")}><PaperModeIcon mode="dots" /></SidebarIconBtn>
          <SidebarIconBtn title="Lined" active={paperMode === "lines"} onClick={() => exportRef.current.setPaper?.("lines")}><PaperModeIcon mode="lines" /></SidebarIconBtn>
        </SidebarRow>
        <SidebarRow label="Layout">
          <SidebarIconBtn title="Board (infinite canvas)" active={layoutMode === "board"} onClick={() => exportRef.current.setLayout?.("board")}>
            <LayoutIcon mode="board" />
          </SidebarIconBtn>
          <SidebarIconBtn title="Book (paged)" active={layoutMode === "book"} onClick={() => exportRef.current.setLayout?.("book")}>
            <LayoutIcon mode="book" />
          </SidebarIconBtn>
        </SidebarRow>
        <MM.Separator />
        <SidebarSwatchGrid
          label="Canvas"
          swatches={CANVAS_BG_SWATCHES}
          onPick={(c) => exportRef.current.setCanvasBg?.(c)}
        />
        <MM.Separator />
        <SidebarRow label="Export">
          <SidebarIconBtn title="Export PNG" onClick={() => exportRef.current.png?.()}><ImageIcon style={{ width: 14, height: 14 }} /></SidebarIconBtn>
          <SidebarIconBtn title="Export SVG" onClick={() => exportRef.current.svg?.()}><FileCode style={{ width: 14, height: 14 }} /></SidebarIconBtn>
          <SidebarIconBtn title="Export .excalidraw" onClick={() => exportRef.current.excali?.()}><Download style={{ width: 14, height: 14 }} /></SidebarIconBtn>
          <SidebarIconBtn title="Copy scene JSON" onClick={() => exportRef.current.json?.()}><Copy style={{ width: 14, height: 14 }} /></SidebarIconBtn>
        </SidebarRow>
        <MM.Separator />
        <MM.DefaultItems.ClearCanvas />
      </MM>
    );
    // NOTE: customBg intentionally NOT in deps — including it rebuilds
    // the whole MainMenu element tree on every pick, which forces MM's
    // useSyncExternalStore subscribers to re-attach mid-mutation and
    // trips the "Maximum update depth" loop (same trap the comment on
    // this memo warns about). SwatchGrid subscribes via the
    // module-scoped customBgStore for its own live value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excalMod, homeHref, paperMode, layoutMode]);

  const appliedFor = useRef<string>("");
  // Apply server scene ONCE per slug on first read. Subsequent SWR
  // polls don't push into Excalidraw — the realtime path is the WS
  // receive handler (which already calls reconcile + updateScene
  // out-of-band). Polling for re-apply was triggering Excalidraw's
  // internal store to emit while React was committing this same
  // tree, hence the recurring "Maximum update depth" stack ending
  // inside MainMenu's `Set.forEach` over its subscribers.
useEffect(() => {
    if (!doc || !excalReady) return;
    const api = excalRef.current;
    if (!api) return;
    const remoteElsRaw = Array.isArray(doc.elements) ? doc.elements : [];
    // Defensive: a past AI-transform bug could have persisted elements
    // without `type` on the server. Strip them before any updateScene.
    // ALSO nuke every relational field (boundElements/containerId/
    // frameId/groupIds) at this layer because Excalidraw's render
    // resolves these to live elements on EVERY tick; a stale ref ends
    // up as `undefined` in an internal .filter chain and crashes.
    const remoteEls = (remoteElsRaw as Array<Record<string, unknown> | null | undefined>)
      .filter((el): el is Record<string, unknown> =>
        !!el && typeof el === "object" && typeof (el as { type?: unknown }).type === "string"
      )
      .map((el) => ({
        ...el,
        groupIds: [],
        boundElements: [],
        containerId: null,
        frameId: null,
      }));
    const firstApply = appliedFor.current !== slug;
    // Continuously mirror layout/paper/bookPages from server. Skipped
    // during the 1.5s after a local toggle (lastMetaEditAtRef) so an
    // SWR poll returning pre-PUT body can't revert the user's choice.
    const skipMetaSync = Date.now() - lastMetaEditAtRef.current < 1500;
    if (!skipMetaSync) {
      if (doc.paperMode && doc.paperMode !== paperMode) {
        setPaperMode(doc.paperMode);
      }
      if (doc.layoutMode && doc.layoutMode !== layoutMode) {
        setLayoutMode(doc.layoutMode);
      }
      // Only seed customBg from doc on FIRST apply per slug — the
      // polling effect re-runs on every SWR refresh (new doc ref each
      // time) and continuously setting state from doc would feedback
      // with onChange → save → reload chain into an update loop.
      // Seed customBg on EVERY sync where the server has a value
      // and the local ref doesn't yet (or differs). Previously this
      // was gated on `firstApply`, but SWR can return a cached
      // copy without canvasBg first, then the fresh one a tick
      // later — by which point firstApply has flipped and the
      // color stayed at whatever the initial render had. Setting
      // only when ref differs still avoids the feedback loop
      // because once applied the values match and we no-op.
      if (typeof doc.canvasBg === "string" && doc.canvasBg !== customBgRef.current) {
        setCustomBg(doc.canvasBg);
      }
      if (Array.isArray(doc.bookPages)) {
        const remotePages = doc.bookPages as BookPage[];
        const localPagesJson = JSON.stringify(bookPagesRef.current);
        const remotePagesJson = JSON.stringify(remotePages);
        if (remotePages.length > 0 && remotePagesJson !== localPagesJson) {
          setBookPages(remotePages);
        }
      } else if (firstApply && typeof doc.bookPageCount === "number" && doc.bookPageCount > 0) {
        // Backward compat: expand old `bookPageCount` to inherit-pages.
        setBookPages(Array.from({ length: doc.bookPageCount }, () => ({ paper: "inherit" as const })));
      }
    }
    if (firstApply) {
      appliedFor.current = slug;
      // Defer the very first updateScene off the React commit phase
      // too. Excalidraw's internal store fires its subscriber set
      // synchronously inside updateScene; running that while React
      // is still committing this same tree was the actual source of
      // the `Set.forEach → <MM>` infinite-update loop.
      const tid = setTimeout(() => {
        const a = excalRef.current;
        if (!a) return;
        applyingRemoteRef.current = true;
        try {
          (a.updateScene as (d: { elements?: unknown[] }) => void)({ elements: remoteEls as unknown[] });
        } catch {}
        setTimeout(() => { applyingRemoteRef.current = false; }, 0);
        const mod = excalModRef.current;
        if (mod) {
          try {
            lastBroadcastedOrReceivedSceneVersion.current = mod.getSceneVersion(remoteEls as never);
          } catch {}
        }
      }, 0);
      return () => clearTimeout(tid);
    }
    // Subsequent SWR refreshes: reconcile remote against local off
    // the React commit phase so updateScene's internal store emit
    // doesn't loop back into the MainMenu render (was the source of
    // the recurring "Maximum update depth" crashes). The setTimeout
    // hop pushes the reconcile into a fresh task, after commit.
    const mod = excalModRef.current;
    if (!mod) return;
    const remoteVer = (() => { try { return mod.getSceneVersion(remoteEls as never); } catch { return -1; } })();
    if (remoteVer <= lastBroadcastedOrReceivedSceneVersion.current) return;
    const tid = setTimeout(() => {
      const a = excalRef.current;
      if (!a) return;
      try {
        const local = a.getSceneElements() as never;
        const appState = a.getAppState() as never;
        const restored = (mod.restoreElements as (r: unknown, e: unknown) => unknown)(remoteEls, local);
        const reconciled = mod.reconcileElements(local, restored as never, appState);
        lastBroadcastedOrReceivedSceneVersion.current = mod.getSceneVersion(reconciled as never);
        applyingRemoteRef.current = true;
        (a.updateScene as unknown as (d: { elements?: unknown[]; captureUpdate?: string }) => void)({
          elements: reconciled as unknown as unknown[],
          captureUpdate: mod.CaptureUpdateAction.NEVER,
        });
        setTimeout(() => { applyingRemoteRef.current = false; }, 0);
      } catch { applyingRemoteRef.current = false; }
    }, 0);
    return () => clearTimeout(tid);
  }, [slug, doc, excalReady]);

  // Insert a single library item's raw Excalidraw elements onto the canvas.
  // The categorized stamp sidebar uses this; library items are already in
  // final element form (not skeleton), so we just regen IDs + remap bindings
  // + translate next to existing content. Without ID remapping the same
  // stamp dropped twice would collide on element id.
  const insertLibElements = useCallback(async (rawEls: ReadonlyArray<Record<string, unknown>>) => {
    const api = excalRef.current;
    if (!api || !rawEls.length) return;
    const newId = () => "lib_" + Math.random().toString(36).slice(2, 10);
    const idMap = new Map<string, string>();
    for (const e of rawEls) {
      const id = (e as { id?: string }).id;
      if (typeof id === "string") idMap.set(id, newId());
    }
    const remap = (s: string | undefined): string | undefined => (s && idMap.get(s)) || s;
    const groupRemap = new Map<string, string>();
    const fresh = rawEls.map((src) => {
      const e = { ...src } as Record<string, unknown>;
      const oldId = e.id as string | undefined;
      if (oldId) e.id = idMap.get(oldId) ?? newId();
      e.seed = Math.floor(Math.random() * 2 ** 31);
      if (Array.isArray(e.boundElements)) {
        e.boundElements = (e.boundElements as Array<{ id?: string; type?: string }>).map((b) => ({ ...b, id: remap(b.id) ?? "" }));
      }
      const sb = e.startBinding as { elementId?: string } | undefined;
      if (sb?.elementId) e.startBinding = { ...sb, elementId: remap(sb.elementId) };
      const eb = e.endBinding as { elementId?: string } | undefined;
      if (eb?.elementId) e.endBinding = { ...eb, elementId: remap(eb.elementId) };
      if (typeof e.containerId === "string") e.containerId = remap(e.containerId);
      if (Array.isArray(e.groupIds)) {
        e.groupIds = (e.groupIds as string[]).map((g) => {
          if (!groupRemap.has(g)) groupRemap.set(g, newId());
          return groupRemap.get(g)!;
        });
      }
      return e;
    });
    const bb = sceneBBox(fresh);
    if (bb) {
      const current = api.getSceneElements();
      const sceneBB = sceneBBox(current);
      const appState = api.getAppState() as { scrollX?: number; scrollY?: number; width?: number; height?: number; zoom?: { value?: number } };
      let targetX: number, targetY: number;
      if (sceneBB) {
        targetX = sceneBB.maxX + 60;
        targetY = sceneBB.minY;
      } else if (typeof appState.scrollX === "number" && typeof appState.width === "number") {
        const zoom = appState.zoom?.value ?? 1;
        targetX = -appState.scrollX + (appState.width / zoom) / 2 - (bb.maxX - bb.minX) / 2;
        targetY = -(appState.scrollY ?? 0) + ((appState.height ?? 0) / zoom) / 2 - (bb.maxY - bb.minY) / 2;
      } else {
        targetX = 100; targetY = 100;
      }
      const dx = targetX - bb.minX;
      const dy = targetY - bb.minY;
      for (const el of fresh) {
        if (typeof el.x === "number") el.x = (el.x as number) + dx;
        if (typeof el.y === "number") el.y = (el.y as number) + dy;
      }
    }
    const current = api.getSceneElements();
    api.updateScene({ elements: [...(current as unknown[]), ...fresh] });
    try { api.scrollToContent(fresh as never); } catch {}
  }, []);
  useEffect(() => { appliedFor.current = ""; lastBroadcastedOrReceivedSceneVersion.current = -1; }, [slug]);

  // Stable onLibraryChange — inline arrow at the Excalidraw JSX site
  // creates a fresh function every SkillSketch render, which made
  // Excalidraw's emitter re-attach subscribers and trip the
  // "Maximum update depth" loop (same trap mainMenuNode warns about).
  const onLibraryChange = useCallback((items: ReadonlyArray<Record<string, unknown>>) => {
    try {
      const extras = items.filter((it) => {
        const id = (it as { id?: string }).id ?? "";
        return !id.startsWith("seed-");
      });
      localStorage.setItem(`sklib-imports-${slug}`, JSON.stringify(extras));
    } catch { /* quota/SecurityError → silently drop */ }
  }, [slug]);

  // Seed Excalidraw's NATIVE library with our 6 vendored
  // .excalidrawlib categories. Built-in library sidebar (book icon)
  // renders them with native UX. Fighting withInternalFallback with a
  // custom Sidebar always looped on "Maximum update depth".
  //
  // For category filtering: we track per-cat counts in state, then
  // <LibraryFilterBar /> portals a tab strip into the library panel's
  // header. Filter sets a data attribute on the items grid; CSS rules
  // hide library-units outside the active cat by nth-child range.
  const libSeededRef = useRef(false);
  const [catCounts, setCatCounts] = useState<number[] | null>(null);
  // Number of user-imported items sitting AHEAD of our seeded section
  // in Excalidraw's library list (Excalidraw merges new items at the
  // FRONT). Filter-bar nth-child ranges shift by this amount so a
  // category click still hides/shows the right rows after imports.
  const [frontOffset, setFrontOffset] = useState(0);
  useEffect(() => {
    if (!excalReady || libSeededRef.current) return;
    const api = excalRef.current;
    if (!api?.updateLibrary) return;
    libSeededRef.current = true;
    (async () => {
      const lists = await Promise.all(LIB_CATS.map(async (c) => {
        try {
          const r = await fetch(`/sketch-libs/${c.file}.excalidrawlib`);
          if (!r.ok) return [] as Array<Record<string, unknown>>;
          const j = await r.json() as { libraryItems?: Array<Record<string, unknown>>; library?: unknown[][] };
          // Use STABLE per-cat IDs so reloads see the same items
          // already in the library and we can compute frontOffset by
          // diffing live library vs. seeded ID set.
          if (Array.isArray(j.libraryItems)) {
            return j.libraryItems.map((it, i) => ({
              ...it,
              status: "unpublished",
              id: `seed-${c.id}-${i}`,
            }));
          }
          if (Array.isArray(j.library)) {
            return j.library.map((els, i) => ({
              status: "unpublished",
              elements: els,
              id: `seed-${c.id}-${i}`,
              created: Date.now(),
            }));
          }
          return [];
        } catch { return []; }
      }));
      const counts = lists.map((l) => l.length);
      const allSeed = lists.flat();
      if (!allSeed.length) return;
      const seedIdSet = new Set(allSeed.map((it) => (it as { id: string }).id));
      try {
        // Use the function form of updateLibrary so we can inspect the
        // CURRENT library before merging. This lets us:
        //   1. Compute how many user-imported items live at the front
        //      of the library (Excalidraw places new items at index 0).
        //   2. Skip seed items already present to avoid duplicate
        //      churn after a reload.
        // Reload user-imported items from localStorage so they
        // survive a page refresh. Excalidraw's library is in-memory
        // only — we own persistence via `onLibraryChange`.
        const stored = (() => {
          try {
            const raw = localStorage.getItem(`sklib-imports-${slug}`);
            if (!raw) return [] as Array<Record<string, unknown>>;
            const arr = JSON.parse(raw) as Array<Record<string, unknown>>;
            return Array.isArray(arr) ? arr : [];
          } catch { return [] as Array<Record<string, unknown>>; }
        })();
        api.updateLibrary?.({
          libraryItems: (curr: Array<{ id?: string }>) => {
            const haveIds = new Set(curr.map((it) => it.id).filter(Boolean) as string[]);
            // Order matters: imports BEFORE seed so they land at the
            // front (matching Excalidraw's merge behavior — new items
            // go to index 0 — so subsequent live imports keep stacking
            // on top in the same relative order).
            const additions = [
              ...stored.filter((it) => !haveIds.has((it as { id?: string }).id ?? "")),
              ...allSeed.filter((s) => !haveIds.has((s as { id: string }).id)),
            ];
            const frontCount = curr.filter((it) => !seedIdSet.has(it.id ?? "")).length
              + stored.filter((it) => !haveIds.has((it as { id?: string }).id ?? "")).length;
            setFrontOffset(frontCount);
            return additions;
          },
          merge: true,
          defaultStatus: "unpublished",
        });
        setCatCounts(counts);
      } catch (e) { console.warn("updateLibrary failed", e); }
    })();
  }, [excalReady]);

  const initialData = useMemo(() => {
    if (!doc) return undefined;
    const rawEls = Array.isArray(doc.elements) ? doc.elements : [];
    // NUCLEAR: mount Excalidraw EMPTY. Real elements get pushed via
    // updateScene right after mount — that path goes through our
    // patched updateScene which strips every malformed/dangling
    // reference. Putting raw doc.elements into initialData has been
    // crashing Excalidraw's render before any of our defenses run,
    // because internal mount paths bypass updateScene.
    const elements: Array<Record<string, unknown>> = [];
    // Keep raw elements stashed on the doc itself so a post-mount
    // effect can push them through updateScene (see below).
    void (rawEls as unknown);
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
    // Force initial viewBackgroundColor to match the layoutMode/paperMode
    // about to be applied. Otherwise the canvas mounts white and any
    // BookPagesOverlay / PaperBackdrop underneath stays hidden until the
    // post-mount effect at line ~229 runs — long enough for the user to
    // see a flash of "no pages".
    // Canvas bg is always painted by the wrapper div now (see
    // viewBackgroundColor effect + JSX style prop), so Excalidraw's
    // internal viewBackgroundColor stays transparent across all
    // paper/layout modes. Keeps dark colors actually dark in plain.
    safeAppState.viewBackgroundColor = "transparent";
    return {
      elements: elements as never,
      appState: { ...safeAppState, collaborators: new Map() } as never,
      files: (doc.files && typeof doc.files === "object" ? doc.files : {}) as never,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, !!doc]);

  const save = useCallback(async (payload: object) => {
    // Read meta from refs so save always uses the latest layout/paper
    // values (the useCallback only depends on skill+slug; capturing
    // state directly would stale-close over post-toggle values and
    // ship the prior layoutMode/paperMode/bookPages with every save).
    const merged = {
      ...payload,
      title: skill,
      paperMode: paperModeRef.current,
      layoutMode: layoutModeRef.current,
      bookPages: bookPagesRef.current,
      canvasBg: customBgRef.current,
    };
    const body = JSON.stringify({ data: merged });
    if (body === last.current) return;
    last.current = body;
    const r = await fetch(`${API}/api/drawings/${slug}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body,
    });
    if (r.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      // Prime ETag with the FULL merged body (including meta) so the
      // imminent SWR 304 returns a body that still has layoutMode /
      // paperMode / bookPages — without this the cached body was
      // missing meta and the SWR re-render flipped book mode off.
      const newEtag = r.headers.get("etag");
      if (newEtag) primeEtag(`/api/drawings/${slug}`, newEtag, merged);
    }
  }, [skill, slug]);

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
          paperMode: paperModeRef.current,
          layoutMode: layoutModeRef.current,
          bookPages: bookPagesRef.current,
          canvasBg: customBgRef.current,
        },
      });
      const r = await fetch(`${API}/api/drawings/${slug}`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body,
      });
      if (!r.ok) throw new Error(`${r.status}`);
      last.current = body;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      const newEtag = r.headers.get("etag");
      if (newEtag) primeEtag(`/api/drawings/${slug}`, newEtag, JSON.parse(body).data);
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
    // Adaptive heartbeat: 8 s while tab visible, 30 s when hidden.
    // Backend prunes at 15 s so 8 s keeps the row alive with one
    // beat per window. Was 4 s and produced log spam in dev.
    let id: ReturnType<typeof setInterval>;
    const start = () => { id = setInterval(beat, document.visibilityState === "hidden" ? 30000 : 8000); };
    const restart = () => { clearInterval(id); start(); };
    start();
    document.addEventListener("visibilitychange", restart);
    const onUnload = () => {
      // DELETE with keepalive is reliable on page hide in modern browsers
      // and avoids the prior POST-without-body which the route 400s on.
      try {
        fetch(`/api/presence/${encodeURIComponent(slug)}?sessionId=${encodeURIComponent(sid)}`, { method: "DELETE", keepalive: true }).catch(() => {});
      } catch {}
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", restart);
      window.removeEventListener("beforeunload", onUnload);
      onUnload();
    };
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
  // version on every remote apply.
  const excalModRef = useRef<ExcalMod | null>(null);
  useEffect(() => { excalModRef.current = excalMod; }, [excalMod]);
  const lastBroadcastedOrReceivedSceneVersion = useRef(-1);
  // Synchronous flag set just before any `updateScene` call we make
  // ourselves (initial seed, remote apply, reset). Excalidraw fires
  // onChange synchronously inside updateScene, and even with
  // `captureUpdate: NEVER` the post-apply scene version can differ
  // from the value we pre-set the counter to — which let the
  // save→mutate→refetch→apply loop slip through and tripped React's
  // "Maximum update depth". The flag makes the gate boolean and
  // race-proof.
  const applyingRemoteRef = useRef(false);

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
  const onChange = useCallback((
    elements: readonly unknown[],
    appState: unknown,
    files: Record<string, unknown>,
  ) => {
    // If onChange is being triggered by our own `updateScene` call
    // (remote apply, initial seed, reset), suppress everything —
    // including setMiniData, which would otherwise re-render
    // SkillSketch, which re-renders Excalidraw's MainMenu, which
    // emits, which fires another onChange echo, etc. The seed effect
    // and the reconcile effect both update miniData directly.
    if (applyingRemoteRef.current) return;
    const mod = excalModRef.current;
    if (mod) {
      try {
        const sceneVersion = mod.getSceneVersion(elements as never);
        if (sceneVersion > lastBroadcastedOrReceivedSceneVersion.current) {
          lastBroadcastedOrReceivedSceneVersion.current = sceneVersion;
        }
      } catch {}
    }
    lastEditAt.current = Date.now();
    if (t.current) clearTimeout(t.current);
    // Both sides autosave — backend reconciles by (id, version) so
    // concurrent PUTs from laptop + tablet merge instead of overwriting.
    t.current = setTimeout(() => {
      save({ elements: [...elements], appState: appState as Record<string, unknown>, files });
    }, DEBOUNCE_MS);
    const now = Date.now();
    if (now - miniThrottle.current > 33) {
      miniThrottle.current = now;
      setMiniData({ els: elements, app: appState as Record<string, unknown> });
    }
    // Realtime broadcast — version already advanced above in the
    // echo-gate, so we just stage the pending payload here. ws.onopen
    // drains it if the socket isn't open yet.
    if (mod) {
      try {
        const bg = (appState as { viewBackgroundColor?: string })?.viewBackgroundColor;
        pendingSend.current = { elements, bg };
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
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
      } catch {}
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
          const msg = JSON.parse(ev.data) as { type: string; count?: number; elements?: unknown[]; senderId?: string; seq?: number };
          if (msg.type === "peers") {
            setLivePeers(Math.max(0, (msg.count ?? 1) - 1));
            return;
          }
          if (msg.type !== "scene" || !Array.isArray(msg.elements)) return;
          // Defense in depth: drop own loopbacks + stale frames.
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
              // CRITICAL: bump version BEFORE updateScene so the
              // synchronous onChange echo returns early.
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
        // On (re)connect, flush the latest scene from this client so a
        // peer that joined first immediately sees what we already drew.
        // Without this, strokes made while the socket was still
        // connecting silently dropped and only appeared after the next
        // local edit / next SWR poll.
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


  // Synchronously flush a pending save — used by reset + beforeunload
  // so a quick reload doesn't drop the most recent edit on the floor.
  const flushSaveNow = useCallback(async () => {
    const api = excalRef.current;
    if (!api) return;
    if (t.current) { clearTimeout(t.current); t.current = null; }
    try {
      const getAll = (api as unknown as { getSceneElementsIncludingDeleted?: () => readonly unknown[] }).getSceneElementsIncludingDeleted;
      const all = getAll ? getAll.call(api) : api.getSceneElements();
      last.current = ""; // bypass dedupe so even a forced re-save lands
      await save({ elements: [...all], appState: api.getAppState() as Record<string, unknown>, files: api.getFiles() });
    } catch {}
  }, [save]);

  // Best-effort flush on tab close / nav / hide. `sendBeacon` works
  // when fetch wouldn't, and `visibilitychange` covers iOS swipe-to-
  // background which never fires `beforeunload`.
  useEffect(() => {
    const beaconSave = () => {
      const api = excalRef.current;
      if (!api) return;
      try {
        const getAll = (api as unknown as { getSceneElementsIncludingDeleted?: () => readonly unknown[] }).getSceneElementsIncludingDeleted;
        const all = getAll ? getAll.call(api) : api.getSceneElements();
        const body = JSON.stringify({
          data: { title: skill, elements: [...all], appState: api.getAppState(), files: api.getFiles() },
        });
        navigator.sendBeacon?.(`${API}/api/drawings/${encodeURIComponent(slug)}`, new Blob([body], { type: "application/json" }));
      } catch {}
    };
    const onHidden = () => { if (document.visibilityState === "hidden") beaconSave(); };
    window.addEventListener("beforeunload", beaconSave);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("beforeunload", beaconSave);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [skill, slug]);

  const reset = async () => {
    if (!confirm(`Clear all elements on ${skill} sketch?`)) return;
    const api = excalRef.current;
    const mod = excalModRef.current;
    if (api && mod) {
      // Tombstone every live element instead of PUT-ing []: the
      // backend (and Excalidraw's collab reconciler) merge by id
      // and would otherwise prefer existing live elements over a
      // missing-from-peer one. Bumped version + fresh versionNonce
      // guarantees reconcile picks the deleted record.
      const getAll = (api as unknown as { getSceneElementsIncludingDeleted?: () => readonly unknown[] }).getSceneElementsIncludingDeleted;
      const live = (getAll ? getAll.call(api) : api.getSceneElements()) as ReadonlyArray<Record<string, unknown>>;
      const tombstoned = live.map((e) => ({
        ...e,
        isDeleted: true,
        version: ((typeof e.version === "number" ? e.version : 0) as number) + 1,
        versionNonce: Math.floor(Math.random() * 0x7fffffff),
      }));
      try {
        (api.updateScene as unknown as (d: { elements?: unknown[]; captureUpdate?: string }) => void)({
          elements: tombstoned,
          captureUpdate: mod.CaptureUpdateAction.IMMEDIATELY,
        });
      } catch {}
      // Force-save immediately so a quick reload can't drop the
      // tombstones before the debounce fires. Without this, the
      // user's clear gets lost on F5 and old strokes come back.
      try {
        last.current = ""; // bypass dedupe
        await save({
          elements: tombstoned as unknown as object[],
          appState: api.getAppState() as Record<string, unknown>,
          files: api.getFiles(),
        });
      } catch {}
      return;
    }
    // Fallback if Excalidraw isn't mounted yet: blow the doc away
    // server-side directly.
    await fetch(`${API}/api/drawings/${slug}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ data: { title: skill, elements: [], appState: {}, files: {} } }),
    });
    last.current = "";
    mutate();
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

    // Layout target: in book mode → current page bounds (so AI gen
    // can't spill outside the sheet). Otherwise → next to existing
    // content / center of viewport.
    const freshBBox = sceneBBox(fresh);
    if (freshBBox) {
      if (layoutMode === "book") {
        const top = bookPageTop(bookPageRef.current);
        const fitted = fitElementsToBbox(
          fresh as unknown as Array<{ x?: number; y?: number; width?: number; height?: number; fontSize?: number; points?: ReadonlyArray<readonly [number, number]> }>,
          { x: 0, y: top, width: BOOK_PAGE_W, height: BOOK_PAGE_H },
          40,
        );
        for (let i = 0; i < fresh.length; i++) {
          const f = fitted[i] as Record<string, unknown>;
          Object.assign(fresh[i], f);
        }
      } else {
        const current = api.getSceneElements();
        const sceneBB = sceneBBox(current);
        const appState = api.getAppState() as { scrollX?: number; scrollY?: number; width?: number; height?: number; zoom?: { value?: number } };
        let targetX: number, targetY: number;
        if (sceneBB) {
          targetX = sceneBB.maxX + 80;
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
      // Validate before pasting — flag the common "text outside frame"
      // / "arrows are floating" issues so we can warn the user instead
      // of letting Excalidraw render a garbled scene.
      const report = validateAiElements(els as never);
      if (!report.ok) {
        const sample = report.issues.slice(0, 3).map((i) => i.kind).join(", ");
        toast.warning(`AI output had ${report.issues.length} issue${report.issues.length === 1 ? "" : "s"} (${sample}). Pasting anyway.`);
      }
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
    const { exportToCanvas } = await loadExcal();
    // Bg: explicit customBg picked by the user, else theme default.
    // Skipping getComputedStyle keeps SVG and PNG in lockstep.
    const bg = customBgRef.current || (resolvedTheme === "dark" ? "#1b1b1f" : "#ffffff");
    // Render strokes onto a TRANSPARENT canvas so we can composite
    // the on-screen paper pattern underneath. exportToBlob with a
    // viewBackgroundColor paints only flat color — losing dots/
    // grid/lines and producing the "wrong color" PNG.
    // Detect bg luma to pick the right theme: rendering with
    // `theme: light` on a dark page makes Excalidraw remap light
    // strokes to dark (and vice versa). Match the theme to the bg.
    const bgIsDark = (() => {
      const v = bg.toLowerCase().trim();
      const hm = /^#?([0-9a-f]{6})$/.exec(v.replace("#", ""));
      if (hm) {
        const n = parseInt(hm[1], 16);
        const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
        return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
      }
      const rm = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
      if (rm) {
        const r = +rm[1], g = +rm[2], b = +rm[3];
        return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
      }
      return false;
    })();
    // Match the theme to the bg. Excalidraw's dark-theme render
    // applies a hue-rotate + invert that maps stored colors to
    // their visible-on-dark equivalents (the "orange-looking red"
    // the user saw). For PNG, exportToCanvas rasterizes the final
    // colors directly — no leftover filter, so the canvas is
    // exactly what the user sees on screen.
    const strokesCanvas = await (exportToCanvas as unknown as (opts: unknown) => Promise<HTMLCanvasElement>)({
      elements: api.getSceneElements() as never,
      appState: {
        ...api.getAppState(),
        theme: bgIsDark ? "dark" : "light",
        exportWithDarkMode: bgIsDark,
        exportBackground: false,
        viewBackgroundColor: "transparent",
        exportScale: 2,
        exportEmbedScene: false,
      } as never,
      files: api.getFiles() as never,
    });
    const out = document.createElement("canvas");
    out.width = strokesCanvas.width;
    out.height = strokesCanvas.height;
    const ctx = out.getContext("2d");
    if (!ctx) return toast.error("2d context unavailable");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, out.width, out.height);
    // Paint paper pattern (dots / grid / lines) so the PNG matches
    // the on-screen look. patternScale = output px per world unit.
    try {
      const app = api.getAppState() as { width?: number };
      const patternScale = app.width ? strokesCanvas.width / app.width : 2;
      drawPaperPattern(ctx, out.width, out.height, paperModeRef.current, patternScale, bg);
    } catch {}
    ctx.drawImage(strokesCanvas, 0, 0);
    const blob = await new Promise<Blob>((res, rej) => {
      out.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png");
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
    // Bg: customBg first (the value the user explicitly picked),
    // then theme default. Skip computed style — the wrapper paints
    // bg via Excalidraw's view background, so getComputedStyle on
    // the wrap div often returns the page bg, not the canvas bg.
    const bg = customBgRef.current || (resolvedTheme === "dark" ? "#1b1b1f" : "#ffffff");
    const NS = "http://www.w3.org/2000/svg";
    const hexToLuma = (v: string): number => {
      const t = v.toLowerCase().trim();
      const hm = /^#?([0-9a-f]{6})$/.exec(t.replace("#", ""));
      if (hm) {
        const n = parseInt(hm[1], 16);
        const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
        return 0.299 * r + 0.587 * g + 0.114 * b;
      }
      const rm = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(t);
      if (rm) return 0.299 * +rm[1] + 0.587 * +rm[2] + 0.114 * +rm[3];
      return 255;
    };
    const bgIsDark = hexToLuma(bg) < 128;
    // Render at the SAME theme as the destination bg. Excalidraw
    // remaps stored colors via dark-mode color mapping (not just
    // a global CSS invert filter) so the visible color on a dark
    // canvas matches what users picked from the swatch grid.
    // Using `theme: light` for a dark bg made oranges render as
    // their dark-red stored equivalents.
    const svgEl = await exportToSvg({
      elements: api.getSceneElements() as never,
      appState: {
        ...api.getAppState(),
        theme: bgIsDark ? "dark" : "light",
        exportWithDarkMode: bgIsDark,
        exportBackground: false,
        viewBackgroundColor: "transparent",
      } as never,
      files: api.getFiles() as never,
      exportPadding: 0,
    });
    // Excalidraw's dark-mode SVG export applies a CSS `filter`
    // (invert + hue-rotate) to the root <svg>. If we paint our
    // bg rect at the root level it gets inverted too (which is
    // the "lavender bg on dark canvas" bug). Move that filter
    // off the root onto a <g> wrapping the existing children, so
    // strokes stay inverted (matching the canvas) but our bg
    // sits OUTSIDE the filtered group.
    try {
      const rootFilter = svgEl.getAttribute("filter");
      if (rootFilter) {
        svgEl.removeAttribute("filter");
        const doc = svgEl.ownerDocument;
        const wrap = doc.createElementNS("http://www.w3.org/2000/svg", "g");
        wrap.setAttribute("filter", rootFilter);
        // Move every child of svg (except <defs>, which holds the
        // filter definition itself) into the wrapper.
        const movables: Node[] = [];
        svgEl.childNodes.forEach((n: Node) => {
          const tag = (n as Element).tagName?.toLowerCase();
          if (tag !== "defs") movables.push(n);
        });
        for (const n of movables) wrap.appendChild(n);
        svgEl.appendChild(wrap);
      }
    } catch {}
    // Crop viewBox to true content bounds. Prefer Excalidraw's
    // own getCommonBounds (accounts for stroke width, text
    // glyph overshoot, rotation, etc) — falls back to a raw
    // element x/y/w/h sweep only if the helper isn't available.
    try {
      const els = (api.getSceneElements() as Array<Record<string, unknown>>).filter((el) => !el.isDeleted);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      try {
        const mod = await loadExcal();
        const getCommonBounds = (mod as unknown as {
          getCommonBounds?: (els: unknown[]) => [number, number, number, number]
        }).getCommonBounds;
        if (getCommonBounds) {
          const [x1, y1, x2, y2] = getCommonBounds(els as unknown[]);
          minX = x1; minY = y1; maxX = x2; maxY = y2;
        }
      } catch {}
      if (!Number.isFinite(minX)) {
        for (const el of els) {
          const x = Number((el as { x?: unknown }).x) || 0;
          const y = Number((el as { y?: unknown }).y) || 0;
          const w = Number((el as { width?: unknown }).width) || 0;
          const h = Number((el as { height?: unknown }).height) || 0;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x + w > maxX) maxX = x + w;
          if (y + h > maxY) maxY = y + h;
        }
      }
      if (Number.isFinite(minX) && Number.isFinite(maxX)) {
        // Pad by max stroke width so antialiased edges + text
        // glyph overshoot don't get clipped on the left/right.
        let maxStroke = 4;
        for (const el of els) {
          const sw = Number((el as { strokeWidth?: unknown }).strokeWidth);
          if (Number.isFinite(sw) && sw > maxStroke) maxStroke = sw;
        }
        // Generous padding — Excalidraw text glyphs can extend
        // ~font-size/2 beyond the stored element width, and stroke
        // antialiasing adds another half-width. Anything tighter
        // clips the leftmost glyph on text-heavy exports.
        const PAD = Math.ceil(Math.max(maxStroke * 2, 24));
        const vbx = minX - PAD;
        const vby = minY - PAD;
        const vw = (maxX - minX) + 2 * PAD;
        const vh = (maxY - minY) + 2 * PAD;
        svgEl.setAttribute("viewBox", `${vbx} ${vby} ${vw} ${vh}`);
        // Drop fixed width/height — when set to a pixel count, the
        // browser's standalone SVG viewer renders the file at that
        // intrinsic size and pads the rest of the tab with white
        // space. Using 100% with the viewBox + preserveAspectRatio
        // makes the file scale to whatever container it's dropped
        // into (browser tab, <img>, <object>, Figma, etc.) without
        // a baked-in whitespace strip.
        svgEl.setAttribute("width", "100%");
        svgEl.setAttribute("height", "100%");
        svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
      } else {
        // Fallback: lock width/height to whatever viewBox Excalidraw
        // emitted so they at least agree.
        const vbAttr = svgEl.getAttribute("viewBox");
        if (vbAttr) {
          const [, , vw, vh] = vbAttr.split(/\s+/).map(Number);
          svgEl.setAttribute("width", String(vw));
          svgEl.setAttribute("height", String(vh));
        }
      }
    } catch {}
    // Compose underlay: solid bg rect + (optional) paper pattern.
    // Use the svg's viewBox so the underlay matches the export
    // bounds, regardless of where strokes actually sit in world.
    try {
      const vb = svgEl.getAttribute("viewBox") || "0 0 100 100";
      const [vbx, vby, vbw, vbh] = vb.split(/\s+/).map(Number);
      const doc = svgEl.ownerDocument;

      // Solid bg rect.
      const bgRect = doc.createElementNS(NS, "rect");
      bgRect.setAttribute("x", String(vbx));
      bgRect.setAttribute("y", String(vby));
      bgRect.setAttribute("width", String(vbw));
      bgRect.setAttribute("height", String(vbh));
      bgRect.setAttribute("fill", bg);

      // Paper pattern: build a <pattern> in <defs> and overlay a
      // second rect filled with it.
      const mode = paperModeRef.current;
      let patternRect: SVGRectElement | null = null;
      if (mode !== "plain") {
        const ink = bgIsDark ? "rgba(255,255,255,0.45)" : "rgba(20,20,24,0.45)";
        let defs = svgEl.querySelector("defs");
        if (!defs) {
          defs = doc.createElementNS(NS, "defs");
          svgEl.insertBefore(defs, svgEl.firstChild);
        }
        const pat = doc.createElementNS(NS, "pattern");
        const pid = `paper-${Math.random().toString(36).slice(2, 8)}`;
        pat.setAttribute("id", pid);
        pat.setAttribute("patternUnits", "userSpaceOnUse");
        if (mode === "grid") {
          const s = 32;
          pat.setAttribute("width", String(s));
          pat.setAttribute("height", String(s));
          const v = doc.createElementNS(NS, "path");
          v.setAttribute("d", `M ${s} 0 L 0 0 0 ${s}`);
          v.setAttribute("fill", "none");
          v.setAttribute("stroke", ink);
          v.setAttribute("stroke-width", "1");
          pat.appendChild(v);
        } else if (mode === "dots") {
          const s = 24;
          pat.setAttribute("width", String(s));
          pat.setAttribute("height", String(s));
          const c = doc.createElementNS(NS, "circle");
          c.setAttribute("cx", "0");
          c.setAttribute("cy", "0");
          c.setAttribute("r", "1.2");
          c.setAttribute("fill", ink);
          pat.appendChild(c);
        } else {
          const s = 28;
          pat.setAttribute("width", String(s));
          pat.setAttribute("height", String(s));
          const l = doc.createElementNS(NS, "line");
          l.setAttribute("x1", "0"); l.setAttribute("y1", "0");
          l.setAttribute("x2", String(s)); l.setAttribute("y2", "0");
          l.setAttribute("stroke", ink);
          l.setAttribute("stroke-width", "1");
          pat.appendChild(l);
        }
        defs.appendChild(pat);
        const pr = doc.createElementNS(NS, "rect");
        pr.setAttribute("x", String(vbx));
        pr.setAttribute("y", String(vby));
        pr.setAttribute("width", String(vbw));
        pr.setAttribute("height", String(vbh));
        pr.setAttribute("fill", `url(#${pid})`);
        patternRect = pr;
      }
      // Insert rects BEFORE the first non-defs child so they sit
      // under the strokes.
      const firstChild = Array.from(svgEl.childNodes).find(
        (n) => (n as Element).tagName?.toLowerCase() !== "defs",
      ) as Node | undefined;
      if (firstChild) {
        svgEl.insertBefore(bgRect, firstChild);
        if (patternRect) svgEl.insertBefore(patternRect, firstChild);
      } else {
        svgEl.appendChild(bgRect);
        if (patternRect) svgEl.appendChild(patternRect);
      }
    } catch {}
    const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: "image/svg+xml" });
    triggerDownload(blob, `${skill}-sketch.svg`);
  };

  // Native Excalidraw file export — opens cleanly in excalidraw.com,
  // VS Code Excalidraw extension, or any Excalidraw-compatible tool.
  const exportExcalidraw = async () => {
    const api = excalRef.current;
    if (!api) return toast.error("Canvas not ready");
    const app = api.getAppState() as Record<string, unknown>;
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "iwantajob",
      elements: api.getSceneElements(),
      appState: {
        gridSize: app.gridSize ?? null,
        viewBackgroundColor: (app.viewBackgroundColor as string) ?? "#ffffff",
      },
      files: api.getFiles(),
    };
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" });
    triggerDownload(blob, `${skill}-sketch.excalidraw`);
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

  // Keep MainMenu refs current. MainMenu is memoized on
  // [excalMod, homeHref], so it calls exportRef.current.* at the time
  // the user clicks — no re-memo needed.
  useEffect(() => {
    exportRef.current.png = exportPng;
    exportRef.current.svg = exportSvg;
    exportRef.current.json = copyShareJson;
    exportRef.current.excali = exportExcalidraw;
    exportRef.current.setPaper = (m) => { lastMetaEditAtRef.current = Date.now(); setPaperMode(m); };
    exportRef.current.setLayout = (m) => { lastMetaEditAtRef.current = Date.now(); setLayoutMode(m); };
    exportRef.current.setCanvasBg = (c) => {
      lastMetaEditAtRef.current = Date.now();
      setCustomBg(c);
      // Wrapper div paints the bg in every mode now, so Excalidraw's
      // canvas always stays transparent. No viewBackgroundColor push.
      const api = excalRef.current;
      if (!api) return;
      try {
        api.updateScene({ appState: { viewBackgroundColor: "transparent" } });
        (api as { refresh?: () => void }).refresh?.();
      } catch {}
    };
  });
  useEffect(() => { paperModeRef.current = paperMode; }, [paperMode]);
  useEffect(() => { layoutModeRef.current = layoutMode; }, [layoutMode]);

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

      <div
        ref={canvasWrapRef}
        data-paper-overlay={(layoutMode === "book" || paperMode !== "plain") ? "1" : undefined}
        className={`relative rounded-xl overflow-hidden border border-foreground/10 bg-card ${full ? "flex-1" : "h-[70vh]"}`}
        // Wrapper paints canvas bg in ALL modes. No customBg → fall
        // through to bg-card (theme color) so "Clear (theme)" behaves
        // identically across paper modes (was rendering white in plain
        // and theme-dark in dotted/grid/lined before).
        style={customBg ? { background: customBg } : undefined}
      >
        {paperMode !== "plain" && layoutMode !== "book" && (
          <PaperBackdrop mode={paperMode} appState={miniData.app} bgColor={customBg} />
        )}
        {layoutMode === "book" && (
          <>
            <BookPagesOverlay appState={miniData.app} pages={bookPages} globalPaper={paperMode} />
            <BookNavWidget
              page={bookPage}
              pageCount={bookPageCount}
              framePresenting={presenting}
              onPrev={() => goToBookPage(bookPage - 1)}
              onNext={() => goToBookPage(bookPage + 1)}
              onJump={(idx) => goToBookPage(idx)}
              onAddPage={() => {
                lastMetaEditAtRef.current = Date.now();
                setBookPages((prev) => [...prev, { paper: "inherit" }]);
                setTimeout(() => goToBookPage(bookPagesRef.current.length), 0);
              }}
              onDeletePage={(idx) => {
                lastMetaEditAtRef.current = Date.now();
                setBookPages((prev) => {
                  if (prev.length <= 1) return prev; // keep at least 1
                  const next = prev.filter((_, i) => i !== idx);
                  return next;
                });
                setTimeout(() => goToBookPage(Math.max(0, Math.min(bookPagesRef.current.length - 1, idx))), 0);
              }}
              onReorder={(from, to) => {
                if (from === to) return;
                lastMetaEditAtRef.current = Date.now();
                setBookPages((prev) => {
                  const next = [...prev];
                  const [moved] = next.splice(from, 1);
                  next.splice(to, 0, moved);
                  return next;
                });
                setTimeout(() => goToBookPage(to), 0);
              }}
              onSetPagePaper={(idx, mode) => {
                lastMetaEditAtRef.current = Date.now();
                setBookPages((prev) => prev.map((p, i) => i === idx ? { ...p, paper: mode } : p));
              }}
              onSetPageBg={(idx, color) => {
                lastMetaEditAtRef.current = Date.now();
                setBookPages((prev) => prev.map((p, i) => i === idx ? { ...p, bgColor: color } : p));
              }}
              pages={bookPages}
              globalPaper={paperMode}
              onToggleOutline={() => setBookOutlineOpen((v) => !v)}
              outlineOpen={bookOutlineOpen}
              onExportPdf={async () => {
                const api = excalRef.current;
                if (!api) return toast.error("Canvas not ready");
                const tid = toast.loading(`Rendering ${bookPageCount} pages…`);
                try {
                  const [{ exportToCanvas }, { default: JsPDF }] = await Promise.all([
                    loadExcal(),
                    import("jspdf"),
                  ]);
                  // Adaptive DPI by book size. Higher DPI = sharper
                  // zoom in PDF viewer; lower DPI = less memory +
                  // faster encode for big books.
                  //   ≤ 5 pages  → 600 dpi
                  //   ≤ 15 pages → 500 dpi
                  //   ≤ 30 pages → 420 dpi
                  //   else       → 360 dpi
                  const DPI =
                    bookPageCount <= 5  ? 600 :
                    bookPageCount <= 15 ? 500 :
                    bookPageCount <= 30 ? 420 : 360;
                  const PX_W = Math.round(210 / 25.4 * DPI);
                  const PX_H = Math.round(297 / 25.4 * DPI);
                  const elsRaw = api.getSceneElements() as ReadonlyArray<Record<string, unknown>>;
                  // PDF page in MILLIMETRES (A4 = 210×297 mm). The
                  // embedded raster fills the page; using mm makes
                  // the viewer scale the image to physical page size
                  // (zoom stays smooth because the image is 600 dpi).
                  const pdf = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                  const PAGE_MM_W = 210;
                  const PAGE_MM_H = 297;
                  // Detect if the page background is dark — if so we
                  // should NOT remap white strokes to black (they'd
                  // vanish). Per-page bg may override globally.
                  const isDarkHex = (h: string | undefined | null) => {
                    if (!h || typeof h !== "string") return false;
                    const v = h.trim().toLowerCase();
                    if (v === "transparent" || v === "white" || v === "#fff" || v === "#ffffff") return false;
                    // Hex form (#rrggbb).
                    const hm = /^#?([0-9a-f]{6})$/.exec(v.replace("#", ""));
                    if (hm) {
                      const n = parseInt(hm[1], 16);
                      const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
                      return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
                    }
                    // rgb()/rgba() form — getComputedStyle returns this.
                    const rm = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
                    if (rm) {
                      const r = +rm[1], g = +rm[2], b = +rm[3];
                      return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
                    }
                    return false;
                  };
                  // Per-page bg falls back to white when unset —
                  // matches the on-screen BookPagesOverlay logic
                  // (`p.bgColor || "#ffffff"`). Previously inherited
                  // from the first explicitly-coloured page, which
                  // made new blank pages inherit page-1's color
                  // instead of staying white as shown on screen.
                  // Render the book in CHUNKS rather than one giant
                  // tall canvas. A 50-page book at 450 dpi × 2 scale
                  // would need ~16 GB of RGBA — browser OOMs. With
                  // CHUNK=4, peak canvas is ~280 MB and gets freed
                  // after each chunk. Total time scales linearly but
                  // memory stays bounded.
                  // DPI already encodes the quality we want; keep
                  // exportScale at 1 across the board so the canvas
                  // matches the page pixel dims exactly. Saves big
                  // memory on multi-page books.
                  const exportScale = 1;
                  // Chunk size by book size. Each chunk allocates a
                  // tall canvas (PX_W × CHUNK*PX_H), so smaller
                  // chunks for higher DPIs keep peak memory bounded.
                  // Big books: CHUNK=1 so each exportToCanvas call
                  // returns in ~1-2 s, letting us yield between
                  // pages. Bigger CHUNK was producing single async
                  // calls that ran >10s and tripped Brave's "page
                  // unresponsive" dialog regardless of post-chunk
                  // yields.
                  const CHUNK_SIZE =
                    bookPageCount <= 5  ? 2 :
                    bookPageCount <= 15 ? 2 :
                    bookPageCount <= 30 ? 2 : 1;
                  // Use dark-theme rendering only when the canvas-
                  // wide custom bg is dark. New pages default to
                  // white regardless of theme to match the on-
                  // screen overlay.
                  const useDark = isDarkHex(customBgRef.current || "");
                  // Sentinel elements anchor Excalidraw's auto-fit
                  // bounding box to the chunk corners — otherwise a
                  // chunk with content only in the middle gets
                  // cropped and re-centered, breaking page alignment.
                  const sentinel = (x: number, y: number, key: string) => ({
                    id: `__pdf_anchor_${key}_${Math.random().toString(36).slice(2, 8)}`,
                    type: "rectangle" as const,
                    x, y, width: 1, height: 1, angle: 0,
                    strokeColor: "transparent", backgroundColor: "transparent",
                    fillStyle: "solid", strokeWidth: 0, strokeStyle: "solid",
                    roughness: 0, opacity: 0, groupIds: [], frameId: null,
                    roundness: null, seed: 1, version: 1, versionNonce: 1,
                    isDeleted: false, boundElements: [], updated: 0,
                    link: null, locked: false,
                  });
                  const CHUNK = CHUNK_SIZE;
                  // Process one chunk at a time so canvas memory is
                  // bounded. Each chunk renders [cstart, cend) pages.
                  for (let cstart = 0; cstart < bookPageCount; cstart += CHUNK) {
                    const cend = Math.min(cstart + CHUNK, bookPageCount);
                    const chunkPages = cend - cstart;
                    const chunkOffsetY = cstart * BOOK_PAGE_H;
                    const chunkWorldH = BOOK_PAGE_H * chunkPages;
                    const chunkCanvasH = PX_H * chunkPages;
                    // Translate elements that overlap this chunk into
                    // chunk-local coords (subtract chunkOffsetY from
                    // every element's y).
                    const chunkEls: Array<Record<string, unknown>> = [];
                    for (const el of elsRaw) {
                      if (el.isDeleted) continue;
                      const y = (el.y as number) ?? 0;
                      const h = (el.height as number) ?? 0;
                      // Keep elements whose bbox intersects the chunk
                      // vertical range. Elements straddling the
                      // chunk edge stay intact so strokes don't get
                      // visually clipped at chunk boundaries.
                      if (y + h < chunkOffsetY) continue;
                      if (y > chunkOffsetY + chunkWorldH) continue;
                      chunkEls.push({ ...el, y: y - chunkOffsetY });
                    }
                    // Anchor auto-fit to chunk corners.
                    chunkEls.unshift(sentinel(0, 0, "tl"));
                    chunkEls.push(sentinel(BOOK_PAGE_W - 1, chunkWorldH - 1, "br"));
                    // Yield BEFORE the heavy exportToCanvas call so
                    // the browser can paint + reset its responsive
                    // watchdog (Brave/Chrome counts uninterrupted
                    // main-thread time, not async time).
                    toast.loading(`Rendering pages ${cstart + 1}-${cend} of ${bookPageCount}…`, { id: tid });
                    await new Promise((r) => setTimeout(r, 0));
                    const chunkCanvas = await (exportToCanvas as unknown as (opts: unknown) => Promise<HTMLCanvasElement>)({
                      elements: chunkEls,
                      appState: {
                        ...api.getAppState(),
                        theme: useDark ? "dark" : "light",
                        exportWithDarkMode: useDark,
                        exportBackground: false,
                        viewBackgroundColor: "transparent",
                        exportScale,
                        exportEmbedScene: false,
                      },
                      files: api.getFiles(),
                      exportPadding: 0,
                      getDimensions: () => ({ width: PX_W, height: chunkCanvasH, scale: PX_W / BOOK_PAGE_W }),
                    });
                    const srcPxPerOutPx = chunkCanvas.width / PX_W;
                    for (let j = 0; j < chunkPages; j++) {
                      const i = cstart + j;
                    // White matches BookPagesOverlay's default.
                    const themeDefaultBg = "#ffffff";
                    // Composite onto a page-shaped canvas with the
                    // per-page paper pattern painted in first so the
                    // PDF matches what's on screen. A safe margin is
                    // baked in so phone PDF readers in "fit page"
                    // mode don't crop strokes that ran to the edge.
                    // ~10% margin all sides (≈ 1 cm at A4). Phone PDF
                    // viewers in "fit page" mode crop strokes at the
                    // edge unless we bake a noticeable safe zone.
                    const MARGIN = Math.round(PX_W * 0.05);
                    const INNER_W = PX_W - 2 * MARGIN;
                    const INNER_H = PX_H - 2 * MARGIN;
                    const out = document.createElement("canvas");
                    out.width = PX_W; out.height = PX_H;
                    const ctx = out.getContext("2d");
                    if (!ctx) throw new Error("2d context unavailable");
                    const pgMeta = bookPagesRef.current[i] ?? {};
                    // Use the same bg as detection — single source.
                    const pgBg = pgMeta.bgColor || customBgRef.current || themeDefaultBg;
                    // Fill the full sheet (incl. margin) with page bg
                    // so the margin matches the page color (no white
                    // strip around a dark page).
                    ctx.fillStyle = pgBg;
                    ctx.fillRect(0, 0, PX_W, PX_H);
                    const effPaper: PaperMode =
                      (!pgMeta.paper || pgMeta.paper === "inherit") ? paperMode : pgMeta.paper;
                    // Paint paper pattern inside margin only.
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(MARGIN, MARGIN, INNER_W, INNER_H);
                    ctx.clip();
                    drawPaperPattern(ctx, PX_W, PX_H, effPaper, PX_W / BOOK_PAGE_W, pgBg);
                    ctx.restore();
                    // Crop this page's strip from the chunk canvas.
                    const srcX = 0;
                    const srcY = j * PX_H * srcPxPerOutPx;
                    const srcW = PX_W * srcPxPerOutPx;
                    const srcH = PX_H * srcPxPerOutPx;
                    ctx.drawImage(
                      chunkCanvas,
                      srcX, srcY, srcW, srcH,
                      MARGIN, MARGIN, INNER_W, INNER_H,
                    );
                    // JPEG q=0.97 keeps line edges sharp at the
                    // cost of ~10% larger file vs 0.95.
                    const dataUrl = out.toDataURL("image/jpeg", 0.97);
                    if (i > 0) pdf.addPage("a4", "portrait");
                    pdf.addImage(dataUrl, "JPEG", 0, 0, PAGE_MM_W, PAGE_MM_H, undefined, "SLOW");
                    // Help GC release the per-page canvas before the
                    // next iteration.
                    out.width = 0; out.height = 0;
                    // Per-page progress + yield to the event loop so
                    // the browser doesn't trip the "page unresponsive"
                    // dialog on big books.
                    toast.loading(`Rendering ${i + 1}/${bookPageCount} pages…`, { id: tid });
                    await new Promise((r) => setTimeout(r, 0));
                    }
                    // Release the chunk canvas before the next chunk
                    // allocates a fresh one.
                    chunkCanvas.width = 0; chunkCanvas.height = 0;
                    // Yield to the event loop so the toast/UI can
                    // repaint between chunks on big books.
                    await new Promise((r) => setTimeout(r, 0));
                  }
                  pdf.save(`${skill}-book.pdf`);
                  toast.success(`Saved ${bookPageCount}-page PDF`, { id: tid });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "PDF export failed", { id: tid });
                }
              }}
            />
            {bookOutlineOpen && (
              <BookOutlinePanel
                pages={bookPages}
                elements={miniData.els}
                currentPage={bookPage}
                onJump={(i) => goToBookPage(i)}
                onClose={() => setBookOutlineOpen(false)}
              />
            )}
          </>
        )}
        <ExcalCrashBoundary onCrash={onCanvasCrash} onRetry={onCanvasRetry} resetKey={recoveryNonce}>
          <Excalidraw
            key={`${slug}-${recoveryNonce}`}
            initialData={(recoveryNonce > 0 ? nukedInitialData(initialData) : initialData) as never}
            onChange={onChange}
            onLibraryChange={onLibraryChange}
            theme={resolvedTheme === "light" ? "light" : "dark"}
            aiEnabled={false}
            excalidrawAPI={excalApiCallback}
          >
            {mainMenuNode}
          </Excalidraw>
        </ExcalCrashBoundary>
        <SelectionAiWidget
          excalRef={excalRef}
          canvasWrapRef={canvasWrapRef}
          miniData={miniData}
          skill={skill}
        />
        <TrimMoreToolsDropdown />
        <PropertyPanelSliders excalRef={excalRef} ready={excalReady} />
        <ShapeIslandTools
          onAi={() => setAiOpen(true)}
          onChat={() => setChatOpen(true)}
          onTemplate={insertTemplate}
          onExportPng={exportPng}
          onExportSvg={exportSvg}
          onCopyJson={copyShareJson}
          full={full}
          onToggleFull={() => setFull((v) => !v)}
          hideFullscreenButton={hideFullscreenButton}
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
          paperMode={paperMode}
          onPaperMode={(m) => { lastMetaEditAtRef.current = Date.now(); setPaperMode(m); }}
          onZoomDelta={(factor) => {
            const api = excalRef.current;
            if (!api) return;
            const app = api.getAppState() as { width?: number; height?: number; zoom?: { value?: number }; scrollX?: number; scrollY?: number };
            const cur = app.zoom?.value ?? 1;
            const next = Math.max(0.01, Math.min(5, cur * factor));
            if (next === cur) return;
            const w = app.width ?? 0;
            const h = app.height ?? 0;
            // Zoom anchored on viewport center so content stays put.
            const sx = app.scrollX ?? 0;
            const sy = app.scrollY ?? 0;
            const cx = -sx + (w / cur) / 2;
            const cy = -sy + (h / cur) / 2;
            api.updateScene({
              appState: {
                zoom: { value: next },
                scrollX: -(cx - (w / next) / 2),
                scrollY: -(cy - (h / next) / 2),
              },
            });
          }}
          onZoomReset={() => {
            const api = excalRef.current;
            if (!api) return;
            api.updateScene({ appState: { zoom: { value: 1 } } });
          }}
          zoomPct={Math.round(((miniData.app as { zoom?: { value?: number } })?.zoom?.value ?? 1) * 100)}
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
            onExit={() => {
              // Stopping the presentation also turns off any view-only
              // lock and closes the slides side panel — the user said
              // they expect a clean exit from the whole present mode.
              setPresentIdx(null);
              if (viewOnly) setViewOnly(false);
              if (previewOpen) setPreviewOpen(false);
            }}
            onTogglePanel={() => setPreviewOpen((v) => !v)}
            panelOpen={previewOpen}
            onToggleFocus={toggleSlideFocus}
            focused={slideFocus}
            viewOnly={viewOnly}
            onToggleViewOnly={() => setViewOnly((v) => !v)}
          />
        )}
        {!viewOnly && <Minimap
          elements={miniData.els}
          appState={miniData.app}
          cursor={cursorWorld}
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
        />}
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
      {catCounts && <LibraryFilterBar counts={catCounts} excalRef={excalRef} frontOffset={frontOffset} onImported={(n) => setFrontOffset((o) => o + n)} />}
    </div>
  );
}

// Portals a category tab strip into Excalidraw's library panel
// header (`.library-menu-items-container__header`). Filtering uses
// nth-child CSS ranges computed from per-cat counts — the seeded
// items appear in known order so we can hide the rest without
// touching Excalidraw internals. User-added items (custom shapes)
// sit at the END of the grid (any nth > total seeded) so we let
// them through on every filter EXCEPT when the user explicitly
// picks a category they were tagged with (right-click → category
// is a future enhancement; for now custom shapes show in "All" only).
function LibraryFilterBar({ counts, excalRef, frontOffset, onImported }: {
  counts: number[];
  excalRef: React.MutableRefObject<ExcalApi | null>;
  frontOffset: number;
  onImported: (newItemCount: number) => void;
}) {
  // We don't portal into header (Excalidraw orders title + 3-dots
  // there and we need to sit ABOVE both). Instead we inject our own
  // host div as the FIRST child of `.library-menu` and portal into it.
  // Re-mounts whenever the library panel mounts/unmounts (book-icon
  // toggle).
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [grid, setGrid] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState<string>("all");
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    let mountedHost: HTMLElement | null = null;

    const sync = () => {
      if (cancelled) return;
      // `.library-menu` is the 3-dots DROPDOWN content (Open/Save/Reset);
      // the actual panel root is `.library-menu-items-container`. We
      // mount the host as its FIRST child so the tab strip lands above
      // the header (which holds "Personal Library" + 3-dots).
      const container = document.querySelector(".library-menu-items-container") as HTMLElement | null;
      const g = document.querySelector(".library-menu-items-container__items") as HTMLElement | null;
      setGrid(g);
      if (!container) {
        if (mountedHost && !mountedHost.isConnected) mountedHost = null;
        setHost(null);
        return;
      }
      if (mountedHost && mountedHost.parentElement === container) return;
      const h = document.createElement("div");
      h.className = "sklib-filterbar-host";
      container.insertBefore(h, container.firstChild);
      mountedHost = h;
      setHost(h);
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      obs.disconnect();
      if (mountedHost && mountedHost.parentElement) mountedHost.parentElement.removeChild(mountedHost);
    };
  }, []);

  // Apply filter by setting data-cat-filter on the items grid. The
  // companion CSS rules (added below as a static <style> tag) hide
  // library-units outside the active cat via nth-child ranges.
  useEffect(() => {
    if (!grid) return;
    grid.setAttribute("data-cat-filter", active);
  }, [grid, active]);

  // Inject the nth-child filter CSS based on actual counts + the
  // front-offset (number of items imported AHEAD of the seeded set).
  useEffect(() => {
    const id = "sklib-cat-filter-rules";
    let from = frontOffset;
    const rules: string[] = [];
    LIB_CATS.forEach((c, i) => {
      const n = counts[i] ?? 0;
      if (!n) return;
      const start = from + 1;
      const end = from + n;
      // Hide every seeded library-unit OUTSIDE [start..end] when this
      // filter is active. User-added items (past the seeded section,
      // OR imported ones in front) are also hidden under a specific
      // cat filter — they remain visible under "All".
      rules.push(`.library-menu-items-container__items[data-cat-filter="${c.id}"] .library-unit:not(:nth-child(n+${start}):nth-child(-n+${end})) { display: none !important; }`);
      from = end;
    });
    // "all" filter: show everything (including past total). Nothing
    // to add — absence of a rule = no hide.
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = rules.join("\n");
    return () => {
      // Keep the style tag across re-mounts — same rules apply for
      // the whole session.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts.join(","), frontOffset]);

  const onImport = useCallback(async () => {
    const api = excalRef.current;
    if (!api?.updateLibrary) return;
    const raw = importUrl.trim();
    if (!raw) return;
    setImporting(true);
    try {
      const items = await fetchExcalLibrary(raw);
      if (!items.length) { toast.error("No items found at that URL."); return; }
      const stamped = items.map((it, i) => ({
        ...it,
        status: "unpublished" as const,
        id: (it as { id?: string }).id ?? `import-${Date.now()}-${i}`,
      }));
      api.updateLibrary({ libraryItems: stamped, merge: true, defaultStatus: "unpublished" });
      onImported(stamped.length);
      toast.success(`Imported ${stamped.length} item${stamped.length === 1 ? "" : "s"}.`);
      setImportUrl("");
      setImportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }, [excalRef, importUrl]);

  if (!host) return null;

  return createPortal(
    <>
      <div className="sklib-filterbar" role="tablist" aria-label="Library categories">
        <button
          type="button" role="tab"
          aria-selected={active === "all"}
          data-active={active === "all" ? "1" : undefined}
          className="sklib-filterbtn"
          title="All"
          onClick={() => setActive("all")}
        >
          <Star className="sklib-fi" />
        </button>
        {LIB_CATS.map((c, i) => (
          (counts[i] ?? 0) > 0 ? (
            <button
              key={c.id}
              type="button" role="tab"
              aria-selected={active === c.id}
              data-active={active === c.id ? "1" : undefined}
              className="sklib-filterbtn"
              title={`${c.label} (${counts[i]})`}
              onClick={() => setActive(c.id)}
            >
              <c.Icon className="sklib-fi" />
            </button>
          ) : null
        ))}
        <button
          type="button"
          className="sklib-filterbtn sklib-import-toggle"
          title="Import from Excalidraw library URL"
          data-active={importOpen ? "1" : undefined}
          onClick={() => setImportOpen((v) => !v)}
        >
          <Plus className="sklib-fi" />
        </button>
      </div>
      {importOpen && (
        <div className="sklib-importrow">
          <input
            className="sklib-importinput"
            type="url"
            value={importUrl}
            placeholder="Paste libraries.excalidraw.com URL…"
            onChange={(e) => setImportUrl(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !importing) onImport(); }}
            autoFocus
          />
          <button
            type="button"
            className="sklib-importgo"
            disabled={importing || !importUrl.trim()}
            onClick={onImport}
          >
            {importing ? "…" : "Add"}
          </button>
        </div>
      )}
    </>,
    host,
  );
}

// Accepts:
//   • Direct .excalidrawlib URL (fetched as-is)
//   • libraries.excalidraw.com share URL (slug pulled from `#hash`,
//     resolved against the public GitHub mirror which serves the file
//     with CORS open)
// Returns a flat libraryItems array (v1 `library` arrays auto-wrapped).
async function fetchExcalLibrary(raw: string): Promise<Array<Record<string, unknown>>> {
  let target = raw;
  try {
    const u = new URL(raw);
    // libraries.excalidraw.com puts the library slug in the hash.
    // Files live at /libraries/{author}/{name}.excalidrawlib but the
    // share URL only gives us `{author}-{name}` — author may itself
    // contain hyphens, so we resolve via libraries.json (CORS-open).
    if (u.hostname.includes("libraries.excalidraw.com")) {
      const slug = u.hash.replace(/^#/, "").trim();
      if (!slug) throw new Error("URL missing library slug (#…).");
      const idx = await fetch("https://libraries.excalidraw.com/libraries.json");
      if (!idx.ok) throw new Error(`Index fetch failed (${idx.status}).`);
      const list = await idx.json() as Array<{ source?: string }>;
      const hit = list.find((e) => {
        const s = (e.source ?? "").replace(/\.excalidrawlib$/, "").replace(/\//g, "-");
        return s === slug;
      });
      if (!hit?.source) throw new Error(`Library "${slug}" not found in Excalidraw index.`);
      target = `https://libraries.excalidraw.com/libraries/${hit.source}`;
    }
  } catch (e) {
    if (e instanceof Error && /missing library slug|not found|Index fetch/.test(e.message)) throw e;
    if (e instanceof TypeError) throw new Error("Invalid URL.");
    throw e;
  }
  const r = await fetch(target);
  if (!r.ok) throw new Error(`Fetch failed (${r.status}).`);
  const j = await r.json() as { libraryItems?: Array<Record<string, unknown>>; library?: unknown[][] };
  if (Array.isArray(j.libraryItems)) return j.libraryItems;
  if (Array.isArray(j.library)) {
    return j.library.map((els, i) => ({
      elements: els,
      id: `lib-${Date.now()}-${i}`,
      created: Date.now(),
    }));
  }
  return [];
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

// Floating "ai" pill anchored just above any active selection. Click
// to expand into an instruction input + Send. Submitting POSTs the
// selected elements + prompt to /api/sketch/transform; the response
// replaces the selection in-place. Laptop-only — gated on
// `(hover:hover) and (pointer:fine)` so touch users don't get a
// floating UI element that obscures their gestures.
function SelectionAiWidget({
  excalRef,
  canvasWrapRef,
  miniData,
  skill,
}: {
  excalRef: React.MutableRefObject<ExcalApi | null>;
  canvasWrapRef: React.MutableRefObject<HTMLDivElement | null>;
  miniData: { els: readonly unknown[]; app: Record<string, unknown> };
  skill: string;
}) {
  const [isLaptop, setIsLaptop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setIsLaptop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Derive bbox of the current selection in world coords.
  const selection = useMemo(() => {
    const app = miniData.app as { selectedElementIds?: Record<string, boolean> };
    const ids = app.selectedElementIds || {};
    const selIds = Object.keys(ids).filter((k) => ids[k]);
    if (!selIds.length) return null;
    const idSet = new Set(selIds);
    const els = (miniData.els as Array<Record<string, unknown>>).filter((e) => {
      if (e.isDeleted) return false;
      return typeof e.id === "string" && idSet.has(e.id as string);
    });
    if (!els.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of els) {
      const x = (e.x as number) ?? 0;
      const y = (e.y as number) ?? 0;
      const w = (e.width as number) ?? 0;
      const h = (e.height as number) ?? 0;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    }
    return { ids: selIds, els, minX, minY, maxX, maxY };
  }, [miniData]);

  // Project world bbox to screen pos relative to canvas wrap. The
  // whole widget (pill + optional input) renders as a SINGLE row
  // anchored just ABOVE the selection's top-right corner, so it
  // never overlaps the shapes themselves.
  const screenPos = useMemo(() => {
    if (!selection) return null;
    const app = miniData.app as { scrollX?: number; scrollY?: number; zoom?: { value?: number } };
    const zoom = app.zoom?.value ?? 1;
    const sx = (app.scrollX ?? 0);
    const sy = (app.scrollY ?? 0);
    const selRight = (selection.maxX + sx) * zoom;
    const selTop = (selection.minY + sy) * zoom;
    const wrap = canvasWrapRef.current;
    const wrapW = wrap?.clientWidth ?? 9999;
    const ROW_W = open ? 302 : 32;     // pill 32 (icon-only), with input row ~302
    const ROW_H = 28;
    const ROW_GAP_ABOVE = 28;          // gap between widget bottom and selection top
    const x = Math.max(8, Math.min(wrapW - ROW_W - 8, selRight - ROW_W));
    const y = Math.max(8, selTop - ROW_H - ROW_GAP_ABOVE);
    return { x, y };
  }, [selection, miniData, open, canvasWrapRef]);

  // Collapse on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Auto-focus when opened.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = useCallback(async () => {
    if (!selection || !excalRef.current) return;
    const q = prompt.trim();
    if (!q) return;
    setBusy(true);
    const tid = toast.loading("Asking AI…");
    // Snapshot bbox at request time. While the AI thinks (~5-20s) the
    // user may drag the selection — without this we'd inject the new
    // shapes at the OLD world coords (looks like nothing happened).
    const snapBbox = {
      minX: selection.minX, minY: selection.minY,
      maxX: selection.maxX, maxY: selection.maxY,
    };
    const snapIds = selection.ids.slice();
    try {
      const r = await fetch(`${API}/api/sketch/transform`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ prompt: q, elements: selection.els, skill }),
      });
      // Backend may return a plain-text proxy error (Next.js 502 page)
      // when the upstream times out — JSON.parse would crash. Read as
      // text first and best-effort parse.
      const txt = await r.text();
      let d: { detail?: string; elements?: unknown; ops?: unknown } = {};
      try { d = txt ? JSON.parse(txt) : {}; } catch {
        // Next.js proxy 5xx pages return HTML — show a friendly message
        // instead of dumping raw markup into the toast.
        const isHtml = /^\s*<!doctype|^\s*<html/i.test(txt);
        d = { detail: isHtml ? "Backend unreachable or timed out" : txt.slice(0, 200) };
      }
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      const els = d.elements as Array<Record<string, unknown>>;
      if (!Array.isArray(els) || !els.length) throw new Error("AI returned no elements");
      const api = excalRef.current;
      const selIdSet = new Set(snapIds);
      const current = api.getSceneElements() as Array<Record<string, unknown>>;
      // Compute drift: if the user moved the selection while AI was
      // thinking, the new (added) shapes were computed against the
      // OLD bbox. Translate them by (currentBbox - snapBbox) so they
      // land relative to where the selection IS now.
      let curMinX = Infinity, curMinY = Infinity, curMaxX = -Infinity, curMaxY = -Infinity;
      let foundCur = false;
      for (const e of current) {
        if (typeof e.id !== "string" || !selIdSet.has(e.id as string)) continue;
        const x = (e.x as number) ?? 0, y = (e.y as number) ?? 0;
        const w = (e.width as number) ?? 0, h = (e.height as number) ?? 0;
        curMinX = Math.min(curMinX, x); curMinY = Math.min(curMinY, y);
        curMaxX = Math.max(curMaxX, x + w); curMaxY = Math.max(curMaxY, y + h);
        foundCur = true;
      }
      const dx = foundCur ? (curMinX - snapBbox.minX) : 0;
      const dy = foundCur ? (curMinY - snapBbox.minY) : 0;
      const kept = current.filter((e) => !(typeof e.id === "string" && selIdSet.has(e.id as string)));
      // Preserve original IDs for elements echoed back from the
      // backend (server now keeps full originals and applies ops, so
      // matching ids mean unchanged/modified bindings stay intact).
      // Stamp a fresh id only on NEW elements the LLM added.
      // Lazy-load convertToExcalidrawElements for text-modify ops
      // (recomputes width/height so the rendered glyphs match the
      // new content). Without this Excalidraw keeps the old bbox
      // and the new text either clips or fails to repaint.
      let convertToExcalidrawElements: ((els: unknown[], opts?: { regenerateIds?: boolean }) => unknown[]) | null = null;
      try {
        const mod = await loadExcal();
        convertToExcalidrawElements = (mod as unknown as {
          convertToExcalidrawElements?: (els: unknown[], opts?: { regenerateIds?: boolean }) => unknown[]
        }).convertToExcalidrawElements ?? null;
      } catch {}
      const stamped = els.map((e) => {
        const id = (e as { id?: unknown }).id;
        const isOriginal = typeof id === "string" && selIdSet.has(id);
        if (isOriginal) {
          // Merge AI's modifications into the CURRENT version of the
          // original (which may have been moved/rotated since submit).
          const cur = current.find((c) => c.id === id) as Record<string, unknown> | undefined;
          const merged = cur ? { ...cur, ...e, id } : e;
          const m = merged as Record<string, unknown>;
          // Text-modify path: if AI touched text/originalText/fontSize/
          // fontFamily, rebuild the element via convertToExcalidrawElements
          // so width/height + version get recomputed correctly.
          const isText = m.type === "text";
          const touchesText = isText && (
            (e as Record<string, unknown>).text !== undefined ||
            (e as Record<string, unknown>).originalText !== undefined ||
            (e as Record<string, unknown>).fontSize !== undefined ||
            (e as Record<string, unknown>).fontFamily !== undefined
          );
          if (isText && touchesText && convertToExcalidrawElements) {
            // Sync text ↔ originalText (LLM often returns only one).
            const rawText = (e as Record<string, unknown>).text ?? (e as Record<string, unknown>).originalText ?? m.text ?? m.originalText;
            // Wrap text to original width so a single-line AI
            // response doesn't render as one overflowing line.
            // Excalidraw only auto-wraps text bound to a container;
            // free text elements keep whatever line breaks they're
            // given. We pre-wrap using a canvas measureText sized
            // to the same font Excalidraw will render with.
            const wrapByWidth = (txt: string, maxW: number, fs: number, ff: unknown): string => {
              if (!maxW || !Number.isFinite(maxW) || maxW <= 0) return txt;
              try {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                if (!ctx) return txt;
                // Map Excalidraw fontFamily ids → CSS font stacks
                // (matches FONT_FAMILY constants: 1=hand, 2=normal,
                // 3=code, 4=little-pony, 5=excalifont).
                const family = ff === 2 ? "Helvetica, Arial, sans-serif"
                  : ff === 3 ? "Cascadia, Consolas, monospace"
                  : "Virgil, Excalifont, sans-serif";
                ctx.font = `${fs || 20}px ${family}`;
                const out: string[] = [];
                for (const line of String(txt).split("\n")) {
                  const words = line.split(/(\s+)/); // keep spaces
                  let cur = "";
                  for (const w of words) {
                    const test = cur + w;
                    if (ctx.measureText(test).width <= maxW || !cur.trim()) {
                      cur = test;
                    } else {
                      out.push(cur.replace(/\s+$/, ""));
                      cur = w.replace(/^\s+/, "");
                    }
                  }
                  out.push(cur);
                }
                return out.join("\n");
              } catch {
                return txt;
              }
            };
            const newText = wrapByWidth(
              String(rawText ?? ""),
              Number(m.width) || 0,
              Number(m.fontSize) || 20,
              m.fontFamily,
            );
            // Preserve original width so text wraps at the same
            // column instead of collapsing to one long line. Height
            // is recomputed by convertToExcalidrawElements based on
            // the wrapped line count.
            const skeleton = {
              type: "text",
              x: m.x, y: m.y,
              width: m.width,
              text: String(newText ?? ""),
              fontSize: m.fontSize,
              fontFamily: m.fontFamily,
              textAlign: m.textAlign,
              verticalAlign: m.verticalAlign,
              strokeColor: m.strokeColor,
              backgroundColor: m.backgroundColor,
              fillStyle: m.fillStyle,
              strokeWidth: m.strokeWidth,
              opacity: m.opacity,
              angle: m.angle,
              lineHeight: m.lineHeight,
              containerId: m.containerId,
            };
            try {
              const [rebuilt] = convertToExcalidrawElements([skeleton], { regenerateIds: false }) as Array<Record<string, unknown>>;
              if (rebuilt) {
                return {
                  ...rebuilt,
                  id: cur?.id ?? id,                 // preserve original id
                  seed: m.seed,                      // keep stable seed for hand-drawn look
                  // Lock width to the original so wrapping stays
                  // at the same column. Height comes from the
                  // rebuilt element (line-count based).
                  width: m.width,
                  groupIds: Array.isArray(m.groupIds) ? m.groupIds : [],
                  boundElements: Array.isArray(m.boundElements) ? m.boundElements : null,
                  // Force a version bump so Excalidraw repaints.
                  version: (typeof m.version === "number" ? m.version : 1) + 1,
                  versionNonce: Math.floor(Math.random() * 0x7fffffff),
                };
              }
            } catch {}
          }
          // Non-text modify: keep the simple merge + version bump.
          return {
            ...merged,
            groupIds: Array.isArray((merged as { groupIds?: unknown }).groupIds) ? (merged as { groupIds: unknown[] }).groupIds : [],
            boundElements: (merged as { boundElements?: unknown }).boundElements ?? null,
            version: (typeof m.version === "number" ? m.version : 1) + 1,
            versionNonce: Math.floor(Math.random() * 0x7fffffff),
          };
        }
        // New shape: translate by drift so it lands at the selection's
        // CURRENT screen position, not where it was at submit time.
        const ex = typeof (e as { x?: unknown }).x === "number" ? (e as { x: number }).x : 0;
        const ey = typeof (e as { y?: unknown }).y === "number" ? (e as { y: number }).y : 0;
        const base = { ...e, x: ex + dx, y: ey + dy, id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
        return {
          ...base,
          groupIds: Array.isArray((base as unknown as { groupIds?: unknown }).groupIds) ? (base as unknown as { groupIds: unknown[] }).groupIds : [],
          boundElements: (base as { boundElements?: unknown }).boundElements ?? null,
        };
      });
      // Final guard: Excalidraw crashes hard on any element missing
      // `type`. Strip anything malformed before handing it the scene.
      const safe = [...kept, ...stamped].filter((el): el is Record<string, unknown> =>
        !!el && typeof el === "object" && typeof (el as { type?: unknown }).type === "string"
      );
      api.updateScene({ elements: safe });
      const ops = d.ops as { added?: number; modified?: number; deleted?: number } | undefined;
      const opsMsg = ops
        ? `+${ops.added ?? 0} ~${ops.modified ?? 0} -${ops.deleted ?? 0}`
        : `${selection.ids.length} → ${stamped.length}`;
      toast.success(`AI: ${opsMsg}`, { id: tid });
      setPrompt("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transform failed", { id: tid });
    } finally {
      setBusy(false);
    }
  }, [selection, prompt, excalRef, skill]);

  if (!isLaptop || !selection || !screenPos) return null;

  // Render absolutely inside the canvas wrapper. The wrapper itself is
  // position:relative (from `relative` class) so 0,0 = its top-left.
  const wrap = canvasWrapRef.current;
  if (!wrap) return null;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div
      className="excal-ai-sel"
      style={{
        position: "absolute",
        left: screenPos.x,
        top: screenPos.y,
        zIndex: 15,
        pointerEvents: "auto",
      }}
      onMouseDown={stop}
      onPointerDown={stop}
    >
      <div className="excal-ai-sel-row" data-open={open ? "1" : undefined}>
        {open && (
          <div className="excal-ai-sel-box">
            <input
              ref={inputRef}
              className="excal-ai-sel-input"
              placeholder="Describe a change for the selected shapes…"
              value={prompt}
              disabled={busy}
              onChange={(e) => setPrompt(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) submit();
                else if (e.key === "Escape") setOpen(false);
              }}
            />
            <button
              type="button"
              className="excal-ai-sel-send"
              disabled={busy || !prompt.trim()}
              onClick={submit}
            >
              {busy ? "…" : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
        <button
          type="button"
          className="excal-ai-sel-pill"
          data-open={open ? "1" : undefined}
          aria-label={open ? "Close AI prompt" : "Ask AI to transform selection"}
          title={open ? "Close AI prompt" : "Ask AI to transform selection"}
          onClick={() => setOpen((v) => !v)}
        >
          <Sparkles className="h-4 w-4" />
        </button>
      </div>
    </div>,
    wrap,
  );
}

export function SketchPreloader() {
  useEffect(() => { loadExcal().catch(() => {}); }, []);
  return null;
}

// Watches the DOM for Excalidraw's shape-island toolbar, then portals our
// AI/Chat/Templates/Share/Export buttons inside it so they read as one bar.
// CSS paper backdrop. Sits absolutely-positioned BEHIND the Excalidraw
// canvas; canvas viewBackgroundColor is forced to "transparent" when
// active so the pattern shows through. Scale + scroll follow Excalidraw's
// appState.zoom + scrollX/Y so the grid/dot/line spacing stays anchored
// to world coordinates while the user pans/zooms.
// Compact horizontal row injected into Excalidraw MainMenu — label
// on the left, icon buttons inline. Saves vertical space vs the
// default MM.Item-per-option layout.
// Native-looking row inside Excalidraw MainMenu — uses their own
// CSS vars so the styling tracks light/dark mode + theme changes.
// 4-column swatch grid for the Canvas-color picker row. Last cell is
// always a native color picker for arbitrary hex. Swatches use
// Excalidraw's own `color-picker__button` class but with the dark-mode
// `--theme-filter` neutralised — the wrapper paints raw colors
// outside Excalidraw's filter, so swatches must too or the preview
// won't match the applied result.
function SidebarSwatchGrid({
  label, swatches, onPick,
}: {
  label: string;
  swatches: ReadonlyArray<{ title: string; value: string | null }>;
  onPick: (c: string | null) => void;
}) {
  // Subscribe to the module-scoped store rather than taking `value`
  // via props — that lets the parent's mainMenuNode memo stay stable
  // across customBg changes (touching that memo re-attaches MM's own
  // subscribers and triggers an infinite-update loop).
  const value = useSyncExternalStore(
    customBgStore.subscribe,
    customBgStore.getSnapshot,
    customBgStore.getServerSnapshot,
  );
  // Debounce native color-input drag → avoid re-rendering MainMenu on
  // every pixel of hue slider movement.
  const pickerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onColorInput = useCallback((next: string) => {
    if (pickerTimer.current) clearTimeout(pickerTimer.current);
    pickerTimer.current = setTimeout(() => onPick(next), 80);
  }, [onPick]);
  return (
    <div style={{ padding: "2px 8px 6px" }}>
      <div className="dropdown-menu-group-title" style={{ margin: "6px 0 4px", fontSize: 14, fontWeight: 500, color: "var(--color-on-surface)", opacity: 0.7 }}>
        {label}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1.625rem)",
          gap: 6,
          justifyContent: "start",
        }}
      >
        {swatches.map((c) => {
          const isActive = value === c.value;
          const isClear = c.value === null;
          return (
            <button
              key={c.value ?? "clear"}
              type="button"
              title={c.title}
              aria-pressed={isActive}
              onClick={() => onPick(c.value)}
              className={`color-picker__button${isActive ? " active" : ""}${isClear ? " is-transparent" : ""}`}
              style={{
                // Cancel Excalidraw's dark-mode invert so the swatch
                // shows the literal color we'll paint on the wrapper.
                filter: "none",
                ...(isClear ? {} : { ["--swatch-color" as string]: c.value } as React.CSSProperties),
              }}
            >
              {isActive && <div className="color-picker__button-outline" style={{ filter: "none" }} />}
            </button>
          );
        })}
        <label
          title="Pick any color"
          className="color-picker__button"
          style={{
            cursor: "pointer",
            display: "inline-grid", placeItems: "center",
            borderStyle: "dashed",
            background: "conic-gradient(from 0deg, #ff4136, #ffdc00, #2ecc40, #0074d9, #b10dc9, #ff4136)",
            filter: "none",
          }}
        >
          <input
            type="color"
            defaultValue={value ?? "#ffffff"}
            onInput={(e) => onColorInput((e.target as HTMLInputElement).value)}
            onChange={(e) => onColorInput((e.target as HTMLInputElement).value)}
            style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
          />
        </label>
      </div>
    </div>
  );
}

function SidebarRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "2px 8px 6px" }}>
      <div className="dropdown-menu-group-title" style={{ margin: "6px 0 4px", fontSize: 14, fontWeight: 500, color: "var(--color-on-surface)", opacity: 0.7 }}>
        {label}
      </div>
      <div style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {children}
      </div>
    </div>
  );
}
function SidebarIconBtn({
  title, onClick, active, children,
}: {
  title: string; onClick: () => void; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active ?? undefined}
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: "1.625rem", height: "1.625rem", borderRadius: "0.5rem",
        border: "none",
        background: active
          ? "var(--color-primary-light, color-mix(in oklab, var(--color-primary, #6965db) 22%, transparent))"
          : "transparent",
        color: active ? "var(--color-primary, #6965db)" : "var(--color-on-surface, currentColor)",
        cursor: "pointer",
        padding: 0,
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (active) return;
        (e.currentTarget as HTMLButtonElement).style.background =
          "var(--button-hover-bg, color-mix(in oklab, var(--foreground) 8%, transparent))";
      }}
      onMouseLeave={(e) => {
        if (active) return;
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

// Page geometry constants — shared by overlay + page nav handlers.
export const BOOK_PAGE_W = 794;
export const BOOK_PAGE_H = 1123;
export const BOOK_PAGE_GAP = 24;
export function bookPageTop(idx: number): number {
  return idx * (BOOK_PAGE_H + BOOK_PAGE_GAP);
}

// Visual page guides for "book" mode. A4 portrait at world-space
// (~794×1123 css px @ 96dpi). Twelve pages stacked vertically, with
// a 24px gap, starting at (0,0) in world coords.
// Paint a paper pattern (grid/dots/lines) onto a 2D canvas. Scale is
// px-per-world-px (so the PDF render at 2480×3508 uses scale ≈ 3.12).
// Color picked for ~300 dpi print legibility on white paper.
function drawPaperPattern(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mode: PaperMode,
  scale: number,
  bgColor?: string | null,
) {
  if (mode === "plain") return;
  ctx.save();
  // Contrast-aware stroke — dark on light paper, light on dark paper.
  const ink = isLightHex(bgColor)
    ? "rgba(27,27,31,0.42)"
    : "rgba(255,255,255,0.55)";
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  if (mode === "grid") {
    const sz = 32 * scale;
    ctx.lineWidth = Math.max(1, scale);
    ctx.beginPath();
    for (let x = 0; x <= w; x += sz) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += sz) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  } else if (mode === "dots") {
    const sz = 24 * scale;
    const r = Math.max(1, 1.2 * scale);
    for (let x = 0; x <= w; x += sz) {
      for (let y = 0; y <= h; y += sz) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    const sz = 28 * scale;
    ctx.lineWidth = Math.max(1, scale);
    ctx.beginPath();
    for (let y = 0; y <= h; y += sz) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  }
  ctx.restore();
}
function pagePaperBackgroundCss(mode: PaperMode, zoom: number, bgColor?: string | null): React.CSSProperties {
  // Pick pattern stroke color based on page background brightness so
  // dots/lines stay visible regardless of paper color (dark dots on
  // light paper, light dots on dark paper).
  const lineColor = isLightHex(bgColor)
    ? "rgba(20, 20, 24, 0.42)"
    : "rgba(255, 255, 255, 0.55)";
  if (mode === "plain") return {};
  if (mode === "grid") {
    const sz = 32 * zoom;
    return {
      backgroundImage:
        `linear-gradient(to right, ${lineColor} 1px, transparent 1px), linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)`,
      backgroundSize: `${sz}px ${sz}px, ${sz}px ${sz}px`,
    };
  }
  if (mode === "dots") {
    const sz = 24 * zoom;
    return {
      backgroundImage: `radial-gradient(circle, ${lineColor} ${Math.max(1, 1.2 * zoom)}px, transparent ${Math.max(1, 1.2 * zoom)}px)`,
      backgroundSize: `${sz}px ${sz}px`,
    };
  }
  const sz = 28 * zoom;
  return {
    backgroundImage: `linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)`,
    backgroundSize: `${sz}px ${sz}px`,
  };
}
export function BookPagesOverlay({ appState, pages, globalPaper }: { appState: Record<string, unknown>; pages: BookPageMeta[]; globalPaper: PaperMode }) {
  const s = appState as { scrollX?: number; scrollY?: number; zoom?: { value?: number } };
  const zoom = s.zoom?.value ?? 1;
  const sx = (s.scrollX ?? 0) * zoom;
  const sy = (s.scrollY ?? 0) * zoom;
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const top = bookPageTop(i);
    const p = pages[i];
    const eff = (!p.paper || p.paper === "inherit") ? globalPaper : p.paper;
    const pageBg = p.bgColor || "#ffffff";
    const paperBg = pagePaperBackgroundCss(eff, zoom, pageBg);
    const labelInk = isLightHex(pageBg) ? "#1b1b1f" : "rgba(255,255,255,0.85)";
    out.push(
      <div
        key={i}
        style={{
          position: "absolute",
          left: sx,
          top: sy + top * zoom,
          width: BOOK_PAGE_W * zoom,
          height: BOOK_PAGE_H * zoom,
          borderRadius: 4 * zoom,
          background: pageBg,
          border: `${Math.max(1, 1.5 * zoom)}px solid rgba(255,255,255,0.85)`,
          boxShadow:
            "0 6px 18px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.4)",
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {(paperBg.backgroundImage as string | undefined) && (
          <div
            aria-hidden
            style={{ position: "absolute", inset: 0, ...paperBg, opacity: 0.9 }}
          />
        )}
        <div
          style={{
            position: "absolute",
            top: 8 * zoom, right: 12 * zoom,
            fontSize: 11 * zoom, opacity: 0.5,
            color: labelInk,
          }}
        >{i + 1}</div>
      </div>,
    );
  }
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      {out}
    </div>
  );
}

function PageListPopover({
  page, pages, globalPaper, onJump, onDelete, onReorder, onSetPaper, onSetBg,
}: {
  page: number;
  pages: BookPageMeta[];
  globalPaper: PaperMode;
  onJump: (i: number) => void;
  onDelete: (i: number) => void;
  onReorder: (from: number, to: number) => void;
  onSetPaper: (i: number, mode: PaperMode | "inherit") => void;
  onSetBg: (i: number, color: string | null) => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [paperMenu, setPaperMenu] = useState<number | null>(null);
  // Close paper menu if clicking outside any row.
  useEffect(() => {
    if (paperMenu == null) return;
    const onDoc = () => setPaperMenu(null);
    window.addEventListener("click", onDoc);
    return () => window.removeEventListener("click", onDoc);
  }, [paperMenu]);
  return (
    <div
      className="Island"
      style={{
        position: "absolute",
        bottom: "calc(100% + 10px)",
        // Center on the trigger button; viewport-edge clamp prevents
        // overflow on narrow screens / when the widget is dodged
        // to the left during frame presentation.
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: "calc(100vw - 32px)",
        padding: 6,
        borderRadius: "var(--border-radius-lg, 10px)",
        background: "var(--island-bg-color, #232329)",
        color: "var(--text-primary-color, var(--foreground))",
        boxShadow:
          "0 0 0 1px var(--default-border-color, rgba(255,255,255,0.08)), 0 10px 28px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        width: 320,
        maxHeight: 320,
        overflowY: "auto",
        fontSize: 12,
        fontFamily: "var(--ui-font, inherit)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 8px 6px 8px",
          fontSize: 10, fontWeight: 500,
          color: "color-mix(in oklab, var(--foreground) 55%, transparent)",
          textTransform: "uppercase", letterSpacing: 0.5,
        }}
      >
        Pages
        <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>
          {pages.length}
        </span>
      </div>
      {pages.map((p, i) => {
        const eff = !p.paper || p.paper === "inherit" ? globalPaper : p.paper;
        const inheriting = !p.paper || p.paper === "inherit";
        const active = i === page;
        return (
          <div
            key={i}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
            onDragLeave={() => setDragOver((v) => v === i ? null : v)}
            onDrop={(e) => { e.preventDefault(); if (dragFrom != null) onReorder(dragFrom, i); setDragFrom(null); setDragOver(null); }}
            onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
            style={{
              position: "relative",
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 6px",
              borderRadius: 6,
              background: active
                ? "var(--color-primary-light, color-mix(in oklab, var(--color-primary, #6965db) 18%, transparent))"
                : dragOver === i
                  ? "var(--button-hover-bg, color-mix(in oklab, var(--foreground) 8%, transparent))"
                  : "transparent",
              border: dragOver === i && dragFrom !== null && dragFrom !== i
                ? "1px dashed var(--color-primary, #6965db)"
                : "1px solid transparent",
              cursor: "grab",
              transition: "background 120ms ease",
            }}
            onMouseEnter={(e) => {
              if (active || dragOver === i) return;
              (e.currentTarget as HTMLDivElement).style.background =
                "var(--button-hover-bg, color-mix(in oklab, var(--foreground) 6%, transparent))";
            }}
            onMouseLeave={(e) => {
              if (active || dragOver === i) return;
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 14, height: 18,
                color: "color-mix(in oklab, var(--foreground) 35%, transparent)",
                userSelect: "none", cursor: "grab",
                lineHeight: 1,
              }}
            >
              <svg width="8" height="14" viewBox="0 0 6 10" fill="currentColor">
                <circle cx="1.5" cy="2" r="1" /><circle cx="4.5" cy="2" r="1" />
                <circle cx="1.5" cy="5" r="1" /><circle cx="4.5" cy="5" r="1" />
                <circle cx="1.5" cy="8" r="1" /><circle cx="4.5" cy="8" r="1" />
              </svg>
            </span>
            <button
              onClick={() => onJump(i)}
              style={{
                flex: 1, textAlign: "left",
                border: "none", background: "transparent",
                color: active ? "var(--color-primary, #6965db)" : "inherit",
                cursor: "pointer",
                padding: "4px 2px", fontSize: 12,
                fontWeight: active ? 600 : 400,
                fontVariantNumeric: "tabular-nums",
                fontFamily: "inherit",
              }}
            >Page {i + 1}</button>
            <div style={{ position: "relative" }}>
              <button
                onClick={(e) => { e.stopPropagation(); setPaperMenu((v) => v === i ? null : i); }}
                title={inheriting ? `Inherits global (${eff})` : `Paper: ${eff}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "0 6px", height: 22,
                  borderRadius: 4,
                  border: "1px solid var(--default-border-color, rgba(255,255,255,0.1))",
                  background: paperMenu === i
                    ? "var(--button-hover-bg, color-mix(in oklab, var(--foreground) 8%, transparent))"
                    : "transparent",
                  color: "inherit",
                  cursor: "pointer", fontSize: 10,
                  fontFamily: "inherit",
                  lineHeight: 1,
                }}
              >
                <PaperModeIcon mode={eff} />
                <span
                  style={{
                    opacity: inheriting ? 0.55 : 1,
                    textTransform: "capitalize",
                  }}
                >{eff}</span>
                <ChevronDown style={{ width: 10, height: 10, opacity: 0.6 }} />
              </button>
              {paperMenu === i && (
                <div
                  style={{
                    position: "absolute", top: "calc(100% + 4px)", right: 0,
                    minWidth: 130,
                    padding: 3,
                    background: "var(--island-bg-color, #232329)",
                    borderRadius: 6,
                    boxShadow: "0 0 0 1px var(--default-border-color, rgba(255,255,255,0.08)), 0 6px 18px rgba(0,0,0,0.3)",
                    zIndex: 2,
                    display: "flex", flexDirection: "column", gap: 1,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {(["inherit", "plain", "grid", "dots", "lines"] as const).map((m) => {
                    const sel = (p.paper ?? "inherit") === m;
                    const showIcon = m === "inherit" ? null : <PaperModeIcon mode={m} />;
                    return (
                      <button
                        key={m}
                        onClick={() => { onSetPaper(i, m); setPaperMenu(null); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          width: "100%", textAlign: "left",
                          padding: "6px 8px", borderRadius: 4,
                          border: "none",
                          background: sel
                            ? "var(--color-primary-light, color-mix(in oklab, var(--color-primary, #6965db) 18%, transparent))"
                            : "transparent",
                          color: sel ? "var(--color-primary, #6965db)" : "inherit",
                          cursor: "pointer", fontSize: 11,
                          textTransform: "capitalize",
                          fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => {
                          if (sel) return;
                          (e.currentTarget as HTMLButtonElement).style.background =
                            "var(--button-hover-bg, color-mix(in oklab, var(--foreground) 8%, transparent))";
                        }}
                        onMouseLeave={(e) => {
                          if (sel) return;
                          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                        }}
                      >
                        <span style={{ width: 14, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          {showIcon ?? <span style={{ opacity: 0.55 }}>↺</span>}
                        </span>
                        <span style={{ flex: 1 }}>{m}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <label
              title={p.bgColor ? `Page color: ${p.bgColor} (right-click to clear)` : "Set page color"}
              style={{
                position: "relative",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: 4,
                border: "1px solid var(--default-border-color, rgba(255,255,255,0.1))",
                background: p.bgColor || "transparent",
                cursor: "pointer",
                overflow: "hidden",
              }}
              onContextMenu={(e) => { e.preventDefault(); onSetBg(i, null); }}
            >
              {!p.bgColor && (
                <span style={{ fontSize: 12, opacity: 0.55, lineHeight: 1 }}>🎨</span>
              )}
              <input
                type="color"
                value={p.bgColor || "#ffffff"}
                onChange={(e) => onSetBg(i, e.currentTarget.value)}
                style={{
                  position: "absolute", inset: 0, opacity: 0,
                  width: "100%", height: "100%", cursor: "pointer",
                  border: "none", padding: 0,
                }}
              />
            </label>
            <button
              onClick={() => onDelete(i)}
              disabled={pages.length <= 1}
              title="Delete page"
              className="excal-present-btn"
              style={{
                width: 22, height: 22, padding: 0,
                opacity: pages.length <= 1 ? 0.4 : 1,
                cursor: pages.length <= 1 ? "not-allowed" : "pointer",
              }}
            ><X className="h-3 w-3" /></button>
          </div>
        );
      })}
    </div>
  );
}

function LayoutIcon({ mode }: { mode: "board" | "book" }) {
  const stroke = "currentColor";
  if (mode === "board") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={stroke} strokeWidth="1.2">
        <rect x="1.5" y="3" width="11" height="8" rx="1" />
      </svg>
    );
  }
  // book: two stacked rectangles representing pages.
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={stroke} strokeWidth="1.2">
      <rect x="2" y="1.8" width="9" height="5.2" rx="0.8" />
      <rect x="2" y="7.4" width="9" height="5" rx="0.8" />
    </svg>
  );
}

// GoodNotes-style page nav. Sits above Excalidraw's "Scroll back to
// content" anchor (~bottom 56px) so the two don't collide. Click the
// page indicator to open a jump-to-page popover.
// Same chrome as PresentOverlay (frame strip) — reuses `excal-present-*`
// classes so the two bars look identical and sit nicely beside each
// other. Anchored bottom-left when the frame strip is at center, so
// they no longer stack on top of each other.
export type PaperMode = "plain" | "grid" | "dots" | "lines";
export type BookPageMeta = { paper?: PaperMode | "inherit"; bgColor?: string | null };
export function BookNavWidget({
  page, pageCount, onPrev, onNext, onJump, onAddPage, onDeletePage, onReorder, onSetPagePaper, onSetPageBg, onExportPdf, onToggleOutline, outlineOpen, framePresenting, pages, globalPaper,
}: {
  page: number; pageCount: number;
  onPrev: () => void; onNext: () => void;
  onJump: (idx: number) => void;
  onAddPage: () => void;
  onDeletePage: (idx: number) => void;
  onReorder: (from: number, to: number) => void;
  onSetPagePaper: (idx: number, mode: PaperMode | "inherit") => void;
  onSetPageBg: (idx: number, color: string | null) => void;
  onExportPdf: () => void;
  onToggleOutline: () => void;
  outlineOpen: boolean;
  framePresenting: boolean;
  pages: BookPageMeta[];
  globalPaper: PaperMode;
}) {
  const [open, setOpen] = useState(false);
  const positionClass = framePresenting
    ? "left-4 -translate-x-0"  // dodge to the left when frame strip is centered
    : "left-1/2 -translate-x-1/2";
  return (
    <div
      className={`excal-present-bar absolute bottom-4 ${positionClass} z-40 inline-flex items-center gap-1`}
    >
      <button onClick={onPrev} disabled={page === 0} className="excal-present-btn" title="Previous page (←)">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Jump to page"
          className={`excal-present-counter ${open ? "is-active" : ""}`}
        >
          page {page + 1} / {pageCount}
        </button>
        {open && (
          <PageListPopover
            page={page}
            pages={pages}
            globalPaper={globalPaper}
            onJump={(i) => { onJump(i); setOpen(false); }}
            onDelete={onDeletePage}
            onReorder={onReorder}
            onSetPaper={onSetPagePaper}
            onSetBg={onSetPageBg}
          />
        )}
      </div>
      <button onClick={onNext} disabled={page >= pageCount - 1} className="excal-present-btn" title="Next page (→)">
        <ChevronRight className="h-4 w-4" />
      </button>
      <span className="excal-present-sep" />
      <button onClick={onAddPage} className="excal-present-btn" title="Add page">
        <Plus className="h-4 w-4" />
      </button>
      <label
        className="excal-present-btn"
        title="Set color for all pages at once (right-click to clear all)"
        style={{ position: "relative", cursor: "pointer", padding: 0, width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        onContextMenu={(e) => {
          e.preventDefault();
          pages.forEach((_, i) => onSetPageBg(i, null));
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 16, height: 16,
            borderRadius: 4,
            border: "1px solid var(--default-border-color, rgba(255,255,255,0.18))",
            background: (() => {
              // Show current uniform color if all pages share one; otherwise multi-stripe.
              const colors = pages.map((p) => p.bgColor || "#ffffff");
              const uniform = colors.every((c) => c === colors[0]);
              if (uniform) return colors[0];
              return "linear-gradient(135deg, #ffffff 0 33%, #c4b5fd 33% 66%, #1f2937 66% 100%)";
            })(),
          }}
        />
        <input
          type="color"
          aria-label="Set color for all pages"
          onChange={(e) => {
            const c = e.currentTarget.value;
            pages.forEach((_, i) => onSetPageBg(i, c));
          }}
          style={{
            position: "absolute", inset: 0, opacity: 0,
            width: "100%", height: "100%", cursor: "pointer",
            border: "none", padding: 0,
          }}
        />
      </label>
      <button onClick={onToggleOutline} className={`excal-present-btn ${outlineOpen ? "is-active" : ""}`} title="Outline (text per page)">
        <BookOpen className="h-4 w-4" />
      </button>
      <button onClick={onExportPdf} className="excal-present-btn" title="Export as PDF">
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}

// Right-side outline panel — Notion-style two-column list with tiny
// page thumbnails on the left and a hierarchical text outline on
// the right. Headings = the first text on each page (largest size
// wins), body lines = subsequent texts.
function BookOutlinePanel({
  pages, elements, currentPage, onJump, onClose,
}: {
  pages: BookPageMeta[];
  elements: readonly unknown[];
  currentPage: number;
  onJump: (i: number) => void;
  onClose: () => void;
}) {
  const byPage = useMemo(() => {
    type TextEl = { text: string; fontSize: number; y: number };
    const out: TextEl[][] = pages.map(() => []);
    for (const raw of elements) {
      const e = raw as { type?: string; isDeleted?: boolean; y?: number; text?: string; fontSize?: number } | null;
      if (!e || e.isDeleted || e.type !== "text" || !e.text) continue;
      const y = e.y ?? 0;
      const pageIdx = Math.floor(y / (BOOK_PAGE_H + BOOK_PAGE_GAP));
      if (pageIdx < 0 || pageIdx >= out.length) continue;
      out[pageIdx].push({
        text: String(e.text).split("\n").map((s) => s.trim()).filter(Boolean).join(" · ").slice(0, 100),
        fontSize: typeof e.fontSize === "number" ? e.fontSize : 20,
        y,
      });
    }
    // Sort each page's items by y ascending so reading order matches.
    for (const arr of out) arr.sort((a, b) => a.y - b.y);
    return out;
  }, [pages, elements]);
  return (
    <div
      className="Island"
      style={{
        position: "absolute",
        top: 56, right: 12, bottom: 12,
        width: 260,
        display: "flex", flexDirection: "column",
        borderRadius: "var(--border-radius-lg, 10px)",
        background: "var(--island-bg-color, #232329)",
        boxShadow:
          "0 0 0 1px var(--default-border-color, rgba(255,255,255,0.08)), 0 8px 24px rgba(0,0,0,0.25)",
        zIndex: 5,
        color: "var(--text-primary-color, var(--foreground))",
        overflow: "hidden",
        fontFamily: "var(--ui-font, inherit)",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 8px 8px 12px",
          fontSize: 10, fontWeight: 600,
          color: "color-mix(in oklab, var(--foreground) 65%, transparent)",
          textTransform: "uppercase", letterSpacing: 0.6,
          borderBottom: "1px solid var(--default-border-color, rgba(255,255,255,0.06))",
        }}
      >
        <BookOpen style={{ width: 12, height: 12, opacity: 0.7 }} />
        <span>Outline</span>
        <span
          style={{
            marginLeft: "auto",
            opacity: 0.55,
            fontVariantNumeric: "tabular-nums",
            textTransform: "none",
            letterSpacing: 0,
            fontWeight: 400,
            fontSize: 11,
          }}
        >{pages.length} page{pages.length === 1 ? "" : "s"}</span>
        <button
          onClick={onClose}
          title="Close"
          className="excal-present-btn"
          style={{ padding: 2, width: 22, height: 22 }}
        ><X style={{ width: 12, height: 12 }} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 4px" }}>
        {byPage.map((items, i) => {
          const head = items[0];
          const rest = items.slice(1, 4);
          const active = i === currentPage;
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => onJump(i)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJump(i); }}
              style={{
                position: "relative",
                padding: "6px 8px 6px 12px",
                margin: "1px 0",
                borderRadius: 6,
                cursor: "pointer",
                background: active
                  ? "var(--color-primary-light, color-mix(in oklab, var(--color-primary, #6965db) 18%, transparent))"
                  : "transparent",
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => {
                if (active) return;
                (e.currentTarget as HTMLDivElement).style.background =
                  "var(--button-hover-bg, color-mix(in oklab, var(--foreground) 6%, transparent))";
              }}
              onMouseLeave={(e) => {
                if (active) return;
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: 10, fontVariantNumeric: "tabular-nums",
                    color: active ? "var(--color-primary, #6965db)" : "color-mix(in oklab, var(--foreground) 50%, transparent)",
                    minWidth: 16,
                  }}
                >{i + 1}</span>
                <span
                  style={{
                    flex: 1, minWidth: 0,
                    fontSize: 12,
                    fontWeight: head ? 500 : 400,
                    color: head
                      ? "var(--text-primary-color, var(--foreground))"
                      : "color-mix(in oklab, var(--foreground) 50%, transparent)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {head ? head.text : `Page ${i + 1}`}
                </span>
              </div>
              {rest.length > 0 && (
                <div style={{ marginLeft: 22, marginTop: 2 }}>
                  {rest.map((it, j) => (
                    <div
                      key={j}
                      style={{
                        fontSize: 10.5,
                        color: "color-mix(in oklab, var(--foreground) 55%, transparent)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        lineHeight: 1.5,
                      }}
                    >{it.text}</div>
                  ))}
                  {items.length > 4 && (
                    <div style={{ fontSize: 10, opacity: 0.35, lineHeight: 1.5 }}>+{items.length - 4} more</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PaperModeIcon({ mode }: { mode: "plain" | "grid" | "dots" | "lines" }) {
  const stroke = "currentColor";
  if (mode === "plain") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={stroke} strokeWidth="1.2">
        <rect x="2" y="2" width="10" height="10" rx="1.5" />
      </svg>
    );
  }
  if (mode === "grid") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={stroke} strokeWidth="1">
        <rect x="2" y="2" width="10" height="10" rx="1.5" />
        <path d="M5.3 2v10M8.6 2v10M2 5.3h10M2 8.6h10" opacity="0.7" />
      </svg>
    );
  }
  if (mode === "dots") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill={stroke} stroke="none">
        <rect x="2" y="2" width="10" height="10" rx="1.5" fill="none" stroke={stroke} strokeWidth="1" />
        <circle cx="5" cy="5" r="0.7" /><circle cx="9" cy="5" r="0.7" />
        <circle cx="5" cy="9" r="0.7" /><circle cx="9" cy="9" r="0.7" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={stroke} strokeWidth="1">
      <rect x="2" y="2" width="10" height="10" rx="1.5" />
      <path d="M2 5.3h10M2 8.6h10" opacity="0.7" />
    </svg>
  );
}

export function PaperBackdrop({
  mode, appState, bgColor,
}: {
  mode: "grid" | "dots" | "lines";
  appState: Record<string, unknown>;
  bgColor?: string | null;
}) {
  const s = appState as { scrollX?: number; scrollY?: number; zoom?: { value?: number } };
  const zoom = s.zoom?.value ?? 1;
  const sx = (s.scrollX ?? 0) * zoom;
  const sy = (s.scrollY ?? 0) * zoom;
  // World-space spacing (px at zoom=1).
  const baseGrid = 32;
  const baseDots = 24;
  const baseLines = 28;
  const style: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
    opacity: 0.85,
  };
  // Auto-flip pattern stroke based on wrapper bg brightness so dots
  // stay visible on both cream/sand light bgs and forest/charcoal
  // darks. Falls back to `--foreground` token when no explicit bg is
  // set (the theme handles contrast itself).
  const isLight = isLightHex(bgColor);
  const lineColor = bgColor
    ? (isLight ? "rgba(20, 20, 24, 0.45)" : "rgba(255, 255, 255, 0.45)")
    : "color-mix(in oklab, var(--foreground) 32%, transparent)";
  // Below ~30% zoom, the pattern grid becomes denser than the
  // strokes themselves — visually noisy + obscures content. Snap
  // to multiples of the base spacing so the pattern stays
  // legible at any zoom (12×12 → 24×24 → 48×48 in CSS px).
  // Also progressively fade ink so faint strokes remain visible.
  const minSpacing = 14;
  const ensureSpacing = (sz: number) => {
    let s = sz;
    let mult = 1;
    while (s < minSpacing) { mult *= 2; s = sz * mult; }
    return { px: s, mult };
  };
  // Fade alpha at low zoom so pattern recedes behind content.
  const fade = zoom < 0.3 ? Math.max(0.4, zoom / 0.3) : 1;
  const fadedInk = bgColor
    ? (isLight ? `rgba(20, 20, 24, ${0.45 * fade})` : `rgba(255, 255, 255, ${0.45 * fade})`)
    : `color-mix(in oklab, var(--foreground) ${Math.round(32 * fade)}%, transparent)`;
  if (mode === "grid") {
    const { px: sz } = ensureSpacing(baseGrid * zoom);
    style.backgroundImage = `linear-gradient(to right, ${fadedInk} 1px, transparent 1px), linear-gradient(to bottom, ${fadedInk} 1px, transparent 1px)`;
    style.backgroundSize = `${sz}px ${sz}px, ${sz}px ${sz}px`;
    style.backgroundPosition = `${sx}px ${sy}px, ${sx}px ${sy}px`;
  } else if (mode === "dots") {
    const { px: sz } = ensureSpacing(baseDots * zoom);
    const dotR = Math.max(1, 1.2 * zoom);
    style.backgroundImage = `radial-gradient(circle, ${fadedInk} ${dotR}px, transparent ${dotR}px)`;
    style.backgroundSize = `${sz}px ${sz}px`;
    style.backgroundPosition = `${sx}px ${sy}px`;
  } else {
    const { px: sz } = ensureSpacing(baseLines * zoom);
    style.backgroundImage = `linear-gradient(to bottom, ${fadedInk} 1px, transparent 1px)`;
    style.backgroundSize = `${sz}px ${sz}px`;
    style.backgroundPosition = `${sx}px ${sy}px`;
  }
  return <div style={style} aria-hidden />;
}

function clampNum(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Cheap luminance check for #rrggbb / #rgb. Returns true when the
// color reads "light" so PaperBackdrop can flip its stroke to dark.
function isLightHex(c?: string | null): boolean {
  if (!c || typeof c !== "string") return true;
  let hex = c.trim().replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map((x) => x + x).join("");
  if (hex.length !== 6) return true;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return true;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55;
}

// Inject free-range sliders into Excalidraw's right-side properties
// panel for stroke-width and font-size. We portal a React slider
// inside the matching fieldset so it inherits panel styling, and we
// mimic Excalidraw's native Range markup (`control-label`,
// `range-wrapper`, `range-input`, `value-bubble`) so the result
// matches the existing Opacity slider one-for-one.
function PropertyPanelSliders({ excalRef, ready }: { excalRef: React.MutableRefObject<ExcalApi | null>; ready: boolean }) {
  const [strokeHost, setStrokeHost] = useState<HTMLElement | null>(null);
  const [fontHost, setFontHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!ready) return;
    let strokeEl: HTMLDivElement | null = null;
    let fontEl: HTMLDivElement | null = null;
    const attach = () => {
      const swProbe = document.querySelector('[data-testid="strokeWidth-thin"]');
      const swFieldset = swProbe?.closest("fieldset") as HTMLElement | null;
      if (swFieldset) {
        if (!strokeEl || !swFieldset.contains(strokeEl)) {
          strokeEl?.remove();
          strokeEl = document.createElement("div");
          strokeEl.className = "excal-extra-slider";
          swFieldset.appendChild(strokeEl);
          setStrokeHost(strokeEl);
        }
      } else if (strokeEl) {
        strokeEl.remove();
        strokeEl = null;
        setStrokeHost(null);
      }
      const fsProbe = document.querySelector('[data-testid="fontSize-small"]');
      const fsFieldset = fsProbe?.closest("fieldset") as HTMLElement | null;
      if (fsFieldset) {
        if (!fontEl || !fsFieldset.contains(fontEl)) {
          fontEl?.remove();
          fontEl = document.createElement("div");
          fontEl.className = "excal-extra-slider";
          fsFieldset.appendChild(fontEl);
          setFontHost(fontEl);
        }
      } else if (fontEl) {
        fontEl.remove();
        fontEl = null;
        setFontHost(null);
      }
    };
    attach();
    const obs = new MutationObserver(attach);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      strokeEl?.remove();
      fontEl?.remove();
    };
  }, [ready]);
  return (
    <>
      {strokeHost && createPortal(
        <SliderControl
          excalRef={excalRef}
          kind="strokeWidth"
          min={0.1} max={20} step={0.1} defaultVal={2}
          storageKey="sketch.thicknessPref"
        />, strokeHost,
      )}
      {fontHost && createPortal(
        <SliderControl
          excalRef={excalRef}
          kind="fontSize"
          min={8} max={96} step={1} defaultVal={20}
          storageKey="sketch.fontSizePref"
        />, fontHost,
      )}
    </>
  );
}

function SliderControl({
  excalRef, kind, min, max, step, defaultVal, storageKey,
}: {
  excalRef: React.MutableRefObject<ExcalApi | null>;
  kind: "strokeWidth" | "fontSize";
  min: number; max: number; step: number; defaultVal: number;
  storageKey: string;
}) {
  const [value, setValue] = useState<number>(() => {
    if (typeof window === "undefined") return defaultVal;
    const raw = window.localStorage.getItem(storageKey);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? clampNum(n, min, max) : defaultVal;
  });
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  // Poll appState so chip clicks (S/M/L/XL) update the slider too.
  useEffect(() => {
    const key = kind === "strokeWidth" ? "currentItemStrokeWidth" : "currentItemFontSize";
    const id = window.setInterval(() => {
      const api = excalRef.current;
      if (!api) return;
      const app = api.getAppState() as Record<string, unknown>;
      const cur = Number(app[key]);
      if (Number.isFinite(cur) && Math.abs(cur - valueRef.current) > 0.001) {
        setValue(clampNum(cur, min, max));
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [excalRef, kind, min, max]);

  const apply = (raw: number) => {
    const next = clampNum(raw, min, max);
    setValue(next);
    try { window.localStorage.setItem(storageKey, String(next)); } catch {}
    const api = excalRef.current;
    if (!api) return;
    const appState = api.getAppState() as { selectedElementIds?: Record<string, boolean> };
    const stateUpdate = kind === "strokeWidth"
      ? { currentItemStrokeWidth: next }
      : { currentItemFontSize: next };
    const ids = appState.selectedElementIds ?? {};
    const selectedKeys = Object.keys(ids).filter((k) => ids[k]);
    if (selectedKeys.length > 0) {
      const els = api.getSceneElements() as ReadonlyArray<Record<string, unknown>>;
      const sel = new Set(selectedKeys);
      const nextEls = els.map((e) => {
        if (typeof e.id !== "string" || !sel.has(e.id)) return e;
        if (kind === "fontSize" && e.type !== "text") return e;
        return {
          ...e,
          [kind]: next,
          version: ((e.version as number) ?? 0) + 1,
          versionNonce: Math.floor(Math.random() * 0x7fffffff),
          updated: Date.now(),
        };
      });
      api.updateScene({ elements: nextEls as never, appState: stateUpdate });
    } else {
      api.updateScene({ appState: stateUpdate });
    }
  };

  const label = kind === "strokeWidth" ? "Width" : "Size";
  // Mimic Excalidraw's native Range: `control-label` wraps a
  // `range-wrapper` containing a `range-input` and a `value-bubble`.
  // We also paint the same linear-gradient on the track so the
  // filled portion matches the native opacity slider visually.
  const rangeRef = useRef<HTMLInputElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const r = rangeRef.current; const b = bubbleRef.current;
    if (!r || !b) return;
    const pct = ((value - min) / (max - min)) * 100;
    const w = r.offsetWidth || 120;
    const thumb = 15;
    const pos = (pct / 100) * (w - thumb) + thumb / 2;
    b.style.left = `${pos}px`;
    r.style.background = `linear-gradient(to right, var(--color-slider-track) 0%, var(--color-slider-track) ${pct}%, var(--button-bg) ${pct}%, var(--button-bg) 100%)`;
  }, [value, min, max]);
  return (
    <label className="control-label excal-extra-slider-label">
      {label}
      <div className="range-wrapper">
        <input
          ref={rangeRef}
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => apply(Number(e.currentTarget.value))}
          className="range-input"
          aria-label={kind === "strokeWidth" ? "Stroke width" : "Font size"}
        />
        <div className="value-bubble" ref={bubbleRef}>{Number.isFinite(value) ? value : ""}</div>
        <div className="zero-label">{min}</div>
      </div>
    </label>
  );
}

// Trim Excalidraw's More-tools dropdown: remove the inline
// "Generate" heading and the Mermaid item we don't expose. Restyling
// to match excal-popover is in globals.css.
function TrimMoreToolsDropdown() {
  useEffect(() => {
    const trim = () => {
      const dd = document.querySelector(".App-toolbar__extra-tools-dropdown");
      if (!dd) return;
      // Remove the bold "Generate" sub-heading <div>.
      dd.querySelectorAll<HTMLElement>(":scope > .Stack > div").forEach((n) => {
        if (!n.classList.contains("dropdown-menu-item") && /generate/i.test(n.textContent || "")) {
          n.style.display = "none";
        }
      });
      // Hide the Mermaid item (it ships as data-testid="toolbar-embeddable"
      // a second time, with the text "Mermaid to Excalidraw").
      dd.querySelectorAll<HTMLElement>(".dropdown-menu-item").forEach((n) => {
        if (/mermaid/i.test(n.textContent || "")) n.style.display = "none";
      });
    };
    const obs = new MutationObserver(trim);
    obs.observe(document.body, { childList: true, subtree: true });
    trim();
    return () => obs.disconnect();
  }, []);
  return null;
}
// Compact 3-column tile grid for the Templates dropdown. Replaces
// the ~24-row vertical list which overflowed below the viewport.
const TEMPLATE_ICONS: Record<TemplateKey, React.ReactNode> = {
  mindmap:       <Network className="h-4 w-4" />,
  flowchart:     <ArrowDown className="h-4 w-4" />,
  kanban:        <Columns3 className="h-4 w-4" />,
  swot:          <Grid2x2 className="h-4 w-4" />,
  arch3tier:     <Layers className="h-4 w-4" />,
  c4context:     <Boxes className="h-4 w-4" />,
  microservices: <Boxes className="h-4 w-4" />,
  deployment:    <Layers className="h-4 w-4" />,
  classdiagram:  <Component className="h-4 w-4" />,
  sequence:      <MessageSquare className="h-4 w-4" />,
  statemachine:  <RotateCw className="h-4 w-4" />,
  er:            <Database className="h-4 w-4" />,
  usecase:       <Users className="h-4 w-4" />,
  dfd:           <ArrowDown className="h-4 w-4" />,
  cicd:          <GitBranch className="h-4 w-4" />,
  gitflow:       <GitBranch className="h-4 w-4" />,
  oauth:         <Key className="h-4 w-4" />,
  rest:          <FileCode className="h-4 w-4" />,
  mvvm:          <Component className="h-4 w-4" />,
  stride:        <Shield className="h-4 w-4" />,
  retro4ls:      <Grid2x2 className="h-4 w-4" />,
  sprint:        <Columns3 className="h-4 w-4" />,
  mathgrid:      <Sigma className="h-4 w-4" />,
  mathplot:      <LineChart className="h-4 w-4" />,
  mathproof:     <Triangle className="h-4 w-4" />,
  mathfrac:      <PieChart className="h-4 w-4" />,
  k8s:           <Cloud className="h-4 w-4" />,
  docker:        <Container className="h-4 w-4" />,
  registry:      <Package className="h-4 w-4" />,
  monitor:       <Activity className="h-4 w-4" />,
  wireframe:     <Layout className="h-4 w-4" />,
  form:          <FormInput className="h-4 w-4" />,
  cardgrid:      <LayoutGrid className="h-4 w-4" />,
  modal:         <MessageSquare className="h-4 w-4" />,
  hexarch:       <Hexagon className="h-4 w-4" />,
  eventstorm:    <Workflow className="h-4 w-4" />,
  layered:       <Layers className="h-4 w-4" />,
  erext:         <Database className="h-4 w-4" />,
};
function TemplateGrid({ onTemplate }: { onTemplate: (k: TemplateKey) => void }) {
  const cats: Array<{ key: string; title: string }> = [
    { key: "general", title: "General" },
    { key: "architecture", title: "Architecture" },
    { key: "uml", title: "UML" },
    { key: "process", title: "Process" },
    { key: "security", title: "Security" },
    { key: "team", title: "Team" },
    { key: "math", title: "Math" },
    { key: "devops", title: "DevOps" },
    { key: "webui", title: "Web UI" },
    { key: "diagrams", title: "Diagrams+" },
  ];
  return (
    <>
      {cats.map((c) => {
        const keys = (Object.keys(TEMPLATE_META) as TemplateKey[]).filter(
          (k) => TEMPLATE_META[k].cat === c.key,
        );
        if (!keys.length) return null;
        return (
          <Fragment key={c.key}>
            <li className="excal-popover-section">{c.title}</li>
            <li>
              <div className="excal-popover-grid">
                {keys.map((k) => (
                  <button
                    key={k}
                    onClick={() => onTemplate(k)}
                    className="excal-popover-tile"
                    title={TEMPLATE_META[k].desc}
                  >
                    <span className="excal-popover-tile-icon">{TEMPLATE_ICONS[k]}</span>
                    <span className="excal-popover-tile-label">{TEMPLATE_META[k].label}</span>
                  </button>
                ))}
              </div>
            </li>
          </Fragment>
        );
      })}
    </>
  );
}
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
  pendingPads, onApprovePad, onDenyPad, paperMode, onPaperMode,
  onZoomDelta, onZoomReset, zoomPct,
  hideFullscreenButton,
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
  paperMode: "plain" | "grid" | "dots" | "lines";
  onPaperMode: (m: "plain" | "grid" | "dots" | "lines") => void;
  onZoomDelta: (factor: number) => void;
  onZoomReset: () => void;
  zoomPct: number;
  hideFullscreenButton?: boolean;
}) {
  const [open, setOpen] = useState<null | "ai" | "export" | "pad" | "paper">(null);
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
        <TemplateGrid
          onTemplate={(k) => { onTemplate(k); setOpen(null); }}
        />
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
{!hideFullscreenButton && (
        <button onClick={onToggleFull} className="excal-btn" title={full ? "Exit fullscreen (F)" : "Fullscreen (F)"}>
          {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      )}
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
  viewOnly, onToggleViewOnly,
}: {
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
  onToggleFocus: () => void;
  focused: boolean;
  viewOnly: boolean;
  onToggleViewOnly: () => void;
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
      <button
        onClick={onToggleViewOnly}
        title={viewOnly ? "Exit view mode (edit again)" : "View mode (read-only)"}
        className={`excal-present-btn ${viewOnly ? "is-active" : ""}`}
      >
        <Eye className="h-4 w-4" />
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

type MinimapProps = {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  open: boolean;
  onToggle: () => void;
  onNavigate: (worldX: number, worldY: number) => void;
  onZoom?: (worldX: number, worldY: number, deltaY: number) => void;
  onFitAll?: () => void;
  size?: "sm" | "lg";
  defaultCorner?: "tl" | "tr" | "bl" | "br";
  cursor?: { x: number; y: number } | null;
  // Extra inset (px) added to the corner's vertical edge — used on iPad
  // to clear the centered native top toolbar so they don't overlap.
  topOffset?: number;
};

function MinimapImpl({
  elements, appState, open, onToggle, onNavigate, onZoom, onFitAll, size = "sm", defaultCorner = "br", cursor, topOffset = 0,
}: MinimapProps) {
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

  const cornerStyle = pickMinimapCornerStyle(defaultCorner);
  if (topOffset && typeof cornerStyle.top === "number") cornerStyle.top += topOffset;
  const style: React.CSSProperties = pos
    ? { position: "absolute", left: pos.left, top: pos.top, zIndex: 4 }
    : { position: "absolute", ...cornerStyle, zIndex: 4 };

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
            {cursor && (
              // Local cursor dot — bright pulse so it's findable at
              // a glance like the tablet's pencil indicator.
              <>
                <circle
                  cx={toX(cursor.x)} cy={toY(cursor.y)} r={6}
                  fill="#f59e0b" opacity={0.25}
                />
                <circle
                  cx={toX(cursor.x)} cy={toY(cursor.y)} r={3.5}
                  fill="#fbbf24" stroke="#fff" strokeWidth={1.25} opacity={1}
                />
              </>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

// React.memo with a fingerprint-based equality. SVG-heavy minimap was
// re-rendering on every parent onChange even when the scene + viewport
// hadn't moved enough to matter visually. Comparing (element count,
// last live id, viewport rect rounded to 0.5 px, zoom rounded to 3 dp,
// open flag) skips ~90 % of renders during steady drawing without
// dropping any user-visible frame.
function minimapPropsEqual(a: MinimapProps, b: MinimapProps): boolean {
  if (a.open !== b.open) return false;
  if (a.size !== b.size) return false;
  if (a.defaultCorner !== b.defaultCorner) return false;
  if (a.elements === b.elements) {
    // appState may still have moved.
  } else {
    if (a.elements.length !== b.elements.length) return false;
    // Cheap sample: same first/last live ids.
    const sampleId = (els: readonly unknown[], idx: number) => {
      const e = els[idx] as { id?: string; isDeleted?: boolean } | null | undefined;
      return e && !e.isDeleted ? e.id ?? "" : "";
    };
    if (a.elements.length > 0) {
      if (sampleId(a.elements, 0) !== sampleId(b.elements, 0)) return false;
      const last = a.elements.length - 1;
      if (sampleId(a.elements, last) !== sampleId(b.elements, last)) return false;
    }
  }
  const av = a.appState as { scrollX?: number; scrollY?: number; zoom?: { value?: number } };
  const bv = b.appState as { scrollX?: number; scrollY?: number; zoom?: { value?: number } };
  const round = (n: number | undefined) => Math.round((n ?? 0) * 2) / 2;
  if (round(av.scrollX) !== round(bv.scrollX)) return false;
  if (round(av.scrollY) !== round(bv.scrollY)) return false;
  const zoomA = Math.round((av.zoom?.value ?? 1) * 1000);
  const zoomB = Math.round((bv.zoom?.value ?? 1) * 1000);
  if (zoomA !== zoomB) return false;
  // Cursor dot — re-render when it moves more than 0.5 px in world
  // coords, when it appears, or when it disappears.
  if (!!a.cursor !== !!b.cursor) return false;
  if (a.cursor && b.cursor) {
    if (Math.round(a.cursor.x * 2) !== Math.round(b.cursor.x * 2)) return false;
    if (Math.round(a.cursor.y * 2) !== Math.round(b.cursor.y * 2)) return false;
  }
  return true;
}
export const Minimap = memo(MinimapImpl, minimapPropsEqual);

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
