"use client";

import { useCallback, useEffect, useState } from "react";

const STORE = "jobscraper:plans:v1";

export type Priority = "low" | "med" | "high";
export type Status = "todo" | "doing" | "done";

export type PlanItem = {
  id: string;
  title: string;
  skill?: string;
  target?: string;
  done: boolean;
  pinned: boolean;
  created_at: number;
  priority?: Priority;
  due?: string;            // ISO date "YYYY-MM-DD"
  notes?: string;
  completed_at?: number;
  status?: Status;         // todo | doing | done (mirrors `done` when "done")
};

function load(): PlanItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as PlanItem[]) : [];
  } catch {
    return [];
  }
}

function persist(items: PlanItem[]): void {
  try { localStorage.setItem(STORE, JSON.stringify(items)); } catch {}
}

export function useUserPlans() {
  // Lazy init keeps localStorage read out of render path and avoids
  // setState-in-effect lint flag on the initial hydration.
  const [items, setItems] = useState<PlanItem[]>(() => load());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, []);

  const add = useCallback((p: Pick<PlanItem, "title" | "skill" | "target"> & Partial<Pick<PlanItem, "priority" | "due" | "notes">>) => {
    setItems((prev) => {
      const next: PlanItem[] = [
        { id: crypto.randomUUID(), done: false, pinned: false, created_at: Date.now(), ...p },
        ...prev,
      ];
      persist(next);
      return next;
    });
  }, []);

  const update = useCallback((id: string, patch: Partial<PlanItem>) => {
    setItems((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((p) => p.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      persist(next);
      return next;
    });
  }, []);

  return { items, ready, add, update, remove, reorder };
}
