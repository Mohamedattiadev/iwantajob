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

  // System architecture: client → API → service → DB.
  arch3tier: () => {
    const t: Box[] = [
      { id: "tpl-a3-client",  x:  40, y:  60, w: 200, h: 80, label: "Client",      color: PAL.cool },
      { id: "tpl-a3-api",     x: 300, y:  60, w: 200, h: 80, label: "API Gateway", color: PAL.primary },
      { id: "tpl-a3-svc",     x: 560, y:  60, w: 200, h: 80, label: "Service",     color: PAL.warm },
      { id: "tpl-a3-cache",   x: 820, y:  60, w: 200, h: 80, label: "Cache",       color: PAL.muted },
      { id: "tpl-a3-db",      x: 560, y: 220, w: 200, h: 80, label: "Database",    color: PAL.good },
      { id: "tpl-a3-queue",   x: 820, y: 220, w: 200, h: 80, label: "Queue",       color: PAL.bad  },
      { id: "tpl-a3-worker",  x: 820, y: 380, w: 200, h: 80, label: "Worker",      color: PAL.warm },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
      arrow(t[2], t[3]),
      arrow(t[2], t[4]),
      arrow(t[2], t[5]),
      arrow(t[5], t[6]),
    ];
  },

  // C4 system context — User, System (focus), 2 external systems.
  c4context: () => {
    const t: Box[] = [
      { id: "tpl-c4-user", x:  60, y: 200, w: 160, h: 80, label: "User",            color: PAL.ink },
      { id: "tpl-c4-sys",  x: 360, y: 200, w: 240, h: 100, label: "Your System",    color: PAL.primary },
      { id: "tpl-c4-ext1", x: 720, y:  80, w: 200, h: 80, label: "Email Provider",  color: PAL.muted },
      { id: "tpl-c4-ext2", x: 720, y: 320, w: 200, h: 80, label: "Payment API",     color: PAL.muted },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
      arrow(t[1], t[3]),
    ];
  },

  // UML-ish class diagram — 4 boxes with stylized class labels.
  classdiagram: () => {
    const t: Box[] = [
      { id: "tpl-cd-user",   x:  60, y:  60, w: 220, h: 130, label: "User\n— id\n— email\n+ login()", color: PAL.cool },
      { id: "tpl-cd-order",  x: 340, y:  60, w: 220, h: 150, label: "Order\n— id\n— total\n+ cancel()\n+ refund()", color: PAL.primary },
      { id: "tpl-cd-item",   x: 620, y:  60, w: 220, h: 130, label: "OrderItem\n— sku\n— qty\n+ subtotal()", color: PAL.warm },
      { id: "tpl-cd-pay",    x: 340, y: 260, w: 220, h: 130, label: "Payment\n— amount\n— state\n+ capture()", color: PAL.good },
    ];
    return [
      ...t.map((b) => box(b, { roughness: 0, fillStyle: "solid", backgroundColor: "transparent" })),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
      arrow(t[1], t[3]),
    ];
  },

  // Sequence diagram: 3 actors + numbered messages.
  sequence: () => {
    const actors = [
      { id: "tpl-sq-client", x:  80, label: "Client",  color: PAL.cool },
      { id: "tpl-sq-server", x: 360, label: "Server",  color: PAL.primary },
      { id: "tpl-sq-db",     x: 640, label: "DB",      color: PAL.good },
    ];
    const els: Skel[] = [];
    actors.forEach((a) => {
      els.push(box({ id: a.id, x: a.x, y: 40, w: 160, h: 60, label: a.label, color: a.color }));
      // Lifeline (vertical line down).
      els.push({
        type: "line",
        x: a.x + 80, y: 100,
        width: 0, height: 460,
        points: [[0, 0], [0, 460]],
        strokeColor: PAL.muted, strokeWidth: 1.5,
        strokeStyle: "dashed", roughness: 0,
      });
    });
    // Helper for labeled horizontal arrows between actors.
    const msg = (id: string, fromX: number, toX: number, y: number, label: string) => {
      const dx = toX - fromX;
      els.push({
        id, type: "arrow",
        x: fromX, y, width: dx, height: 0,
        points: [[0, 0], [dx, 0]],
        strokeColor: PAL.ink, strokeWidth: 1.6,
        endArrowhead: "arrow", roughness: 0,
      });
      els.push(text(`${id}-l`, fromX + 12, y - 18, label, PAL.ink, 13));
    };
    msg("tpl-sq-m1", 160, 360, 160, "1. request");
    msg("tpl-sq-m2", 440, 640, 220, "2. query");
    msg("tpl-sq-m3", 640, 440, 280, "3. rows");
    msg("tpl-sq-m4", 360,  80, 340, "4. response");
    return els;
  },

  // State machine — 4 states with labeled transitions.
  statemachine: () => {
    const t: Box[] = [
      { id: "tpl-st-idle",    x:  60, y: 200, w: 160, h: 70, label: "idle",     color: PAL.muted },
      { id: "tpl-st-loading", x: 300, y: 200, w: 160, h: 70, label: "loading",  color: PAL.cool },
      { id: "tpl-st-success", x: 540, y:  80, w: 160, h: 70, label: "success",  color: PAL.good },
      { id: "tpl-st-error",   x: 540, y: 320, w: 160, h: 70, label: "error",    color: PAL.bad  },
    ];
    return [
      ...t.map((b) => box(b, { roundness: { type: 2 } })),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
      arrow(t[1], t[3]),
      arrow(t[2], t[0]),
      arrow(t[3], t[0]),
    ];
  },

  // ER diagram — 3 entities with relationships.
  er: () => {
    const t: Box[] = [
      { id: "tpl-er-user",    x:  80, y: 100, w: 200, h: 110, label: "User\n— id (PK)\n— email", color: PAL.cool },
      { id: "tpl-er-order",   x: 380, y: 100, w: 200, h: 110, label: "Order\n— id (PK)\n— user_id (FK)", color: PAL.primary },
      { id: "tpl-er-product", x: 680, y: 100, w: 200, h: 110, label: "Product\n— id (PK)\n— sku", color: PAL.warm },
    ];
    return [
      ...t.map((b) => box(b, { roughness: 0, fillStyle: "solid", backgroundColor: "transparent" })),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
    ];
  },

  // CI/CD pipeline — 6 stages.
  cicd: () => {
    const stages = ["Commit", "Build", "Test", "Stage", "Approve", "Deploy"];
    const colors = [PAL.muted, PAL.cool, PAL.warm, PAL.primary, PAL.warm, PAL.good];
    const t: Box[] = stages.map((s, i) => ({
      id: `tpl-cd-${i}`,
      x: 40 + i * 180, y: 140,
      w: 160, h: 80,
      label: s, color: colors[i],
    }));
    const arrows: Skel[] = [];
    for (let i = 0; i < t.length - 1; i++) arrows.push(arrow(t[i], t[i + 1]));
    return [...t.map((b) => box(b)), ...arrows];
  },
};

export type TemplateKey = keyof typeof TEMPLATES;
export const TEMPLATE_META: Record<TemplateKey, { label: string; desc: string; cat: "general" | "engineering" }> = {
  mindmap:      { label: "Mind map",       desc: "Central idea + 4 branches", cat: "general" },
  flowchart:    { label: "Flowchart",      desc: "Start → Step → Decide → Done", cat: "general" },
  kanban:       { label: "Kanban",         desc: "To do / Doing / Done columns", cat: "general" },
  swot:         { label: "SWOT",           desc: "Strengths · Weaknesses · Opportunities · Threats", cat: "general" },
  arch3tier:    { label: "3-tier arch",    desc: "Client → API → Service → DB", cat: "engineering" },
  c4context:    { label: "C4 context",     desc: "User + system + 2 externals", cat: "engineering" },
  classdiagram: { label: "Class diagram",  desc: "UML-ish classes with fields/methods", cat: "engineering" },
  sequence:     { label: "Sequence",       desc: "Client/Server/DB with messages", cat: "engineering" },
  statemachine: { label: "State machine",  desc: "idle/loading/success/error", cat: "engineering" },
  er:           { label: "ER diagram",     desc: "User/Order/Product with FKs", cat: "engineering" },
  cicd:         { label: "CI/CD pipeline", desc: "Commit → Build → Test → Deploy", cat: "engineering" },
};
