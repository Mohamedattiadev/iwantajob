"use client";

import dynamic from "next/dynamic";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, Pencil, CheckCircle2, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { API, fetcher } from "@/lib/api";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
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
  updateScene: (data: { appState?: Record<string, unknown> }) => void;
};

export default function SharedSketchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const sp = useSearchParams();
  const editMode = sp.get("mode") === "edit";
  const penMode = sp.get("pen") === "1";
  const { data, isLoading, error, mutate } = useSWR<DrawingDoc>(`/api/drawings/${encodeURIComponent(slug)}`, fetcher);

  const initialData = useMemo(() => {
    if (!data) return undefined;
    const els = Array.isArray(data.elements) ? data.elements : [];
    const elements = (els as Array<Record<string, unknown> | null>)
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof e.type === "string");
    const src = (data.appState ?? {}) as Record<string, unknown>;
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
      files: (data.files && typeof data.files === "object" ? data.files : {}) as never,
    };
  }, [data, editMode, penMode]);

  const excalRef = useRef<ExcalApi | null>(null);
  const lastBody = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const onChange = useCallback((elements: readonly unknown[], appState: unknown, files: Record<string, unknown>) => {
    if (!editMode) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save({ elements: [...elements], appState: appState as Record<string, unknown>, files });
    }, 1500);
  }, [editMode, save]);

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

  const title = data?.title ?? slug;
  const displayName = title.startsWith("skill-") ? title.slice(6) : title;

  return (
    <div className="fixed inset-0 flex flex-col bg-background" style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}>
      <header className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/60 backdrop-blur shrink-0">
        <div className="inline-flex items-center gap-3 min-w-0">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Home
          </Link>
          <span className="h-4 w-px bg-border/60" />
          <span className="inline-flex items-center gap-1.5 text-xs">
            {editMode
              ? <Pencil className="h-3.5 w-3.5 text-primary" />
              : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="font-mono uppercase tracking-wider text-muted-foreground">
              {editMode ? (penMode ? "iPad (pen)" : "Shared (editing)") : "Shared (read-only)"}
            </span>
            <span className="font-semibold truncate max-w-[40ch]">{displayName}</span>
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
        {error ? (
          <div className="grid place-items-center h-full p-6 text-center text-sm text-muted-foreground">
            <div className="max-w-md">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-amber-500" />
              <div className="font-semibold text-foreground mb-1">Can&apos;t reach the sketch server</div>
              <p className="opacity-80">
                The iPad reached the page, but the API at <code className="font-mono">{API}</code> is unreachable.
              </p>
              <p className="opacity-60 mt-2 text-xs">
                On the laptop: stop the dev server and restart with <code className="font-mono">./run lan</code> so the backend binds <code className="font-mono">0.0.0.0:8000</code>. Then refresh this page.
              </p>
            </div>
          </div>
        ) : isLoading || !initialData ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <Excalidraw
            initialData={initialData}
            viewModeEnabled={!editMode}
            onChange={editMode ? onChange : undefined}
            aiEnabled={false}
            excalidrawAPI={(api) => { excalRef.current = api as ExcalApi; }}
          />
        )}
      </div>
    </div>
  );
}
