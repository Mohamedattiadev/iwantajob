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
      // Excalidraw 0.18+ wants collaborators as a Map. JSON gave us a plain
      // object — swap before passing as initialData.
      appState.collaborators = new Map();
      // Drop transient runtime fields we may have inadvertently persisted.
      for (const k of ["activeEmbeddable", "draggingElement", "resizingElement", "editingElement",
                       "selectionElement", "newElement", "contextMenu", "snapLines",
                       "selectedElementIds", "hoveredElementIds", "pendingImageElementId"]) {
        delete appState[k];
      }
      setInitialData({ ...parsed, appState });
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

  // Mark loaded once Excalidraw has applied initialData. After this, every
  // onChange event triggers a debounced save. Excalidraw fires onChange
  // synchronously during mount (with the hydrated scene), so without this
  // guard we'd round-trip the saved state for no reason.
  useEffect(() => {
    if (!api_ || initialData === undefined) return;
    const t = setTimeout(() => { loadedRef.current = true; }, 200);
    return () => clearTimeout(t);
  }, [api_, initialData]);

  const flushSave = useCallback(() => {
    if (!api_ || !loadedRef.current) return;
    try {
      const elements = api_.getSceneElements();
      const fullAppState = api_.getAppState() as Record<string, unknown>;
      const appState: Record<string, unknown> = { ...fullAppState };
      for (const k of [
        "collaborators", "selectedElementIds", "hoveredElementIds",
        "draggingElement", "resizingElement", "editingElement",
        "selectionElement", "newElement", "pendingImageElementId",
        "openMenu", "openPopup", "showStats", "errorMessage",
        "contextMenu", "snapLines", "originSnapOffset",
      ]) {
        delete appState[k];
      }
      const files = api_.getFiles();
      const payload = JSON.stringify({ elements, appState, files });
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
  }, [api_, saveSketch]);

  // Flush pending save on tab hide / before unload so the user doesn't lose
  // a sketch by reloading inside the 400ms debounce window.
  useEffect(() => {
    const onHide = () => flushSave();
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flushSave]);

  const onChange = useCallback(() => {
    if (miniTimer.current) clearTimeout(miniTimer.current);
    miniTimer.current = setTimeout(() => { refreshMinimap(); }, 600);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 400);
  }, [refreshMinimap, flushSave]);

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
