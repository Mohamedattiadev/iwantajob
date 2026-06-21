"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { useMutation, useQuery } from "convex/react";
import { api as convexApi } from "../../../../convex/_generated/api";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false },
);

const TRANSIENT_KEYS = [
  "collaborators", "selectedElementIds", "hoveredElementIds",
  "draggingElement", "resizingElement", "editingElement",
  "selectionElement", "newElement", "pendingImageElementId",
  "openMenu", "openPopup", "showStats", "errorMessage",
  "contextMenu", "snapLines", "originSnapOffset",
];

export default function SketchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const saved = useQuery(convexApi.sketches.get, { slug });
  const saveSketch = useMutation(convexApi.sketches.save);
  const [initial, setInitial] = useState<ExcalidrawInitialDataState | null | undefined>(undefined);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [miniSvg, setMiniSvg] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const miniTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  const latestRef = useRef<{ elements: unknown[]; appState: Record<string, unknown>; files: unknown }>({
    elements: [], appState: {}, files: null,
  });

  useEffect(() => {
    if (initial !== undefined) return;
    if (saved === undefined) return;
    if (saved === null) { setInitial(null); return; }
    try {
      const parsed = JSON.parse(saved.data_json) as ExcalidrawInitialDataState & {
        appState?: Record<string, unknown>;
      };
      if (parsed.appState) {
        const next: Record<string, unknown> = { ...parsed.appState };
        for (const k of TRANSIENT_KEYS) delete next[k];
        next.collaborators = new Map();
        parsed.appState = next;
      }
      setInitial(parsed);
    } catch {
      setInitial(null);
    }
  }, [saved, initial]);

  useEffect(() => {
    if (initial === undefined) return;
    const t = setTimeout(() => { loadedRef.current = true; }, 200);
    return () => clearTimeout(t);
  }, [initial]);

  const refreshMinimap = useCallback(async () => {
    const elements = latestRef.current.elements;
    if (!elements?.length) { setMiniSvg(null); return; }
    try {
      const mod = await import("@excalidraw/excalidraw");
      const svg = await mod.exportToSvg({
        elements: elements as never,
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff" } as never,
        files: latestRef.current.files as never,
      });
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      setMiniSvg(new XMLSerializer().serializeToString(svg));
    } catch {
      /* ignore */
    }
  }, []);

  const flushSave = useCallback(() => {
    if (!loadedRef.current) return;
    const { elements, appState: rawAppState, files } = latestRef.current;
    if (!elements) return;
    const appState: Record<string, unknown> = { ...rawAppState };
    for (const k of TRANSIENT_KEYS) delete appState[k];
    try {
      const payload = JSON.stringify({ elements, appState, files });
      setSaveStatus("saving");
      saveSketch({ slug, data: payload })
        .then(() => setSaveStatus("saved"))
        .catch((e) => {
          console.error("[sketch] save failed", e);
          setSaveStatus("error");
        });
    } catch (e) {
      console.error("[sketch] serialize failed", e);
      setSaveStatus("error");
    }
  }, [slug, saveSketch]);

  useEffect(() => {
    const onHide = () => flushSave();
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flushSave]);

  const onChange = useCallback(
    (elements: unknown, appState: unknown, files: unknown) => {
      latestRef.current = {
        elements: Array.isArray(elements) ? (elements as unknown[]) : [],
        appState: (appState ?? {}) as Record<string, unknown>,
        files,
      };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushSave, 400);
      if (miniTimer.current) clearTimeout(miniTimer.current);
      miniTimer.current = setTimeout(() => { refreshMinimap(); }, 400);
    },
    [flushSave, refreshMinimap],
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
      <div className="absolute top-3 right-3 z-10 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border bg-white/85 dark:bg-neutral-900/85">
        {saveStatus === "saving" ? "saving…"
         : saveStatus === "saved" ? "saved"
         : saveStatus === "error" ? "save error"
         : "idle"}
      </div>
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
