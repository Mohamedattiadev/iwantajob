"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2, PenTool, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

type Entry = {
  slug: string;
  label: string;
  href: string;
  count: number;
  thumb: string | null;
  updated: number;
};

async function buildThumb(elements: unknown[]): Promise<string | null> {
  if (!Array.isArray(elements) || elements.length === 0) return null;
  try {
    const mod = await import("@excalidraw/excalidraw");
    const svg = await mod.exportToSvg({
      elements: elements as never,
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff" } as never,
      files: null,
    });
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return null;
  }
}

function parseSlug(slug: string): { label: string; href: string } {
  if (slug.startsWith("skill:")) {
    const s = slug.slice("skill:".length);
    return { label: `Skill · ${s}`, href: `/learn/${encodeURIComponent(s)}` };
  }
  if (slug === "main") return { label: "Main canvas", href: "/excalidraw" };
  return { label: slug, href: `/sketch/${encodeURIComponent(slug)}` };
}

export default function SketchGalleryPage() {
  const rows = useQuery(api.sketches.list);
  const removeSketch = useMutation(api.sketches.remove);
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    if (rows === undefined) return;
    let cancelled = false;
    (async () => {
      const out: Entry[] = [];
      for (const r of rows) {
        try {
          const data = JSON.parse(r.data_json) as { elements?: unknown[] };
          const elements = data.elements ?? [];
          const thumb = await buildThumb(elements);
          const { label, href } = parseSlug(r.slug);
          out.push({
            slug: r.slug,
            label,
            href,
            count: Array.isArray(elements) ? elements.length : 0,
            thumb,
            updated: r.updated_at,
          });
        } catch {
          /* skip */
        }
      }
      out.sort((a, b) => b.updated - a.updated);
      if (!cancelled) setEntries(out);
    })();
    return () => { cancelled = true; };
  }, [rows]);

  const remove = async (slug: string) => {
    if (!confirm(`Delete sketch "${slug}"? This cannot be undone.`)) return;
    try {
      await removeSketch({ slug });
    } catch (e) {
      console.error("[sketch] delete failed", e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All sketches</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Every drawing across the app, synced to your account.
          </p>
        </div>
        <Link href="/excalidraw">
          <Button size="sm" variant="outline">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Blank canvas
          </Button>
        </Link>
      </div>

      {entries === null ? (
        <p className="text-sm text-muted-foreground italic py-8 text-center">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          <PenTool className="h-6 w-6 mx-auto mb-3 opacity-50" />
          No sketches yet. Open <Link href="/excalidraw" className="underline">/excalidraw</Link> or
          a skill page to start drawing.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((e) => (
            <li key={e.slug} className="group relative rounded-xl border bg-card overflow-hidden hover:border-foreground/30 transition-colors">
              <Link href={e.href} className="block">
                <div className="aspect-[4/3] bg-white dark:bg-neutral-100 overflow-hidden flex items-center justify-center">
                  {e.thumb ? (
                    <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: e.thumb }} />
                  ) : (
                    <PenTool className="h-8 w-8 text-neutral-400" />
                  )}
                </div>
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{e.label}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">{e.count} elements</div>
                  </div>
                </div>
              </Link>
              <button
                onClick={() => remove(e.slug)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 inline-flex items-center justify-center rounded-md border bg-background/90 text-muted-foreground hover:text-rose-500"
                title="Delete sketch"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
