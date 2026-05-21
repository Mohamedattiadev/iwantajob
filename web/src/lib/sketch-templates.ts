// Skeletons fed to Excalidraw's `convertToExcalidrawElements`. Arrows need
// explicit x/y/width/height — the converter only auto-routes when geometry is
// provided alongside `start`/`end` IDs. We compute arrow coords from box
// centers manually so bindings actually attach.

type Skel = Record<string, unknown>;

const PAL = {
  primary: "#7c3aed",
  ink:     "#1e293b",
  cool:    "#0ea5e9",
  warm:    "#f59e0b",
  good:    "#10b981",
  bad:     "#ef4444",
  muted:   "#94a3b8",
};

type Box = { id: string; x: number; y: number; w: number; h: number; label: string; color: string };

function box(b: Box, opts: Partial<Skel> = {}): Skel {
  return {
    id: b.id, type: "rectangle",
    x: b.x, y: b.y, width: b.w, height: b.h,
    strokeColor: b.color, backgroundColor: "transparent",
    fillStyle: "hachure", strokeWidth: 2, roughness: 1, roundness: { type: 3 },
    label: { text: b.label, fontSize: 18, strokeColor: b.color },
    ...opts,
  };
}

function text(id: string, x: number, y: number, str: string, color = PAL.ink, fontSize = 16): Skel {
  return {
    id, type: "text",
    x, y, text: str,
    fontSize, fontFamily: 1,
    strokeColor: color, backgroundColor: "transparent",
    textAlign: "left", verticalAlign: "top",
  };
}

// Arrow from box A → box B. Use shortest path between centers, anchor on
// nearest edge so the rendering doesn't poke into the rectangle.
function arrow(from: Box, to: Box): Skel {
  const ax = from.x + from.w / 2;
  const ay = from.y + from.h / 2;
  const bx = to.x + to.w / 2;
  const by = to.y + to.h / 2;
  const dx = bx - ax;
  const dy = by - ay;
  // Clip endpoint onto destination rectangle edge.
  const tX = dx === 0 ? Infinity : Math.abs((to.w / 2) / dx);
  const tY = dy === 0 ? Infinity : Math.abs((to.h / 2) / dy);
  const t = Math.min(tX, tY);
  const endX = bx - dx * t;
  const endY = by - dy * t;
  // Same for start point (push out of source rect).
  const sX = dx === 0 ? Infinity : Math.abs((from.w / 2) / dx);
  const sY = dy === 0 ? Infinity : Math.abs((from.h / 2) / dy);
  const s = Math.min(sX, sY);
  const startX = ax + dx * s;
  const startY = ay + dy * s;
  return {
    type: "arrow",
    x: startX, y: startY,
    width: endX - startX, height: endY - startY,
    points: [[0, 0], [endX - startX, endY - startY]],
    strokeColor: PAL.muted, strokeWidth: 2, roughness: 1,
    start: { id: from.id }, end: { id: to.id },
    endArrowhead: "arrow",
  };
}

export const TEMPLATES = {
  mindmap: () => {
    const core: Box = { id: "tpl-mm-core", x: 360, y: 240, w: 220, h: 80, label: "Core idea", color: PAL.primary };
    const branches: Box[] = [
      { id: "tpl-mm-1", x:  40, y:  60, w: 200, h: 70, label: "Branch 1", color: PAL.cool },
      { id: "tpl-mm-2", x: 700, y:  60, w: 200, h: 70, label: "Branch 2", color: PAL.good },
      { id: "tpl-mm-3", x:  40, y: 460, w: 200, h: 70, label: "Branch 3", color: PAL.warm },
      { id: "tpl-mm-4", x: 700, y: 460, w: 200, h: 70, label: "Branch 4", color: PAL.bad  },
    ];
    return [box(core), ...branches.map((b) => box(b)), ...branches.map((b) => arrow(core, b))];
  },

  flowchart: () => {
    const boxes: Box[] = [
      { id: "tpl-fc-1", x:  40, y: 120, w: 200, h: 80, label: "Start",  color: PAL.good },
      { id: "tpl-fc-2", x: 300, y: 120, w: 200, h: 80, label: "Step",   color: PAL.cool },
      { id: "tpl-fc-3", x: 560, y: 120, w: 200, h: 80, label: "Decide", color: PAL.warm },
      { id: "tpl-fc-4", x: 820, y: 120, w: 200, h: 80, label: "Done",   color: PAL.primary },
    ];
    const arrows: Skel[] = [];
    for (let i = 0; i < boxes.length - 1; i++) arrows.push(arrow(boxes[i], boxes[i + 1]));
    return [...boxes.map((b) => box(b)), ...arrows];
  },

  kanban: () => {
    const cols = [
      { id: "tpl-kb-todo",  label: "To do",  color: PAL.muted },
      { id: "tpl-kb-doing", label: "Doing",  color: PAL.warm  },
      { id: "tpl-kb-done",  label: "Done",   color: PAL.good  },
    ];
    const els: Skel[] = [];
    cols.forEach((c, i) => {
      const cx = 40 + i * 280;
      // Title sits above column rect — keeps it visible at the top.
      els.push(text(`${c.id}-title`, cx + 12, 14, c.label, c.color, 18));
      els.push(box({ id: c.id, x: cx, y: 44, w: 240, h: 420, label: "", color: c.color }));
      for (let r = 0; r < 2; r++) {
        els.push(box({
          id: `${c.id}-card-${r}`, x: cx + 20, y: 80 + r * 90, w: 200, h: 70,
          label: `Card ${String.fromCharCode(65 + i * 2 + r)}`,
          color: PAL.primary,
        }));
      }
    });
    return els;
  },

  swot: () => {
    const quad: Box[] = [
      { id: "tpl-sw-s", x:  40, y:  40, w: 340, h: 220, label: "Strengths",     color: PAL.good },
      { id: "tpl-sw-w", x: 400, y:  40, w: 340, h: 220, label: "Weaknesses",    color: PAL.bad  },
      { id: "tpl-sw-o", x:  40, y: 280, w: 340, h: 220, label: "Opportunities", color: PAL.cool },
      { id: "tpl-sw-t", x: 400, y: 280, w: 340, h: 220, label: "Threats",       color: PAL.warm },
    ];
    return quad.map((q) => box(q));
  },
};

export type TemplateKey = keyof typeof TEMPLATES;
export const TEMPLATE_META: Record<TemplateKey, { label: string; desc: string }> = {
  mindmap:   { label: "Mind map",  desc: "Central idea + 4 branches" },
  flowchart: { label: "Flowchart", desc: "Start → Step → Decide → Done" },
  kanban:    { label: "Kanban",    desc: "To do / Doing / Done columns" },
  swot:      { label: "SWOT",      desc: "Strengths · Weaknesses · Opportunities · Threats" },
};
