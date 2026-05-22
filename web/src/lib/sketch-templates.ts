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

  // Microservices — gateway + 3 services + shared DB cluster.
  microservices: () => {
    const t: Box[] = [
      { id: "tpl-ms-gw",   x:  40, y: 200, w: 180, h: 80, label: "API Gateway", color: PAL.primary },
      { id: "tpl-ms-auth", x: 280, y:  60, w: 180, h: 80, label: "Auth svc",    color: PAL.cool },
      { id: "tpl-ms-orders", x: 280, y: 200, w: 180, h: 80, label: "Orders svc", color: PAL.warm },
      { id: "tpl-ms-pay",  x: 280, y: 340, w: 180, h: 80, label: "Payments svc", color: PAL.good },
      { id: "tpl-ms-db",   x: 520, y: 200, w: 180, h: 80, label: "Postgres",     color: PAL.muted },
      { id: "tpl-ms-cache", x: 520, y:  60, w: 180, h: 80, label: "Redis",       color: PAL.bad },
      { id: "tpl-ms-mq",   x: 520, y: 340, w: 180, h: 80, label: "Kafka",        color: PAL.ink },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[0], t[1]),
      arrow(t[0], t[2]),
      arrow(t[0], t[3]),
      arrow(t[1], t[5]),
      arrow(t[2], t[4]),
      arrow(t[3], t[4]),
      arrow(t[3], t[6]),
    ];
  },

  // Data-flow diagram (DFD level-1).
  dfd: () => {
    const t: Box[] = [
      { id: "tpl-df-user", x:  60, y: 200, w: 160, h: 80, label: "External: User", color: PAL.ink },
      { id: "tpl-df-1",    x: 300, y:  80, w: 200, h: 80, label: "1.0 Validate",   color: PAL.cool },
      { id: "tpl-df-2",    x: 300, y: 220, w: 200, h: 80, label: "2.0 Process",    color: PAL.primary },
      { id: "tpl-df-3",    x: 300, y: 360, w: 200, h: 80, label: "3.0 Persist",    color: PAL.good },
      { id: "tpl-df-ds",   x: 580, y: 220, w: 180, h: 80, label: "[DS] Database",  color: PAL.muted },
    ];
    return [
      ...t.map((b) => box(b, { roundness: { type: 2 } })),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
      arrow(t[2], t[3]),
      arrow(t[3], t[4]),
      arrow(t[4], t[2]),
    ];
  },

  // OAuth 2.0 authorization-code flow.
  oauth: () => {
    const t: Box[] = [
      { id: "tpl-oa-app", x:  40, y:  60, w: 180, h: 70, label: "App",         color: PAL.cool },
      { id: "tpl-oa-az",  x: 280, y:  60, w: 180, h: 70, label: "Auth Server", color: PAL.primary },
      { id: "tpl-oa-rs",  x: 280, y: 220, w: 180, h: 70, label: "Resource Server", color: PAL.warm },
      { id: "tpl-oa-user", x:  40, y: 220, w: 180, h: 70, label: "User",       color: PAL.ink },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[0], t[3]),
      arrow(t[3], t[1]),
      arrow(t[1], t[0]),
      arrow(t[0], t[2]),
    ];
  },

  // REST endpoints map — base + verbs + resources.
  rest: () => {
    const els: Skel[] = [];
    els.push(text("tpl-rt-base", 40, 30, "GET POST PUT DELETE", PAL.muted, 14));
    const items = [
      "GET    /users",
      "POST   /users",
      "GET    /users/:id",
      "PUT    /users/:id",
      "DELETE /users/:id",
      "GET    /orders",
      "POST   /orders",
      "GET    /orders/:id",
    ];
    items.forEach((line, i) => {
      els.push(text(`tpl-rt-${i}`, 40, 80 + i * 36, line, PAL.ink, 16));
    });
    return els;
  },

  // Threat model — STRIDE quadrants.
  stride: () => {
    const t: Box[] = [
      { id: "tpl-st-s", x:  40, y:  40, w: 260, h: 130, label: "Spoofing\n(identity)",      color: PAL.bad },
      { id: "tpl-st-t", x: 320, y:  40, w: 260, h: 130, label: "Tampering\n(integrity)",    color: PAL.warm },
      { id: "tpl-st-r", x: 600, y:  40, w: 260, h: 130, label: "Repudiation\n(non-repud.)", color: PAL.muted },
      { id: "tpl-st-i", x:  40, y: 190, w: 260, h: 130, label: "Info disclosure\n(confidentiality)", color: PAL.cool },
      { id: "tpl-st-d", x: 320, y: 190, w: 260, h: 130, label: "Denial of service\n(availability)",  color: PAL.warm },
      { id: "tpl-st-e", x: 600, y: 190, w: 260, h: 130, label: "Elevation\n(authorization)",         color: PAL.bad },
    ];
    return t.map((b) => box(b));
  },

  // Retro 4Ls — Liked / Learned / Lacked / Longed for.
  retro4ls: () => {
    const t: Box[] = [
      { id: "tpl-4l-1", x:  40, y:  40, w: 340, h: 220, label: "Liked",      color: PAL.good },
      { id: "tpl-4l-2", x: 400, y:  40, w: 340, h: 220, label: "Learned",    color: PAL.cool },
      { id: "tpl-4l-3", x:  40, y: 280, w: 340, h: 220, label: "Lacked",     color: PAL.warm },
      { id: "tpl-4l-4", x: 400, y: 280, w: 340, h: 220, label: "Longed for", color: PAL.primary },
    ];
    return t.map((q) => box(q));
  },

  // Git-flow — main / develop / feature / release / hotfix branches.
  gitflow: () => {
    const t: Box[] = [
      { id: "tpl-gf-feat", x:  40, y:  40, w: 160, h: 60, label: "feature/*", color: PAL.cool },
      { id: "tpl-gf-dev",  x: 240, y:  40, w: 160, h: 60, label: "develop",   color: PAL.warm },
      { id: "tpl-gf-rel",  x: 440, y:  40, w: 160, h: 60, label: "release/*", color: PAL.primary },
      { id: "tpl-gf-main", x: 640, y:  40, w: 160, h: 60, label: "main",      color: PAL.good },
      { id: "tpl-gf-hot",  x: 440, y: 160, w: 160, h: 60, label: "hotfix/*",  color: PAL.bad },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
      arrow(t[2], t[3]),
      arrow(t[3], t[4]),
      arrow(t[4], t[3]),
    ];
  },

  // Component design — MVVM layout.
  mvvm: () => {
    const t: Box[] = [
      { id: "tpl-mv-view",  x:  60, y:  60, w: 220, h: 100, label: "View",       color: PAL.cool },
      { id: "tpl-mv-vm",    x: 340, y:  60, w: 220, h: 100, label: "ViewModel",  color: PAL.primary },
      { id: "tpl-mv-model", x: 620, y:  60, w: 220, h: 100, label: "Model",      color: PAL.warm },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[0], t[1]),
      arrow(t[1], t[0]),
      arrow(t[1], t[2]),
      arrow(t[2], t[1]),
    ];
  },

  // Deployment topology — multi-AZ.
  deployment: () => {
    const t: Box[] = [
      { id: "tpl-dp-lb",   x: 320, y:  40, w: 200, h: 70, label: "Load Balancer", color: PAL.primary },
      { id: "tpl-dp-az1",  x:  60, y: 180, w: 320, h: 220, label: "AZ-1\n— app-1\n— app-2",  color: PAL.cool },
      { id: "tpl-dp-az2",  x: 460, y: 180, w: 320, h: 220, label: "AZ-2\n— app-1\n— app-2",  color: PAL.warm },
      { id: "tpl-dp-db",   x: 320, y: 440, w: 200, h: 70, label: "Primary DB",  color: PAL.good },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[0], t[1]),
      arrow(t[0], t[2]),
      arrow(t[1], t[3]),
      arrow(t[2], t[3]),
    ];
  },

  // Agile sprint board — backlog / sprint / in progress / review / done.
  sprint: () => {
    const cols = [
      { id: "tpl-sp-b",  label: "Backlog",     color: PAL.muted },
      { id: "tpl-sp-s",  label: "Sprint",      color: PAL.cool },
      { id: "tpl-sp-ip", label: "In progress", color: PAL.warm },
      { id: "tpl-sp-r",  label: "Review",      color: PAL.primary },
      { id: "tpl-sp-d",  label: "Done",        color: PAL.good },
    ];
    const els: Skel[] = [];
    cols.forEach((c, i) => {
      const cx = 30 + i * 180;
      els.push(text(`${c.id}-title`, cx + 8, 12, c.label, c.color, 16));
      els.push(box({ id: c.id, x: cx, y: 40, w: 160, h: 400, label: "", color: c.color }));
    });
    return els;
  },

  // ─── Math ────────────────────────────────────────────────────────────────
  // Coordinate grid — axes + quadrants + origin.
  mathgrid: () => {
    const els: Skel[] = [];
    const ox = 400, oy = 260, span = 200;
    // X axis
    els.push({
      type: "arrow", x: ox - span, y: oy, width: span * 2, height: 0,
      points: [[0, 0], [span * 2, 0]], strokeColor: PAL.ink, strokeWidth: 2,
      endArrowhead: "arrow", roughness: 0,
    });
    // Y axis (drawn upward; height negative not allowed → start at bottom)
    els.push({
      type: "arrow", x: ox, y: oy + span, width: 0, height: -span * 2,
      points: [[0, 0], [0, -span * 2]], strokeColor: PAL.ink, strokeWidth: 2,
      endArrowhead: "arrow", roughness: 0,
    });
    // Grid lines
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const off = i * 50;
      els.push({ type: "line", x: ox + off, y: oy - span, width: 0, height: span * 2, points: [[0, 0], [0, span * 2]], strokeColor: PAL.muted, strokeWidth: 1, strokeStyle: "dashed", roughness: 0 });
      els.push({ type: "line", x: ox - span, y: oy + off, width: span * 2, height: 0, points: [[0, 0], [span * 2, 0]], strokeColor: PAL.muted, strokeWidth: 1, strokeStyle: "dashed", roughness: 0 });
    }
    els.push(text("tpl-mg-x", ox + span + 8, oy - 8, "x", PAL.ink, 16));
    els.push(text("tpl-mg-y", ox + 8, oy - span - 24, "y", PAL.ink, 16));
    els.push(text("tpl-mg-o", ox - 18, oy + 4, "O", PAL.ink, 14));
    els.push(text("tpl-mg-q1", ox + 90, oy - 120, "Q I", PAL.cool, 14));
    els.push(text("tpl-mg-q2", ox - 130, oy - 120, "Q II", PAL.warm, 14));
    els.push(text("tpl-mg-q3", ox - 130, oy + 100, "Q III", PAL.bad, 14));
    els.push(text("tpl-mg-q4", ox + 90, oy + 100, "Q IV", PAL.good, 14));
    return els;
  },

  // Function plot — axes + linear function line + sample points.
  mathplot: () => {
    const els: Skel[] = [];
    const ox = 360, oy = 320, w = 480, h = 280;
    els.push({ type: "arrow", x: ox, y: oy, width: w, height: 0, points: [[0, 0], [w, 0]], strokeColor: PAL.ink, strokeWidth: 2, endArrowhead: "arrow", roughness: 0 });
    els.push({ type: "arrow", x: ox, y: oy, width: 0, height: -h, points: [[0, 0], [0, -h]], strokeColor: PAL.ink, strokeWidth: 2, endArrowhead: "arrow", roughness: 0 });
    // Curve y = x as a line.
    els.push({
      type: "line", x: ox, y: oy,
      width: w - 20, height: -(h - 20),
      points: [[0, 0], [w - 20, -(h - 20)]],
      strokeColor: PAL.primary, strokeWidth: 2.5, roughness: 1,
    });
    els.push(text("tpl-mp-title", ox + 20, oy - h - 32, "f(x) = x", PAL.primary, 18));
    els.push(text("tpl-mp-x", ox + w + 6, oy - 8, "x", PAL.ink, 16));
    els.push(text("tpl-mp-y", ox + 6, oy - h - 22, "y", PAL.ink, 16));
    return els;
  },

  // Geometry proof — right triangle + labels.
  mathproof: () => {
    const els: Skel[] = [];
    // Triangle as 3 lines.
    const ax = 120, ay = 420, bx = 460, cy = 120;
    els.push({ type: "line", x: ax, y: ay, width: bx - ax, height: 0, points: [[0, 0], [bx - ax, 0]], strokeColor: PAL.ink, strokeWidth: 2, roughness: 1 });
    els.push({ type: "line", x: ax, y: ay, width: 0, height: cy - ay, points: [[0, 0], [0, cy - ay]], strokeColor: PAL.ink, strokeWidth: 2, roughness: 1 });
    els.push({ type: "line", x: bx, y: ay, width: ax - bx, height: cy - ay, points: [[0, 0], [ax - bx, cy - ay]], strokeColor: PAL.primary, strokeWidth: 2.5, roughness: 1 });
    // Right-angle marker.
    els.push({ type: "rectangle", x: ax, y: ay - 24, width: 24, height: 24, strokeColor: PAL.bad, backgroundColor: "transparent", fillStyle: "hachure", strokeWidth: 1.5, roughness: 0, roundness: null });
    els.push(text("tpl-pf-a", ax - 18, ay + 6, "A", PAL.ink, 16));
    els.push(text("tpl-pf-b", bx + 6, ay + 6, "B", PAL.ink, 16));
    els.push(text("tpl-pf-c", ax - 18, cy - 8, "C", PAL.ink, 16));
    els.push(text("tpl-pf-eq", 220, 60, "a² + b² = c²", PAL.primary, 22));
    return els;
  },

  // Fraction bars — 1/2, 1/3, 1/4, 1/6.
  mathfrac: () => {
    const els: Skel[] = [];
    const rows = [
      { id: "tpl-fr-2", n: 2, label: "1/2" },
      { id: "tpl-fr-3", n: 3, label: "1/3" },
      { id: "tpl-fr-4", n: 4, label: "1/4" },
      { id: "tpl-fr-6", n: 6, label: "1/6" },
    ];
    const x0 = 120, w = 480, h = 60, gap = 24;
    rows.forEach((r, idx) => {
      const y = 60 + idx * (h + gap);
      const partW = w / r.n;
      for (let i = 0; i < r.n; i++) {
        els.push({
          type: "rectangle", id: `${r.id}-p${i}`,
          x: x0 + i * partW, y, width: partW, height: h,
          strokeColor: PAL.ink, backgroundColor: i === 0 ? PAL.cool : "transparent",
          fillStyle: "hachure", strokeWidth: 2, roughness: 1, roundness: null,
        });
      }
      els.push(text(`${r.id}-lbl`, x0 - 60, y + 18, r.label, PAL.ink, 18));
    });
    return els;
  },

  // ─── DevOps ──────────────────────────────────────────────────────────────
  // Kubernetes cluster — control plane + worker nodes.
  k8s: () => {
    const t: Box[] = [
      { id: "tpl-k8-cp",  x:  40, y:  40, w: 220, h: 100, label: "Control plane\n— api-server\n— scheduler\n— etcd", color: PAL.primary },
      { id: "tpl-k8-n1",  x: 320, y:  40, w: 220, h: 140, label: "Node 1\n— kubelet\n— pod: web\n— pod: web", color: PAL.cool },
      { id: "tpl-k8-n2",  x: 600, y:  40, w: 220, h: 140, label: "Node 2\n— kubelet\n— pod: api\n— pod: api", color: PAL.warm },
      { id: "tpl-k8-n3",  x: 320, y: 240, w: 220, h: 140, label: "Node 3\n— kubelet\n— pod: worker\n— pod: cache", color: PAL.good },
      { id: "tpl-k8-ing", x: 600, y: 240, w: 220, h: 100, label: "Ingress\n— TLS / routes", color: PAL.bad },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[0], t[1]),
      arrow(t[0], t[2]),
      arrow(t[0], t[3]),
      arrow(t[4], t[1]),
      arrow(t[4], t[2]),
    ];
  },

  // Docker stack — host + containers + volume + network.
  docker: () => {
    const host: Box = { id: "tpl-dk-host", x: 40, y: 40, w: 800, h: 360, label: "Docker host", color: PAL.muted };
    const t: Box[] = [
      { id: "tpl-dk-c1",  x:  80, y: 100, w: 200, h: 90, label: "web\n:80",        color: PAL.cool },
      { id: "tpl-dk-c2",  x: 320, y: 100, w: 200, h: 90, label: "api\n:3000",      color: PAL.primary },
      { id: "tpl-dk-c3",  x: 560, y: 100, w: 200, h: 90, label: "db\npostgres:15", color: PAL.warm },
      { id: "tpl-dk-vol", x:  80, y: 240, w: 200, h: 80, label: "volume\npgdata",  color: PAL.good },
      { id: "tpl-dk-net", x: 320, y: 240, w: 440, h: 80, label: "network: app-net (bridge)", color: PAL.bad },
    ];
    return [
      box(host, { roughness: 0, fillStyle: "solid", backgroundColor: "transparent" }),
      ...t.map((b) => box(b)),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
      arrow(t[2], t[3]),
    ];
  },

  // Container registry flow — dev → build → push → registry → pull → cluster.
  registry: () => {
    const stages = ["Dev", "Build", "Push", "Registry", "Pull", "Cluster"];
    const colors = [PAL.muted, PAL.cool, PAL.warm, PAL.primary, PAL.warm, PAL.good];
    const t: Box[] = stages.map((s, i) => ({
      id: `tpl-rg-${i}`, x: 40 + i * 170, y: 160, w: 150, h: 80,
      label: s, color: colors[i],
    }));
    const arrows: Skel[] = [];
    for (let i = 0; i < t.length - 1; i++) arrows.push(arrow(t[i], t[i + 1]));
    return [...t.map((b) => box(b)), ...arrows];
  },

  // Monitoring stack — app → metrics → Prom → Grafana / Alertmgr → pager.
  monitor: () => {
    const t: Box[] = [
      { id: "tpl-mn-app",   x:  40, y: 180, w: 180, h: 80, label: "App\n— /metrics",   color: PAL.cool },
      { id: "tpl-mn-prom",  x: 280, y: 180, w: 180, h: 80, label: "Prometheus",        color: PAL.primary },
      { id: "tpl-mn-graf",  x: 520, y:  60, w: 180, h: 80, label: "Grafana",           color: PAL.good },
      { id: "tpl-mn-alert", x: 520, y: 180, w: 180, h: 80, label: "Alertmanager",      color: PAL.warm },
      { id: "tpl-mn-page",  x: 760, y: 180, w: 180, h: 80, label: "PagerDuty",         color: PAL.bad },
      { id: "tpl-mn-loki",  x: 280, y: 320, w: 180, h: 80, label: "Loki (logs)",       color: PAL.muted },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
      arrow(t[1], t[3]),
      arrow(t[3], t[4]),
      arrow(t[0], t[5]),
    ];
  },

  // ─── Web UI ──────────────────────────────────────────────────────────────
  // Wireframe page — header, nav, hero, cards, footer.
  wireframe: () => {
    const els: Skel[] = [];
    els.push(box({ id: "tpl-wf-header", x: 40, y:  20, w: 880, h:  60, label: "Header  ·  logo  ·  search  ·  user", color: PAL.ink }));
    els.push(box({ id: "tpl-wf-nav",    x: 40, y:  90, w: 200, h: 480, label: "Nav\n— Home\n— Docs\n— Pricing\n— About", color: PAL.muted }));
    els.push(box({ id: "tpl-wf-hero",   x: 260, y:  90, w: 660, h: 160, label: "Hero · headline · CTA", color: PAL.primary }));
    for (let i = 0; i < 3; i++) {
      els.push(box({ id: `tpl-wf-card-${i}`, x: 260 + i * 220, y: 270, w: 200, h: 220, label: `Card ${i + 1}`, color: PAL.cool }));
    }
    els.push(box({ id: "tpl-wf-footer", x: 40, y: 590, w: 880, h:  50, label: "Footer  ·  © · links", color: PAL.muted }));
    return els;
  },

  // Form layout — title, fields, submit.
  form: () => {
    const els: Skel[] = [];
    els.push(text("tpl-fm-title", 60, 30, "Sign up", PAL.primary, 22));
    const labels = ["Name", "Email", "Password", "Confirm password"];
    labels.forEach((l, i) => {
      const y = 80 + i * 80;
      els.push(text(`tpl-fm-l${i}`, 60, y, l, PAL.ink, 14));
      els.push(box({ id: `tpl-fm-f${i}`, x: 60, y: y + 20, w: 360, h: 44, label: "", color: PAL.muted }));
    });
    els.push(box({ id: "tpl-fm-submit", x: 60, y: 80 + labels.length * 80 + 16, w: 160, h: 50, label: "Submit", color: PAL.good }));
    return els;
  },

  // Card grid — 6 uniform cards.
  cardgrid: () => {
    const els: Skel[] = [];
    const cols = 3, rows = 2;
    const w = 240, h = 160, gap = 24;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c + 1;
        els.push(box({
          id: `tpl-cg-${idx}`,
          x: 40 + c * (w + gap), y: 40 + r * (h + gap),
          w, h,
          label: `Card ${idx}\n— title\n— body`,
          color: idx % 2 === 0 ? PAL.cool : PAL.primary,
        }));
      }
    }
    return els;
  },

  // Modal dialog — backdrop hint + dialog + actions.
  modal: () => {
    const els: Skel[] = [];
    els.push(box({ id: "tpl-md-bd", x: 40, y: 40, w: 800, h: 480, label: "Backdrop", color: PAL.muted }, { fillStyle: "hachure", strokeStyle: "dashed" }));
    els.push(box({ id: "tpl-md-dlg", x: 220, y: 140, w: 440, h: 280, label: "", color: PAL.primary }, { roughness: 0, fillStyle: "solid", backgroundColor: "transparent" }));
    els.push(text("tpl-md-title", 240, 160, "Confirm action", PAL.primary, 22));
    els.push(text("tpl-md-body", 240, 210, "Are you sure you want to continue?", PAL.ink, 16));
    els.push(box({ id: "tpl-md-cancel", x: 320, y: 340, w: 140, h: 50, label: "Cancel", color: PAL.muted }));
    els.push(box({ id: "tpl-md-ok",     x: 480, y: 340, w: 140, h: 50, label: "Confirm", color: PAL.good }));
    return els;
  },

  // ─── Diagrams+ ───────────────────────────────────────────────────────────
  // Hexagonal architecture (ports & adapters).
  hexarch: () => {
    const t: Box[] = [
      { id: "tpl-hx-core", x: 320, y: 200, w: 240, h: 140, label: "Domain core",     color: PAL.primary },
      { id: "tpl-hx-in1",  x:  40, y: 100, w: 200, h:  80, label: "HTTP adapter",    color: PAL.cool },
      { id: "tpl-hx-in2",  x:  40, y: 360, w: 200, h:  80, label: "CLI adapter",     color: PAL.cool },
      { id: "tpl-hx-out1", x: 640, y: 100, w: 200, h:  80, label: "DB adapter",      color: PAL.warm },
      { id: "tpl-hx-out2", x: 640, y: 360, w: 200, h:  80, label: "Email adapter",   color: PAL.warm },
      { id: "tpl-hx-port1", x: 320, y:  60, w: 240, h:  60, label: "port: inbound",  color: PAL.muted },
      { id: "tpl-hx-port2", x: 320, y: 420, w: 240, h:  60, label: "port: outbound", color: PAL.muted },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[1], t[0]),
      arrow(t[2], t[0]),
      arrow(t[0], t[3]),
      arrow(t[0], t[4]),
      arrow(t[5], t[0]),
      arrow(t[0], t[6]),
    ];
  },

  // Event storming — actor → command → aggregate → event → policy.
  eventstorm: () => {
    const t: Box[] = [
      { id: "tpl-es-actor", x:  40, y: 200, w: 160, h: 70, label: "Actor",     color: PAL.ink },
      { id: "tpl-es-cmd",   x: 220, y: 200, w: 160, h: 70, label: "Command",   color: PAL.cool },
      { id: "tpl-es-agg",   x: 400, y: 200, w: 160, h: 70, label: "Aggregate", color: PAL.warm },
      { id: "tpl-es-evt",   x: 580, y: 200, w: 160, h: 70, label: "Event",     color: PAL.primary },
      { id: "tpl-es-pol",   x: 760, y: 200, w: 160, h: 70, label: "Policy",    color: PAL.bad },
      { id: "tpl-es-rm",    x: 580, y:  60, w: 160, h: 70, label: "Read model", color: PAL.good },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
      arrow(t[2], t[3]),
      arrow(t[3], t[4]),
      arrow(t[3], t[5]),
      arrow(t[4], t[1]),
    ];
  },

  // Layered architecture.
  layered: () => {
    const t: Box[] = [
      { id: "tpl-ly-pres", x: 60, y:  40, w: 600, h: 80, label: "Presentation",  color: PAL.cool },
      { id: "tpl-ly-app",  x: 60, y: 140, w: 600, h: 80, label: "Application",   color: PAL.primary },
      { id: "tpl-ly-dom",  x: 60, y: 240, w: 600, h: 80, label: "Domain",        color: PAL.warm },
      { id: "tpl-ly-inf",  x: 60, y: 340, w: 600, h: 80, label: "Infrastructure", color: PAL.muted },
    ];
    return [
      ...t.map((b) => box(b)),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
      arrow(t[2], t[3]),
    ];
  },

  // ER extended — 5 entities + FKs.
  erext: () => {
    const t: Box[] = [
      { id: "tpl-ex-user",    x:  40, y:  60, w: 200, h: 130, label: "User\n— id (PK)\n— email\n— created_at", color: PAL.cool },
      { id: "tpl-ex-order",   x: 280, y:  60, w: 200, h: 130, label: "Order\n— id (PK)\n— user_id (FK)\n— total", color: PAL.primary },
      { id: "tpl-ex-item",    x: 520, y:  60, w: 200, h: 130, label: "OrderItem\n— id (PK)\n— order_id (FK)\n— product_id (FK)", color: PAL.warm },
      { id: "tpl-ex-product", x: 760, y:  60, w: 200, h: 130, label: "Product\n— id (PK)\n— sku\n— price", color: PAL.good },
      { id: "tpl-ex-pay",     x: 280, y: 240, w: 200, h: 130, label: "Payment\n— id (PK)\n— order_id (FK)\n— amount", color: PAL.bad },
    ];
    return [
      ...t.map((b) => box(b, { roughness: 0, fillStyle: "solid", backgroundColor: "transparent" })),
      arrow(t[0], t[1]),
      arrow(t[1], t[2]),
      arrow(t[2], t[3]),
      arrow(t[1], t[4]),
    ];
  },

  // Use-case diagram — actor + system + use cases.
  usecase: () => {
    const els: Skel[] = [];
    const actor: Box = { id: "tpl-uc-actor", x: 60, y: 180, w: 120, h: 60, label: "Actor", color: PAL.ink };
    els.push(box(actor));
    const system: Box = { id: "tpl-uc-sys", x: 260, y: 60, w: 420, h: 300, label: "System", color: PAL.muted };
    els.push(box(system, { roughness: 0 }));
    const uses: Box[] = [
      { id: "tpl-uc-1", x: 300, y: 100, w: 320, h: 60, label: "Sign in",         color: PAL.cool },
      { id: "tpl-uc-2", x: 300, y: 180, w: 320, h: 60, label: "Place order",     color: PAL.primary },
      { id: "tpl-uc-3", x: 300, y: 260, w: 320, h: 60, label: "View receipts",   color: PAL.warm },
    ];
    uses.forEach((u) => { els.push(box(u, { roundness: { type: 2 } })); els.push(arrow(actor, u)); });
    return els;
  },
};

export type TemplateKey = keyof typeof TEMPLATES;
export type TemplateCat = "general" | "architecture" | "uml" | "process" | "security" | "team" | "math" | "devops" | "webui" | "diagrams";
export const TEMPLATE_META: Record<TemplateKey, { label: string; desc: string; cat: TemplateCat }> = {
  mindmap:       { label: "Mind map",       desc: "Central idea + 4 branches", cat: "general" },
  flowchart:     { label: "Flowchart",      desc: "Start → Step → Decide → Done", cat: "general" },
  kanban:        { label: "Kanban",         desc: "To do / Doing / Done columns", cat: "general" },
  swot:          { label: "SWOT",           desc: "Strengths · Weaknesses · Opportunities · Threats", cat: "general" },
  arch3tier:     { label: "3-tier arch",    desc: "Client → API → Service → DB", cat: "architecture" },
  c4context:     { label: "C4 context",     desc: "User + system + 2 externals", cat: "architecture" },
  microservices: { label: "Microservices",  desc: "Gateway + 3 svcs + DB/cache/MQ", cat: "architecture" },
  deployment:    { label: "Deployment",     desc: "LB + 2 AZs + DB", cat: "architecture" },
  classdiagram:  { label: "Class diagram",  desc: "UML classes with fields/methods", cat: "uml" },
  sequence:      { label: "Sequence",       desc: "Client/Server/DB with messages", cat: "uml" },
  statemachine:  { label: "State machine",  desc: "idle/loading/success/error", cat: "uml" },
  er:            { label: "ER diagram",     desc: "User/Order/Product with FKs", cat: "uml" },
  usecase:       { label: "Use case",       desc: "Actor + system + 3 use cases", cat: "uml" },
  dfd:           { label: "DFD lvl-1",      desc: "Validate → Process → Persist", cat: "uml" },
  cicd:          { label: "CI/CD pipeline", desc: "Commit → Build → Test → Deploy", cat: "process" },
  gitflow:       { label: "Git flow",       desc: "feature → develop → release → main", cat: "process" },
  oauth:         { label: "OAuth flow",     desc: "App ↔ Auth ↔ Resource server", cat: "process" },
  rest:          { label: "REST endpoints", desc: "GET/POST/PUT/DELETE list", cat: "process" },
  mvvm:          { label: "MVVM",           desc: "View ↔ ViewModel ↔ Model", cat: "process" },
  stride:        { label: "STRIDE",         desc: "Spoof/Tamper/Repud/Info/DoS/Elev", cat: "security" },
  retro4ls:      { label: "Retro 4Ls",      desc: "Liked / Learned / Lacked / Longed for", cat: "team" },
  sprint:        { label: "Sprint board",   desc: "Backlog → Sprint → IP → Review → Done", cat: "team" },
  mathgrid:      { label: "Coord grid",     desc: "X/Y axes + 4 quadrants",                cat: "math" },
  mathplot:      { label: "Function plot",  desc: "Axes + f(x)=x line",                    cat: "math" },
  mathproof:     { label: "Geometry proof", desc: "Right triangle + a²+b²=c²",             cat: "math" },
  mathfrac:      { label: "Fraction bars",  desc: "1/2, 1/3, 1/4, 1/6 bars",               cat: "math" },
  k8s:           { label: "K8s cluster",    desc: "Control plane + nodes + ingress",       cat: "devops" },
  docker:        { label: "Docker stack",   desc: "Host + containers + volume + net",      cat: "devops" },
  registry:      { label: "Registry flow",  desc: "Dev → Build → Push → Pull → Cluster",   cat: "devops" },
  monitor:       { label: "Monitoring",     desc: "App → Prom → Grafana / Alerts",         cat: "devops" },
  wireframe:     { label: "Wireframe page", desc: "Header / nav / hero / cards / footer",  cat: "webui" },
  form:          { label: "Form",           desc: "Title + inputs + submit",               cat: "webui" },
  cardgrid:      { label: "Card grid",      desc: "3 × 2 uniform cards",                   cat: "webui" },
  modal:         { label: "Modal dialog",   desc: "Backdrop + dialog + actions",           cat: "webui" },
  hexarch:       { label: "Hexagonal arch", desc: "Core + ports + adapters",               cat: "diagrams" },
  eventstorm:    { label: "Event storming", desc: "Actor → Cmd → Agg → Event → Policy",    cat: "diagrams" },
  layered:       { label: "Layered arch",   desc: "Presentation / App / Domain / Infra",   cat: "diagrams" },
  erext:         { label: "ER extended",    desc: "5 entities with FKs",                   cat: "diagrams" },
};
