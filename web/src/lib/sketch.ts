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

// Cheap change-detection: live (non-deleted) element count + id of the
// last live element in iteration order. Stable across no-op re-renders;
// changes when a stroke is added or removed.
export function sceneFingerprint(els: readonly unknown[]): string {
  let count = 0;
  let lastId = "";
  for (const raw of els) {
    const e = raw as { id?: string; isDeleted?: boolean } | null;
    if (!e || e.isDeleted) continue;
    count++;
    if (e.id) lastId = e.id;
  }
  return `${count}:${lastId}`;
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
// implementation set `localDrawingUntil` on every pointermove (including
// passive hover events), which permanently suppressed incoming scenes on a
// touch device and broke sync. This helper centralizes the rule: only block
// while the local user is mid-stroke (pointerdown..pointerup) plus a short
// grace window after release so the local broadcast lands first.
export function shouldApplyIncomingScene(
  now: number,
  suppressUntil: number,
): boolean {
  return now >= suppressUntil;
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
