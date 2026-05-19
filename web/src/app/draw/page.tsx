"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Save, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { API, fetcher } from "@/lib/api";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-2xl" /> },
);

type DrawList = { slug: string; title: string; updated_at: number }[];
type DrawData = {
  title?: string;
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

function DrawInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const name = sp.get("name") || "system-design";
  const list = useSWR<DrawList>("/api/drawings", fetcher, { refreshInterval: 0 });
  const { data: doc, mutate } = useSWR<DrawData>(`/api/drawings/${encodeURIComponent(name)}`, fetcher);
  const [title, setTitle] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerialized = useRef<string>("");

  useEffect(() => {
    if (doc) setTitle(doc.title ?? name);
  }, [doc, name]);

  const save = useCallback(async (payload: DrawData) => {
    const body = JSON.stringify({ data: { ...payload, title: title || name } });
    if (body === lastSerialized.current) return;
    lastSerialized.current = body;
    const r = await fetch(`${API}/api/drawings/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (r.ok) {
      setSavedAt(Date.now());
      setDirty(false);
      list.mutate();
    }
  }, [name, title, list]);

  const onChange = useCallback((elements: readonly unknown[], appState: unknown, files: Record<string, unknown>) => {
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save({
        elements: [...elements],
        appState: appState as Record<string, unknown>,
        files,
      });
    }, 800);
  }, [save]);

  const newDoc = () => {
    const n = prompt("Drawing name (slug)", "untitled-" + Math.random().toString(36).slice(2, 6));
    if (!n) return;
    router.push(`/draw?name=${encodeURIComponent(n)}`);
  };

  const remove = async () => {
    if (!confirm(`Delete drawing "${name}"?`)) return;
    await fetch(`${API}/api/drawings/${encodeURIComponent(name)}`, { method: "DELETE" });
    list.mutate();
    router.push("/draw");
  };

  return (
    <div className="space-y-8 anim-in">
      <PageHeader
        eyebrow="05 · draw"
        title={<>Sketch your <em className="font-serif text-muted-foreground not-italic">system designs.</em></>}
        subtitle="Excalidraw, embedded. Auto-saves to backend. Use it for: interview prep system diagrams, architecture for portfolio projects, sticky notes."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          onBlur={() => doc && save(doc)}
          className="max-w-xs"
          placeholder="Title"
        />
        <span className="text-xs font-mono text-muted-foreground">
          slug: {name}
        </span>
        <span className="text-xs ml-auto inline-flex items-center gap-1.5">
          {dirty ? (
            <span className="text-amber-500">saving…</span>
          ) : savedAt ? (
            <><CheckCircle2 className="h-3 w-3 text-emerald-500" /> saved</>
          ) : (
            <span className="text-muted-foreground">ready</span>
          )}
        </span>
        <Button variant="outline" size="sm" onClick={newDoc}>
          <Plus className="h-4 w-4 mr-1.5" /> New
        </Button>
        <Button variant="outline" size="sm" onClick={() => doc && save(doc)}>
          <Save className="h-4 w-4 mr-1.5" /> Save
        </Button>
        <Button variant="ghost" size="sm" onClick={remove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {(list.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {(list.data ?? []).map((d) => (
            <button
              key={d.slug}
              onClick={() => router.push(`/draw?name=${encodeURIComponent(d.slug)}`)}
              className={`px-2.5 py-1 rounded-md border transition-colors ${
                d.slug === name
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/10 hover:bg-accent"
              }`}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}

      <div className="h-[78vh] rounded-2xl overflow-hidden border border-foreground/10 bg-card">
        <Excalidraw
          key={name}
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

export default function DrawPage() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full rounded-2xl" />}>
      <DrawInner />
    </Suspense>
  );
}
