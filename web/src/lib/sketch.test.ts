import { describe, it, expect } from "vitest";
import {
  sceneFingerprint,
  patchFreedrawForPen,
  parseSketchMode,
  shouldApplyIncomingScene,
  pickMinimapCornerStyle,
  PEN_PROFILES,
  PEN_KEYS,
  type PenKey,
} from "./sketch";

describe("sceneFingerprint", () => {
  it("returns 0:'' for empty", () => {
    expect(sceneFingerprint([])).toBe("0:");
  });

  it("counts live elements and reports the last id", () => {
    const els = [
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ];
    expect(sceneFingerprint(els)).toBe("3:c");
  });

  it("skips deleted elements in count and last-id", () => {
    const els = [
      { id: "a" },
      { id: "b", isDeleted: true },
      { id: "c" },
    ];
    expect(sceneFingerprint(els)).toBe("2:c");
  });

  it("treats null entries as deleted", () => {
    expect(sceneFingerprint([null, { id: "x" }, null])).toBe("1:x");
  });

  it("element without id is counted but doesn't set lastId", () => {
    const els = [{ id: "a" }, { /* no id */ }];
    expect(sceneFingerprint(els)).toBe("2:a");
  });

  it("changes when an element is added", () => {
    const before = sceneFingerprint([{ id: "a" }]);
    const after = sceneFingerprint([{ id: "a" }, { id: "b" }]);
    expect(before).not.toBe(after);
  });

  it("changes when the last id changes", () => {
    expect(sceneFingerprint([{ id: "a" }, { id: "b" }]))
      .not.toBe(sceneFingerprint([{ id: "a" }, { id: "c" }]));
  });
});

describe("PEN_PROFILES + PEN_KEYS", () => {
  it("exports all 4 pen keys in fixed order", () => {
    expect(PEN_KEYS).toEqual(["ballpoint", "fountain", "brush", "highlighter"]);
  });

  it("has a profile for every key", () => {
    for (const k of PEN_KEYS) {
      expect(PEN_PROFILES[k]).toBeDefined();
    }
  });

  it("widths are strictly ascending across pen presets", () => {
    const widths = PEN_KEYS.map((k) => PEN_PROFILES[k].width);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    }
  });

  it("ballpoint + highlighter are flat (post-patched simulatePressure=false)", () => {
    expect(PEN_PROFILES.ballpoint.flat).toBe(true);
    expect(PEN_PROFILES.highlighter.flat).toBe(true);
  });

  it("fountain + brush keep native taper (flat=false)", () => {
    expect(PEN_PROFILES.fountain.flat).toBe(false);
    expect(PEN_PROFILES.brush.flat).toBe(false);
  });

  it("highlighter defaults to yellow", () => {
    expect(PEN_PROFILES.highlighter.defaultColor).toBe("#fbbf24");
  });

  it("opacities are within [0,100]", () => {
    for (const k of PEN_KEYS) {
      const o = PEN_PROFILES[k].opacity;
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(100);
    }
  });

  it("highlighter is the most translucent", () => {
    const opacities = PEN_KEYS.map((k) => PEN_PROFILES[k].opacity);
    const min = Math.min(...opacities);
    expect(PEN_PROFILES.highlighter.opacity).toBe(min);
  });
});

describe("patchFreedrawForPen", () => {
  const baseFreedraw = (id: string, n = 5): Record<string, unknown> => ({
    id,
    type: "freedraw",
    points: Array.from({ length: n }, (_, i) => [i, i] as [number, number]),
    simulatePressure: true,
  });

  it("ignores non-freedraw elements", () => {
    const els = [{ id: "r1", type: "rectangle" }];
    const r = patchFreedrawForPen(els, "ballpoint", new Set());
    expect(r.mutated).toBe(false);
    expect(r.newlyPatched).toEqual([]);
    expect(r.elements[0]).toBe(els[0]);
  });

  it("flips simulatePressure off for ballpoint", () => {
    const els = [baseFreedraw("s1")];
    const r = patchFreedrawForPen(els, "ballpoint", new Set());
    expect(r.mutated).toBe(true);
    expect(r.newlyPatched).toEqual(["s1"]);
    expect((r.elements[0] as { simulatePressure: boolean }).simulatePressure).toBe(false);
  });

  it("flips simulatePressure off for highlighter", () => {
    const els = [baseFreedraw("s1")];
    const r = patchFreedrawForPen(els, "highlighter", new Set());
    expect((r.elements[0] as { simulatePressure: boolean }).simulatePressure).toBe(false);
  });

  it("leaves fountain strokes untouched", () => {
    const els = [baseFreedraw("s1")];
    const r = patchFreedrawForPen(els, "fountain", new Set());
    expect(r.mutated).toBe(false);
    // still marks the id so we don't re-evaluate it forever
    expect(r.newlyPatched).toEqual(["s1"]);
    expect(r.elements[0]).toBe(els[0]);
  });

  it("leaves brush strokes untouched", () => {
    const els = [baseFreedraw("s1")];
    const r = patchFreedrawForPen(els, "brush", new Set());
    expect(r.mutated).toBe(false);
    expect(r.elements[0]).toBe(els[0]);
  });

  it("does not re-patch ids already in the set", () => {
    const els = [baseFreedraw("s1")];
    const already = new Set(["s1"]);
    const r = patchFreedrawForPen(els, "ballpoint", already);
    expect(r.mutated).toBe(false);
    expect(r.newlyPatched).toEqual([]);
    expect(r.elements[0]).toBe(els[0]);
  });

  it("skips freedraw elements with fewer than 2 points (in-progress)", () => {
    const els = [{ ...baseFreedraw("s1"), points: [[0, 0]] as Array<[number, number]> }];
    const r = patchFreedrawForPen(els, "ballpoint", new Set());
    expect(r.mutated).toBe(false);
    expect(r.newlyPatched).toEqual([]);
  });

  it("skips freedraw elements with no id", () => {
    const els = [{ type: "freedraw", points: [[0, 0], [1, 1]] as Array<[number, number]> }];
    const r = patchFreedrawForPen(els, "ballpoint", new Set());
    expect(r.mutated).toBe(false);
    expect(r.newlyPatched).toEqual([]);
  });

  it("patches multiple strokes in one pass and reports them all", () => {
    const els = [baseFreedraw("a"), baseFreedraw("b"), baseFreedraw("c")];
    const r = patchFreedrawForPen(els, "ballpoint", new Set());
    expect(r.newlyPatched).toEqual(["a", "b", "c"]);
    expect(r.mutated).toBe(true);
    for (const el of r.elements) {
      expect((el as { simulatePressure: boolean }).simulatePressure).toBe(false);
    }
  });

  it("returns a new array (does not mutate input)", () => {
    const original = baseFreedraw("s1");
    const els = [original];
    const r = patchFreedrawForPen(els, "ballpoint", new Set());
    expect(r.elements).not.toBe(els);
    expect(original.simulatePressure).toBe(true); // input untouched
  });

  it("every PenKey produces a defined profile when invoked", () => {
    const ids: Record<PenKey, string> = {
      ballpoint: "p1", fountain: "p2", brush: "p3", highlighter: "p4",
    };
    for (const k of PEN_KEYS) {
      const r = patchFreedrawForPen([baseFreedraw(ids[k])], k, new Set());
      expect(r.newlyPatched).toEqual([ids[k]]);
    }
  });
});

describe("parseSketchMode", () => {
  it("editMode is true when mode=edit", () => {
    expect(parseSketchMode(new URLSearchParams("mode=edit")).editMode).toBe(true);
  });
  it("editMode false otherwise", () => {
    expect(parseSketchMode(new URLSearchParams("")).editMode).toBe(false);
    expect(parseSketchMode(new URLSearchParams("mode=view")).editMode).toBe(false);
  });
  it("penMode true only when pen=1", () => {
    expect(parseSketchMode(new URLSearchParams("pen=1")).penMode).toBe(true);
    expect(parseSketchMode(new URLSearchParams("pen=0")).penMode).toBe(false);
    expect(parseSketchMode(new URLSearchParams("")).penMode).toBe(false);
  });
  it("flags compose independently", () => {
    const m = parseSketchMode(new URLSearchParams("mode=edit&pen=1"));
    expect(m).toEqual({ editMode: true, penMode: true });
  });
});

describe("shouldApplyIncomingScene", () => {
  it("applies when now is past suppressUntil", () => {
    expect(shouldApplyIncomingScene(1000, 500)).toBe(true);
  });
  it("blocks while now is before suppressUntil", () => {
    expect(shouldApplyIncomingScene(500, 1000)).toBe(false);
  });
  it("applies at the boundary (now === suppressUntil)", () => {
    expect(shouldApplyIncomingScene(1000, 1000)).toBe(true);
  });
  it("default zero-window never blocks", () => {
    expect(shouldApplyIncomingScene(Date.now(), 0)).toBe(true);
  });
});

describe("pickMinimapCornerStyle", () => {
  it("defaults to bottom-right", () => {
    expect(pickMinimapCornerStyle()).toEqual({ bottom: 12, right: 12 });
  });
  it("br → bottom + right", () => {
    expect(pickMinimapCornerStyle("br")).toEqual({ bottom: 12, right: 12 });
  });
  it("bl → bottom + left", () => {
    expect(pickMinimapCornerStyle("bl")).toEqual({ bottom: 12, left: 12 });
  });
  it("tr → top + right (tablet uses this)", () => {
    expect(pickMinimapCornerStyle("tr")).toEqual({ top: 12, right: 12 });
  });
  it("tl → top + left", () => {
    expect(pickMinimapCornerStyle("tl")).toEqual({ top: 12, left: 12 });
  });
  it("each corner only sets its two axes (never both top+bottom or left+right)", () => {
    for (const c of ["tl", "tr", "bl", "br"] as const) {
      const s = pickMinimapCornerStyle(c);
      const hasTop = "top" in s, hasBottom = "bottom" in s;
      const hasLeft = "left" in s, hasRight = "right" in s;
      expect(hasTop && hasBottom).toBe(false);
      expect(hasLeft && hasRight).toBe(false);
    }
  });
});
