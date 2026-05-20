"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STORE = "jobscraper:milestones:v1";

export type Milestone = { id: string; text: string; done: boolean };
export type SkillMilestones = Record<string, Milestone[]>; // skill -> ordered list

// Curated default milestones for high-frequency skills. Used to seed when user
// opens a skill page for the first time. Editable afterwards.
export const DEFAULT_MILESTONES: Record<string, string[]> = {
  JavaScript: [
    "Variables, data types, operators",
    "Functions, scope, closures",
    "Arrays + objects, destructuring",
    "Async: callbacks → promises → async/await",
    "DOM + events",
    "Modules, ES6+ syntax",
    "Error handling, try/catch",
    "Build a small project end-to-end",
  ],
  TypeScript: [
    "Basic types + interfaces",
    "Unions, generics, narrowing",
    "Utility types (Partial, Pick, Record, Omit)",
    "Type-safe API client",
    "Project tsconfig + strict mode",
  ],
  Python: [
    "Syntax + data structures",
    "Functions, comprehensions, lambdas",
    "OOP basics + dataclasses",
    "Virtualenv, pip, project layout",
    "File I/O, JSON, requests",
    "One real project (script or API)",
  ],
  React: [
    "Components + JSX",
    "Props + state (useState)",
    "useEffect lifecycle",
    "Lists, keys, conditional rendering",
    "Forms + controlled inputs",
    "Custom hooks",
    "Context or Zustand for app state",
    "Fetching data + loading states",
  ],
  "Next.js": [
    "App router file conventions",
    "Server vs Client components",
    "Routing + layouts + loading.tsx",
    "Data fetching + caching",
    "API routes / route handlers",
    "Deployment to Vercel",
  ],
  Node: [
    "Modules + npm",
    "Async patterns + streams",
    "Build a REST API (express/fastify)",
    "Auth basics (sessions or JWT)",
    "Connect to a database",
    "Deploy + env management",
  ],
  Git: [
    "init, add, commit, log",
    "Branching + merging",
    "Remote: clone, push, pull",
    "Rebase + interactive rebase",
    "Resolve merge conflicts",
    "PR workflow on GitHub",
  ],
  SQL: [
    "SELECT, WHERE, ORDER BY, LIMIT",
    "JOINs (inner, left, right)",
    "GROUP BY + aggregations",
    "Subqueries + CTEs",
    "Indexes + EXPLAIN basics",
    "Transactions",
  ],
  Docker: [
    "Run + manage containers",
    "Write a Dockerfile",
    "Volumes + networks",
    "docker-compose multi-service",
    "Push image to registry",
  ],
  CSS: [
    "Selectors + specificity",
    "Box model + display modes",
    "Flexbox layout",
    "Grid layout",
    "Responsive design + media queries",
    "Animations + transitions",
  ],
  HTML: [
    "Semantic tags",
    "Forms + inputs + validation",
    "Accessibility basics (ARIA, alt)",
    "SEO meta tags",
  ],
  FastAPI: [
    "Path + query params",
    "Pydantic request/response models",
    "Dependency injection",
    "Async endpoints",
    "DB integration (SQLAlchemy)",
    "Auth (OAuth2 password bearer)",
  ],
};

function load(): SkillMilestones {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as SkillMilestones) : {};
  } catch { return {}; }
}

function persist(map: SkillMilestones): void {
  try { localStorage.setItem(STORE, JSON.stringify(map)); } catch {}
}

function seedFor(skill: string): Milestone[] {
  const preset = DEFAULT_MILESTONES[skill];
  if (!preset) return [];
  return preset.map((t) => ({ id: crypto.randomUUID(), text: t, done: false }));
}

export function useSkillMilestones(skill: string) {
  const [map, setMap] = useState<SkillMilestones>(() => load());
  const [ready, setReady] = useState(false);

  // Seed default checklist on first load for this skill, if missing.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMap((prev) => {
      if (prev[skill]) return prev;
      const seed = seedFor(skill);
      if (seed.length === 0) return prev;
      const next = { ...prev, [skill]: seed };
      persist(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [skill]);

  const items = useMemo(() => map[skill] ?? [], [map, skill]);

  const writeItems = useCallback((next: Milestone[]) => {
    setMap((prev) => {
      const merged = { ...prev, [skill]: next };
      persist(merged);
      return merged;
    });
  }, [skill]);

  const add = useCallback((text: string) => {
    if (!text.trim()) return;
    writeItems([...items, { id: crypto.randomUUID(), text: text.trim(), done: false }]);
  }, [items, writeItems]);

  const toggle = useCallback((id: string) => {
    writeItems(items.map((m) => (m.id === id ? { ...m, done: !m.done } : m)));
  }, [items, writeItems]);

  const updateText = useCallback((id: string, text: string) => {
    writeItems(items.map((m) => (m.id === id ? { ...m, text } : m)));
  }, [items, writeItems]);

  const remove = useCallback((id: string) => {
    writeItems(items.filter((m) => m.id !== id));
  }, [items, writeItems]);

  const reset = useCallback(() => {
    writeItems(seedFor(skill));
  }, [skill, writeItems]);

  const progress = items.length === 0 ? 0 : items.filter((m) => m.done).length / items.length;

  return { items, ready, add, toggle, updateText, remove, reset, progress };
}
