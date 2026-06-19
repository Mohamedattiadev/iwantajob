"use client";

import { useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const LEVELS = [
  { value: 0, label: "None", short: "—", color: "bg-muted text-muted-foreground" },
  { value: 1, label: "Heard of", short: "1", color: "bg-rose-500/15 text-rose-600 dark:text-rose-300" },
  { value: 2, label: "Touched", short: "2", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { value: 3, label: "Comfortable", short: "3", color: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { value: 4, label: "Confident", short: "4", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { value: 5, label: "Mastery", short: "5", color: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
] as const;

export type ProficiencyMap = Record<string, number>;

export function useProficiency() {
  const data = useQuery(api.proficiency.list);
  const setMut = useMutation(api.proficiency.setLevel);
  const resetMut = useMutation(api.proficiency.reset);

  const map: ProficiencyMap = {};
  for (const row of data ?? []) map[row.skill] = row.level;

  const set = useCallback(
    (skill: string, level: number) => {
      void setMut({ skill, level });
    },
    [setMut],
  );

  const setNote = useCallback((_skill: string, _text: string) => {
    // Per-skill side notes moved to `notes` table; this stub is kept so
    // callers that still pass through don't break. Use `api.notes.save`
    // for actual storage.
  }, []);

  const reset = useCallback(() => {
    void resetMut();
  }, [resetMut]);

  const ready = data !== undefined;
  return { map, notes: {} as Record<string, string>, set, setNote, reset, ready };
}
