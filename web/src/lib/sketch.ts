// Pure helpers for the shared sketch route. Extracted so they can be
// unit-tested without dragging Excalidraw / Next.js into the test harness.

export type PenKey = "ballpoint" | "fountain" | "brush" | "highlighter";

export type PenProfile = {
  width: number;
  opacity: number;
  roughness: 0 | 1 | 2;
  defaultColor?: string;
  // When true, post-process the finished freedraw stroke to set
  // `simulatePressure: false` so perfect-freehand renders a flat constant
  // width (ballpoint, highlighter). When false, leave the element alone so
  // the native velocity/Apple-Pencil-pressure taper is preserved.
  flat: boolean;
};

export const PEN_PROFILES: Record<PenKey, PenProfile> = {
  ballpoint:   { width: 1.5, opacity: 100, roughness: 0, flat: true },
  fountain:    { width: 4,   opacity: 100, roughness: 0, flat: false },
  brush:       { width: 12,  opacity: 80,  roughness: 0, flat: false },
  highlighter: { width: 28,  opacity: 28,  roughness: 0, defaultColor: "#fbbf24", flat: true },
};

export const PEN_KEYS: readonly PenKey[] = ["ballpoint", "fountain", "brush", "highlighter"];

// Cheap change-detection: live (non-deleted) element count + an
// order-independent xor-sum of cheap id hashes. Stable across no-op
// re-renders and across `updateScene` paths that reorder elements (iOS
// Excalidraw does this), so echo suppression doesn't false-positive
// when a remote scene is applied and re-emitted by `onChange` with a
// different element order. Bumping format → callers comparing strings
// continue to work; just both sides must use this same function.
function cheapStringHash(s: string): number {
  // djb2 trimmed to 32-bit.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
export function sceneFingerprint(els: readonly unknown[]): string {
  let count = 0;
  let xor = 0;
  for (const raw of els) {
    const e = raw as { id?: string; isDeleted?: boolean } | null;
    if (!e || e.isDeleted) continue;
    count++;
    if (e.id) xor = (xor ^ cheapStringHash(e.id)) >>> 0;
  }
  return `${count}:${xor.toString(36)}`;
}

// Iterate scene elements and patch the freedraw ones that haven't been
// patched yet according to the current pen's profile. Returns the new
// element array plus the ids that were newly patched (caller adds them to
// its persistent "already-patched" set). `mutated` lets the caller skip
// pushing a no-op updateScene back into Excalidraw.
export type PatchResult = {
  elements: ReadonlyArray<Record<string, unknown>>;
  newlyPatched: string[];
  mutated: boolean;
};

export function patchFreedrawForPen(
  els: ReadonlyArray<Record<string, unknown>>,
  pen: PenKey,
  alreadyPatched: ReadonlySet<string>,
): PatchResult {
  const newlyPatched: string[] = [];
  let mutated = false;
  const profile = PEN_PROFILES[pen];
  const elements = els.map((el) => {
    if (el.type !== "freedraw") return el;
    const id = el.id as string | undefined;
    if (!id || alreadyPatched.has(id)) return el;
    const pts = el.points as Array<[number, number]> | undefined;
    if (!pts || pts.length < 2) return el;
    newlyPatched.push(id);
    if (profile.flat) {
      mutated = true;
      return { ...el, simulatePressure: false };
    }
    return el;
  });
  return { elements, newlyPatched, mutated };
}

// URL param helpers — kept here so the page component is a thinner shell.
export function parseSketchMode(search: URLSearchParams): { editMode: boolean; penMode: boolean } {
  return { editMode: search.get("mode") === "edit", penMode: search.get("pen") === "1" };
}

// Decide whether an incoming realtime scene should be applied. The earlier
// implementation tied this to pointer events, which broke sync on touch
// devices (pointermove fired constantly, sometimes pointerup never landed
// after a Pencil lift → gate permanently closed). New rule: skip only if
// the LOCAL onChange fired within the last `windowMs` — meaning we just
// produced an edit and don't want a possibly-stale incoming scene to
// clobber it. `lastLocalEditAt = 0` means we never edited locally yet, so
// we always apply incoming.
export function shouldApplyIncomingScene(
  now: number,
  lastLocalEditAt: number,
  windowMs: number = 100,
): boolean {
  if (lastLocalEditAt === 0) return true;
  return now - lastLocalEditAt >= windowMs;
}

// Minimap corner placement — pure helper so the corner CSS is testable
// without rendering React. Returned object is meant to be spread into a
// `style` object alongside `position: "absolute"`.
export type MinimapCorner = "tl" | "tr" | "bl" | "br";
export function pickMinimapCornerStyle(corner: MinimapCorner = "br"): {
  top?: number; right?: number; bottom?: number; left?: number;
} {
  switch (corner) {
    case "tl": return { top: 12, left: 12 };
    case "tr": return { top: 12, right: 12 };
    case "bl": return { bottom: 12, left: 12 };
    case "br":
    default:   return { bottom: 12, right: 12 };
  }
}

// "Fit all" — compute the Excalidraw appState that centers the whole
// scene in the current viewport with a uniform padding. Returns null if
// the scene has no usable elements (empty / all deleted / no geometry).
// Excalidraw screen-coord formula: screen_x = (world_x + scrollX) * zoom.
type GeomEl = {
  x?: number; y?: number; width?: number; height?: number; isDeleted?: boolean;
};
export function computeFitAllAppState(
  elements: ReadonlyArray<GeomEl | null>,
  viewport: { width: number; height: number },
  padding: number = 60,
  maxZoom: number = 2,
): { zoom: number; scrollX: number; scrollY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of elements) {
    if (!e || e.isDeleted) continue;
    if (typeof e.x !== "number" || typeof e.y !== "number") continue;
    const w = typeof e.width === "number" ? e.width : 1;
    const h = typeof e.height === "number" ? e.height : 1;
    minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + w); maxY = Math.max(maxY, e.y + h);
  }
  if (!isFinite(minX)) return null;
  const sceneW = Math.max(1, maxX - minX);
  const sceneH = Math.max(1, maxY - minY);
  const vw = viewport.width || 1;
  const vh = viewport.height || 1;
  const zoom = Math.max(
    0.1,
    Math.min(maxZoom, (vw - 2 * padding) / sceneW, (vh - 2 * padding) / sceneH),
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    zoom,
    scrollX: vw / (2 * zoom) - cx,
    scrollY: vh / (2 * zoom) - cy,
  };
}
