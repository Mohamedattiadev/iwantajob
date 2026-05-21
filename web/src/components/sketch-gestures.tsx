"use client";

import { useEffect, useState } from "react";
import { Pencil, Eraser, MousePointer2, Hand, Type, Undo2, Redo2 } from "lucide-react";

// Touch gestures layered on top of Excalidraw for iPad use:
//   • 2-finger tap (quick, <500ms, no drift)  → undo
//   • 3-finger tap (quick, <500ms, no drift)  → redo
//   • 3-finger rotation (>15°, all 3 down)    → opens radial tool wheel
//   • 2-finger pinch                          → zoom
// Drift cancels tap detection so rotations don't fire redo. Tap outside
// the wheel dismisses it.
//
// Detection happens on `window` Touch events. We never preventDefault on
// single-touch (so pen drawing stays untouched), only on 2+ touches when
// they look like a gesture rather than a stroke.

type ToolType = "freedraw" | "eraser" | "selection" | "hand" | "text";

export type GestureApi = {
  getApi: () => {
    updateScene: (d: { appState?: Record<string, unknown> }) => void;
    setActiveTool?: (t: { type: string; locked?: boolean }) => void;
    getAppState: () => Record<string, unknown>;
  } | null;
};

export function useSketchGestures({ getApi }: GestureApi) {
  const [toast, setToast] = useState<string | null>(null);
  const [radial, setRadial] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    type T = { id: number; x: number; y: number; startX: number; startY: number; startTime: number };
    const touches = new Map<number, T>();
    let multiStart = 0;        // when 2+ fingers first went down
    let radialBaselineAngle = 0;
    let radialArmedAt = 0;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let suppressTapUntil = 0;  // dragged → cancel tap detection

    const showToast = (msg: string) => {
      setToast(msg);
      setTimeout(() => setToast((t) => (t === msg ? null : t)), 600);
    };
    const undo = () => {
      document.querySelector<HTMLButtonElement>('.excalidraw button[aria-label="Undo"]')?.click();
      showToast("↶ undo");
    };
    const redo = () => {
      document.querySelector<HTMLButtonElement>('.excalidraw button[aria-label="Redo"]')?.click();
      showToast("↷ redo");
    };

    const centroid = (): { x: number; y: number } => {
      let sx = 0, sy = 0, n = 0;
      for (const t of touches.values()) { sx += t.x; sy += t.y; n++; }
      return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
    };
    const avgAngle = (): number => {
      const c = centroid();
      let sum = 0, n = 0;
      for (const t of touches.values()) {
        sum += Math.atan2(t.y - c.y, t.x - c.x);
        n++;
      }
      return n > 0 ? sum / n : 0;
    };
    const pairDistance = (): number => {
      const ts = Array.from(touches.values());
      if (ts.length < 2) return 0;
      const dx = ts[0].x - ts[1].x;
      const dy = ts[0].y - ts[1].y;
      return Math.hypot(dx, dy);
    };
    const maxDrift = (): number => {
      let m = 0;
      for (const t of touches.values()) {
        const d = Math.hypot(t.x - t.startX, t.y - t.startY);
        if (d > m) m = d;
      }
      return m;
    };

    const applyZoom = (newZoom: number) => {
      const api = getApi();
      if (!api) return;
      const z = Math.max(0.1, Math.min(30, newZoom));
      try { api.updateScene({ appState: { zoom: { value: z } } }); } catch {}
    };

    const onStart = (e: TouchEvent) => {
      for (const t of e.changedTouches) {
        touches.set(t.identifier, {
          id: t.identifier,
          x: t.clientX, y: t.clientY,
          startX: t.clientX, startY: t.clientY,
          startTime: performance.now(),
        });
      }
      const n = touches.size;
      if (n >= 2) multiStart = performance.now();
      if (n === 2) {
        pinchStartDist = pairDistance();
        const api = getApi();
        const z = ((api?.getAppState() as { zoom?: { value?: number } })?.zoom?.value) ?? 1;
        pinchStartZoom = z;
      }
      if (n === 3) {
        radialBaselineAngle = avgAngle();
        radialArmedAt = performance.now();
      }
    };

    const onMove = (e: TouchEvent) => {
      for (const t of e.changedTouches) {
        const cur = touches.get(t.identifier);
        if (!cur) continue;
        cur.x = t.clientX;
        cur.y = t.clientY;
      }
      const n = touches.size;
      if (n < 2) return;
      // Any meaningful drift cancels tap detection.
      if (maxDrift() > 18) suppressTapUntil = performance.now() + 1000;

      // 2-finger pinch zoom — only kick in if Excalidraw didn't already
      // handle it (gentle threshold; cumulative ratio).
      if (n === 2 && pinchStartDist > 0) {
        const d = pairDistance();
        const ratio = d / pinchStartDist;
        if (Math.abs(ratio - 1) > 0.05) {
          applyZoom(pinchStartZoom * ratio);
          e.preventDefault();
        }
      }

      // 3-finger rotation → open radial.
      if (n === 3 && performance.now() - radialArmedAt < 1500 && !radial) {
        const cur = avgAngle();
        let delta = cur - radialBaselineAngle;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        if (Math.abs(delta) > 0.25) {
          const c = centroid();
          setRadial({ x: c.x, y: c.y });
          radialArmedAt = 0;
          e.preventDefault();
        }
      }
    };

    const onCancel = () => {
      touches.clear();
      multiStart = 0;
      pinchStartDist = 0;
    };

    // Track peak finger count across the gesture (we replace the simple
    // approximation above with this — much more reliable).
    let peakDuringGesture = 0;
    const refreshPeak = () => { if (touches.size > peakDuringGesture) peakDuringGesture = touches.size; };
    const onStartWrap = (e: TouchEvent) => { onStart(e); refreshPeak(); };
    const onEndWrap = (e: TouchEvent) => {
      const wasPeak = peakDuringGesture;
      // Re-implement tap detection using wasPeak instead of `peak`.
      const ending: T[] = [];
      for (const t of e.changedTouches) {
        const cur = touches.get(t.identifier);
        if (cur) ending.push(cur);
        touches.delete(t.identifier);
      }
      if (touches.size === 0) {
        const isDrift = performance.now() < suppressTapUntil;
        const dt = multiStart > 0 ? performance.now() - multiStart : 9999;
        multiStart = 0;
        peakDuringGesture = 0;
        if (!isDrift && dt < 500 && wasPeak >= 2) {
          if (wasPeak === 2) undo();
          else if (wasPeak === 3) redo();
        }
      }
    };

    window.addEventListener("touchstart", onStartWrap, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEndWrap, { passive: false });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStartWrap);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEndWrap);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [getApi, radial]);

  // Suppress lint warning: the onEnd helper above became dead after the
  // wrap rewrite. Kept inline for clarity in the closure.

  const onPickTool = (t: ToolType) => {
    const api = getApi();
    setRadial(null);
    if (!api) return;
    try { api.setActiveTool?.({ type: t }); } catch {}
  };
  const onRadialUndo = () => { setRadial(null); document.querySelector<HTMLButtonElement>('.excalidraw button[aria-label="Undo"]')?.click(); };
  const onRadialRedo = () => { setRadial(null); document.querySelector<HTMLButtonElement>('.excalidraw button[aria-label="Redo"]')?.click(); };

  const items: { icon: React.ReactNode; label: string; onClick: () => void }[] = [
    { icon: <Pencil size={22} />, label: "Pen", onClick: () => onPickTool("freedraw") },
    { icon: <Eraser size={22} />, label: "Eraser", onClick: () => onPickTool("eraser") },
    { icon: <MousePointer2 size={22} />, label: "Select", onClick: () => onPickTool("selection") },
    { icon: <Hand size={22} />, label: "Pan", onClick: () => onPickTool("hand") },
    { icon: <Type size={22} />, label: "Text", onClick: () => onPickTool("text") },
    { icon: <Undo2 size={22} />, label: "Undo", onClick: onRadialUndo },
    { icon: <Redo2 size={22} />, label: "Redo", onClick: onRadialRedo },
  ];

  return (
    <>
      {toast && <div className="gesture-toast">{toast}</div>}
      {radial && (
        <>
          {/* Full-screen scrim — tap anywhere outside the wheel buttons dismisses. */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 89, background: "rgba(0,0,0,0.25)", backdropFilter: "blur(2px)" }}
            onClick={() => setRadial(null)}
            onTouchStart={(e) => { e.preventDefault(); setRadial(null); }}
          />
          <div
            className="radial-menu"
            style={{ left: radial.x, top: radial.y }}
          >
            <div className="radial-menu-center" />
            {items.map((it, i) => {
              const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
              const r = 110;
              const x = 140 + Math.cos(angle) * r;
              const y = 140 + Math.sin(angle) * r;
              return (
                <button
                  key={it.label}
                  className="radial-menu-item"
                  style={{ left: x, top: y }}
                  title={it.label}
                  onClick={(e) => { e.stopPropagation(); it.onClick(); }}
                >
                  {it.icon}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
