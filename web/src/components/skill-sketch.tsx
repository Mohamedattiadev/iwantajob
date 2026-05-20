"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, CheckCircle2, Lock, LockOpen, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { API, fetcher } from "@/lib/api";
import useSWR from "swr";
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

function skillSlug(skill: string) {
  return skill.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}

const DEBOUNCE_MS = 1500;

export function SkillSketch({ skill }: { skill: string }) {
  const slug = `skill-${skillSlug(skill)}`;
  const { data: doc, mutate } = useSWR<DrawingDoc>(`/api/drawings/${slug}`, fetcher);
  const [full, setFull] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toolLock, setToolLock] = useState(true);
  const last = useRef("");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memoized initialData — only changes when slug changes (not on every render or doc poll).
  const initialData = useMemo(() => {
    if (!doc) return undefined;
    return {
      elements: (doc.elements as never) ?? [],
      appState: {
        ...(doc.appState ?? {}),
        collaborators: new Map(),
        activeTool: { type: "selection", locked: toolLock, lastActiveTool: null, customType: null },
      } as never,
      files: (doc.files as never) ?? {},
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, !!doc]);

  const save = useCallback(async (payload: object) => {
    const body = JSON.stringify({ data: { ...payload, title: skill } });
    if (body === last.current) return;
    last.current = body;
    const r = await fetch(`${API}/api/drawings/${slug}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body,
    });
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); mutate(); }
  }, [skill, slug, mutate]);

  const onChange = useCallback((elements: readonly unknown[], appState: unknown, files: Record<string, unknown>) => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(
      () => save({ elements: [...elements], appState: appState as Record<string, unknown>, files }),
      DEBOUNCE_MS,
    );
  }, [save]);

  const reset = async () => {
    if (!confirm(`Clear all elements on ${skill} sketch?`)) return;
    await fetch(`${API}/api/drawings/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { title: skill, elements: [], appState: {}, files: {} } }),
    });
    last.current = "";
    mutate();
  };

  return (
    <div className={full ? "fixed inset-0 z-50 bg-background p-3 flex flex-col gap-2" : "flex flex-col gap-2"}>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">Sketch · auto-saves</span>
        {saved && <span className="inline-flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3 w-3" /> saved</span>}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setToolLock((v) => !v)}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            title={toolLock ? "Tool stays active after drawing (default)" : "Tool reverts to selection after drawing"}
          >
            {toolLock ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
            {toolLock ? "locked" : "unlocked"}
          </button>
          <button onClick={reset} className="inline-flex items-center gap-1 text-muted-foreground hover:text-rose-500" title="Clear canvas">
            <RotateCcw className="h-3 w-3" /> clear
          </button>
          <button onClick={() => setFull((v) => !v)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            {full ? <><Minimize2 className="h-3 w-3" /> exit</> : <><Maximize2 className="h-3 w-3" /> full</>}
          </button>
        </div>
      </div>

      <div className={`rounded-xl overflow-hidden border border-foreground/10 bg-card ${full ? "flex-1" : "h-[70vh]"}`}>
        <Excalidraw
          key={slug}
          initialData={initialData}
          onChange={onChange}
          theme="dark"
        />
      </div>
    </div>
  );
}

// Preload the Excalidraw chunk in the background on parent mount, so first tab
// click doesn't flash a skeleton. Mount this once on the skill page.
export function SketchPreloader() {
  useEffect(() => {
    import("@excalidraw/excalidraw").catch(() => {});
  }, []);
  return null;
}
