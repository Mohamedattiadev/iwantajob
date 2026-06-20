"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false },
);

const SLUG = "main";

export default function ExcalidrawPage() {
  const [api_, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [miniSvg, setMiniSvg] = useState<string | null>(null);
  const miniTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  const saved = useQuery(api.sketches.get, { slug: SLUG });
  const saveSketch = useMutation(api.sketches.save);
  const [initialData, setInitialData] = useState<unknown | undefined>(undefined);

  // Hydrate once when Convex returns (null = no saved scene → start blank).
  useEffect(() => {
    if (initialData !== undefined) return;
    if (saved === undefined) return;
    if (saved === null) {
      setInitialData(null);
      return;
    }
    try {
      setInitialData(JSON.parse(saved.data_json));
    } catch {
      setInitialData(null);
    }
  }, [saved, initialData]);

  const refreshMinimap = useCallback(async () => {
    if (!api_) return;
    const elements = api_.getSceneElements();
    if (!elements.length) { setMiniSvg(null); return; }
    try {
      const mod = await import("@excalidraw/excalidraw");
      const svg = await mod.exportToSvg({
        elements,
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff" } as never,
        files: api_.getFiles(),
      });
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      setMiniSvg(new XMLSerializer().serializeToString(svg));
    } catch {
      /* ignore */
    }
  }, [api_]);

  useEffect(() => { refreshMinimap(); }, [refreshMinimap]);

  // After initial hydration applies, mark loaded so subsequent onChange
  // events trigger save. Without this guard, the first onChange from
  // updateScene would persist an empty/initial state.
  useEffect(() => {
    if (!api_ || initialData === undefined) return;
    if (initialData) {
      const d = initialData as { elements?: unknown[]; appState?: unknown; files?: unknown };
      api_.updateScene({ elements: (d.elements ?? []) as never, appState: (d.appState ?? {}) as never });
      if (d.files) api_.addFiles(Object.values(d.files as Record<string, unknown>) as never);
    }
    const t = setTimeout(() => { loadedRef.current = true; }, 200);
    return () => clearTimeout(t);
  }, [api_, initialData]);

  const onChange = useCallback(() => {
    if (miniTimer.current) clearTimeout(miniTimer.current);
    miniTimer.current = setTimeout(() => { refreshMinimap(); }, 600);
    if (!api_ || !loadedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const elements = api_.getSceneElements();
      const appState = api_.getAppState();
      const files = api_.getFiles();
      const payload = JSON.stringify({ elements, appState, files });
      void saveSketch({ slug: SLUG, data: payload });
    }, 800);
  }, [refreshMinimap, api_, saveSketch]);

  const fitAll = () => {
    if (!api_) return;
    const elements = api_.getSceneElements();
    if (elements.length) api_.scrollToContent(elements, { fitToContent: true });
  };

  // Don't mount Excalidraw until we know whether to hydrate. Avoids the
  // mount-with-empty-scene → save-empty race.
  if (initialData === undefined) {
    return (
      <div className="fixed inset-0 grid place-items-center text-xs text-muted-foreground">
        Loading sketch…
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      <Excalidraw
        onChange={onChange as never}
        excalidrawAPI={(a) => setApi(a)}
      />
      <div className="absolute bottom-3 right-3 z-10 w-44 h-32 rounded-md border bg-white/95 dark:bg-neutral-900/95 shadow-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-2 py-1 border-b text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>minimap</span>
          <button onClick={fitAll} title="Fit all" className="hover:text-foreground">fit</button>
        </div>
        <div className="flex-1 bg-white overflow-hidden flex items-center justify-center">
          {miniSvg ? (
            <div className="w-full h-full p-1" dangerouslySetInnerHTML={{ __html: miniSvg }} />
          ) : (
            <span className="text-[10px] text-muted-foreground italic">empty</span>
          )}
        </div>
      </div>
    </div>
  );
}
