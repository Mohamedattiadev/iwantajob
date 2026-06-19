"use client";

import { useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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
  due?: string;
  notes?: string;
  completed_at?: number;
  status?: Status;
};

export function useUserPlans() {
  const data = useQuery(api.plans.list);
  const addMut = useMutation(api.plans.add);
  const updateMut = useMutation(api.plans.update);
  const removeMut = useMutation(api.plans.remove);
  const reorderMut = useMutation(api.plans.reorder);

  const items: PlanItem[] = (data ?? []).map((r) => ({
    id: r._id,
    title: r.title,
    skill: r.skill,
    target: r.target,
    done: r.done,
    pinned: r.pinned,
    created_at: r.created_at,
    priority: r.priority as Priority | undefined,
    due: r.due,
    notes: r.notes,
    completed_at: r.completed_at,
    status: r.status as Status | undefined,
  }));

  const add = useCallback(
    (p: Pick<PlanItem, "title" | "skill" | "target"> & Partial<Pick<PlanItem, "priority" | "due" | "notes">>) => {
      void addMut({
        title: p.title,
        skill: p.skill,
        target: p.target,
        priority: p.priority,
        due: p.due,
        notes: p.notes,
      });
    },
    [addMut],
  );

  const update = useCallback(
    (id: string, patch: Partial<PlanItem>) => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (k === "id" || k === "created_at") continue;
        if (v !== undefined) cleaned[k] = v;
      }
      void updateMut({ id: id as Id<"plans">, patch: cleaned as never });
    },
    [updateMut],
  );

  const remove = useCallback((id: string) => {
    void removeMut({ id: id as Id<"plans"> });
  }, [removeMut]);

  const reorder = useCallback(
    (from: number, to: number) => {
      const ids = items.map((p) => p.id) as Id<"plans">[];
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      void reorderMut({ ids });
    },
    [items, reorderMut],
  );

  const ready = data !== undefined;
  return { items, ready, add, update, remove, reorder };
}
