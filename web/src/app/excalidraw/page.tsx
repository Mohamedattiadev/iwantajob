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
const TRANSIENT_KEYS = [
  "collaborators", "selectedElementIds", "hoveredElementIds",
  "draggingElement", "resizingElement", "editingElement",
  "selectionElement", "newElement", "pendingImageElementId",
  "openMenu", "openPopup", "showStats", "errorMessage",
  "contextMenu", "snapLines", "originSnapOffset", "activeEmbeddable",
];

export default function ExcalidrawPage() {
  const [api_, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [miniSvg, setMiniSvg] = useState<string | null>(null);
  const miniTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  // Latest scene snapshot from onChange args. Avoids relying on api_ refs
  // which can be stale across React strict-mode double-mounts.
  const latestRef = useRef<{ elements: unknown[]; appState: Record<string, unknown>; files: unknown }>({
    elements: [], appState: {}, files: null,
  });

  const saved = useQuery(api.sketches.get, { slug: SLUG });
  const saveSketch = useMutation(api.sketches.save);
  const [initialData, setInitialData] = useState<unknown | undefined>(undefined);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Hydrate once when Convex returns (null = no saved scene → start blank).
  useEffect(() => {
    if (initialData !== undefined) return;
    if (saved === undefined) return;
    if (saved === null) {
      setInitialData(null);
      return;
    }
    try {
      const parsed = JSON.parse(saved.data_json) as Record<string, unknown>;
      const appState = { ...((parsed.appState ?? {}) as Record<string, unknown>) };
      for (const k of TRANSIENT_KEYS) delete appState[k];
      appState.collaborators = new Map();
      setInitialData({ ...parsed, appState });
    } catch {
      setInitialData(null);
    }
  }, [saved, initialData]);

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

  // Mark loaded once Excalidraw has applied initialData so the very first
  // onChange (from hydrate) doesn't trigger a redundant save.
  useEffect(() => {
    if (initialData === undefined) return;
    const t = setTimeout(() => { loadedRef.current = true; }, 200);
    return () => clearTimeout(t);
  }, [initialData]);

  const flushSave = useCallback(() => {
    if (!loadedRef.current) return;
    const { elements, appState: rawAppState, files } = latestRef.current;
    if (!elements) return;
    const appState: Record<string, unknown> = { ...rawAppState };
    for (const k of TRANSIENT_KEYS) delete appState[k];
    try {
      const payload = JSON.stringify({ elements, appState, files });
      // Convex caps a single mutation arg at ~1MB. Sketches with many
      // embedded images can easily blow past that; refuse silently-failing
      // saves and tell the user.
      if (payload.length > 900_000) {
        console.error("[excalidraw] payload too large:", payload.length, "bytes");
        setSaveStatus("error");
        return;
      }
      setSaveStatus("saving");
      saveSketch({ slug: SLUG, data: payload })
        .then(() => setSaveStatus("saved"))
        .catch((e) => {
          console.error("[excalidraw] save failed", e);
          setSaveStatus("error");
        });
    } catch (e) {
      console.error("[excalidraw] serialize failed", e);
      setSaveStatus("error");
    }
  }, [saveSketch]);

  // Flush pending save on tab hide / before unload so a reload inside the
  // 400ms debounce doesn't lose the latest stroke.
  useEffect(() => {
    const onHide = () => flushSave();
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flushSave]);

  // Read scene state straight from onChange args instead of api_.getSceneElements()
  // — the imperative API ref can lag a remount in React strict mode, which made
  // saves persist an empty elements array.
  const onChange = useCallback(
    (elements: unknown, appState: unknown, files: unknown) => {
      latestRef.current = {
        elements: Array.isArray(elements) ? (elements as unknown[]) : [],
        appState: (appState ?? {}) as Record<string, unknown>,
        files,
      };
      if (miniTimer.current) clearTimeout(miniTimer.current);
      miniTimer.current = setTimeout(() => { refreshMinimap(); }, 400);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushSave, 400);
    },
    [refreshMinimap, flushSave],
  );

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
        initialData={(initialData ?? null) as never}
        onChange={onChange as never}
        excalidrawAPI={(a) => setApi(a)}
      />
      {saveStatus === "error" && (
        <div className="absolute top-3 right-3 z-10 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400">
          save error · see console
        </div>
      )}
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
