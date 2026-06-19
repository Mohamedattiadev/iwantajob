"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false },
);

export default function SketchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const storageKey = `sketch:${slug}`;
  const [initial, setInitial] = useState<ExcalidrawInitialDataState | null | undefined>(undefined);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [miniSvg, setMiniSvg] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const miniTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) { setInitial(null); return; }
      const parsed = JSON.parse(raw) as ExcalidrawInitialDataState & { appState?: Record<string, unknown> };
      if (parsed.appState) {
        const next: Record<string, unknown> = { ...parsed.appState };
        delete next.collaborators;
        parsed.appState = next;
      }
      setInitial(parsed);
    } catch {
      setInitial(null);
    }
  }, [storageKey]);

  const refreshMinimap = useCallback(async () => {
    if (!api) return;
    const elements = api.getSceneElements();
    if (!elements.length) { setMiniSvg(null); return; }
    try {
      const mod = await import("@excalidraw/excalidraw");
      const svg = await mod.exportToSvg({
        elements,
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff" } as never,
        files: api.getFiles(),
      });
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      setMiniSvg(new XMLSerializer().serializeToString(svg));
    } catch {
      /* ignore */
    }
  }, [api]);

  useEffect(() => { refreshMinimap(); }, [refreshMinimap]);

  const onChange = useCallback(
    (elements: unknown, appState: unknown, files: unknown) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ elements, appState, files }));
        } catch {
          /* quota */
        }
      }, 500);
      if (miniTimer.current) clearTimeout(miniTimer.current);
      miniTimer.current = setTimeout(() => { refreshMinimap(); }, 600);
    },
    [storageKey, refreshMinimap],
  );

  const fitAll = () => {
    if (!api) return;
    const elements = api.getSceneElements();
    if (elements.length) api.scrollToContent(elements, { fitToContent: true });
  };

  if (initial === undefined) return null;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <Excalidraw
        initialData={initial}
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
