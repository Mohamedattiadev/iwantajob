"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { API, fetcher } from "@/lib/api";
import useSWR from "swr";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

export function SkillSketch({ skill }: { skill: string }) {
  const slug = `skill-${encodeURIComponent(skill.toLowerCase())}`;
  const { data: doc, mutate } = useSWR<{ elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> }>(
    `/api/drawings/${slug}`,
    fetcher,
  );
  const [full, setFull] = useState(false);
  const [saved, setSaved] = useState(false);
  const last = useRef("");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (payload: object) => {
    const body = JSON.stringify({ data: { ...payload, title: skill } });
    if (body === last.current) return;
    last.current = body;
    const r = await fetch(`${API}/api/drawings/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); mutate(); }
  }, [skill, slug, mutate]);

  const onChange = useCallback((elements: readonly unknown[], appState: unknown, files: Record<string, unknown>) => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => save({ elements: [...elements], appState: appState as Record<string, unknown>, files }), 700);
  }, [save]);

  return (
    <div className={full ? "fixed inset-0 z-50 bg-background p-4" : "relative"}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">
          Sketch for <b>{skill}</b> · auto-saves
          {saved && <span className="ml-2 inline-flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3 w-3" /> saved</span>}
        </div>
        <button
          onClick={() => setFull((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {full ? <><Minimize2 className="h-3.5 w-3.5" /> Exit fullscreen</> : <><Maximize2 className="h-3.5 w-3.5" /> Fullscreen</>}
        </button>
      </div>
      <div className={`rounded-xl overflow-hidden border border-foreground/10 bg-card ${full ? "h-[calc(100vh-72px)]" : "h-[65vh]"}`}>
        <Excalidraw
          key={slug}
          initialData={doc ? {
            elements: (doc.elements as never) ?? [],
            appState: { ...(doc.appState ?? {}), collaborators: new Map() } as never,
            files: (doc.files as never) ?? {},
          } : undefined}
          onChange={onChange}
          theme="dark"
        />
      </div>
    </div>
  );
}
