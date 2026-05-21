"use client";

import dynamic from "next/dynamic";
import { use, useCallback, useMemo, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, Pencil, CheckCircle2 } from "lucide-react";
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

export default function SharedSketchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const sp = useSearchParams();
  const editMode = sp.get("mode") === "edit";
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
      appState: { ...safe, collaborators: new Map(), viewModeEnabled: !editMode } as never,
      files: (data.files && typeof data.files === "object" ? data.files : {}) as never,
    };
  }, [data, editMode]);

  // Debounced save when in edit mode so collaborators see updates without
  // hammering the backend.
  const lastBody = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(async (payload: object) => {
    const body = JSON.stringify({ data: { ...payload, title: data?.title ?? slug } });
    if (body === lastBody.current) return;
    lastBody.current = body;
    const r = await fetch(`${API}/api/drawings/${encodeURIComponent(slug)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body,
    });
    if (r.ok) mutate();
  }, [data?.title, mutate, slug]);

  const onChange = useCallback((elements: readonly unknown[], appState: unknown, files: Record<string, unknown>) => {
    if (!editMode) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save({ elements: [...elements], appState: appState as Record<string, unknown>, files });
    }, 1500);
  }, [editMode, save]);

  const title = data?.title ?? slug;
  const displayName = title.startsWith("skill-") ? title.slice(6) : title;

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/60 backdrop-blur">
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
              {editMode ? "Shared (editing)" : "Shared (read-only)"}
            </span>
            <span className="font-semibold truncate max-w-[40ch]">{displayName}</span>
          </span>
        </div>
        {editMode && (
          <span className="text-[10px] text-emerald-500 font-mono inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> auto-saves
          </span>
        )}
      </header>
      <div className="flex-1 min-h-0">
        {error ? (
          <div className="grid place-items-center h-full text-sm text-muted-foreground">Sketch not found.</div>
        ) : isLoading || !initialData ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <Excalidraw
            initialData={initialData}
            viewModeEnabled={!editMode}
            onChange={editMode ? onChange : undefined}
          />
        )}
      </div>
    </div>
  );
}
