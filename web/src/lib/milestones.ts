"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type Milestone = { _id: Id<"milestones">; text: string; done: boolean; order: number };

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

export function useSkillMilestones(skill: string) {
  const data = useQuery(api.milestones.listBySkill, { skill });
  const seedIfEmpty = useMutation(api.milestones.seedIfEmpty);
  const addMut = useMutation(api.milestones.add);
  const toggleMut = useMutation(api.milestones.toggle);
  const updateTextMut = useMutation(api.milestones.updateText);
  const removeMut = useMutation(api.milestones.remove);
  const replaceForSkill = useMutation(api.milestones.replaceForSkill);

  useEffect(() => {
    if (data === undefined) return;
    if (data.length > 0) return;
    const preset = DEFAULT_MILESTONES[skill];
    if (!preset || preset.length === 0) return;
    seedIfEmpty({ skill, texts: preset }).catch(() => {});
  }, [data, skill, seedIfEmpty]);

  const items: Milestone[] = (data ?? []).map((r) => ({
    _id: r._id,
    text: r.text,
    done: r.done,
    order: r.order,
  }));

  const add = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      void addMut({ skill, text });
    },
    [addMut, skill],
  );

  const toggle = useCallback(
    (id: Id<"milestones">) => {
      void toggleMut({ id });
    },
    [toggleMut],
  );

  const updateText = useCallback(
    (id: Id<"milestones">, text: string) => {
      void updateTextMut({ id, text });
    },
    [updateTextMut],
  );

  const remove = useCallback(
    (id: Id<"milestones">) => {
      void removeMut({ id });
    },
    [removeMut],
  );

  const reset = useCallback(() => {
    const preset = DEFAULT_MILESTONES[skill] ?? [];
    void replaceForSkill({ skill, texts: preset });
  }, [replaceForSkill, skill]);

  const ready = data !== undefined;
  const progress = items.length === 0 ? 0 : items.filter((m) => m.done).length / items.length;

  return { items, ready, add, toggle, updateText, remove, reset, progress };
}
