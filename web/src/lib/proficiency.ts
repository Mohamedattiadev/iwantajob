"use client";

import { useEffect, useState, useCallback } from "react";

const STORAGE = "jobscraper:proficiency:v1";
const NOTES = "jobscraper:notes:v1";

export const LEVELS = [
  { value: 0, label: "None", short: "—", color: "bg-muted text-muted-foreground" },
  { value: 1, label: "Heard of", short: "1", color: "bg-rose-500/15 text-rose-600 dark:text-rose-300" },
  { value: 2, label: "Touched", short: "2", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { value: 3, label: "Comfortable", short: "3", color: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { value: 4, label: "Confident", short: "4", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { value: 5, label: "Mastery", short: "5", color: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
] as const;

export type ProficiencyMap = Record<string, number>;

export function loadProficiency(): ProficiencyMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as ProficiencyMap) : {};
  } catch {
    return {};
  }
}

export function loadNotes(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(NOTES);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function useProficiency() {
  const [map, setMap] = useState<ProficiencyMap>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMap(loadProficiency());
    setNotes(loadNotes());
    setReady(true);
  }, []);

  const set = useCallback((skill: string, level: number) => {
    setMap((prev) => {
      const next = { ...prev, [skill]: level };
      try { localStorage.setItem(STORAGE, JSON.stringify(next)); } catch {}
      return next;
    });
    // Fire-and-forget server sync so CV stays in step.
    const url = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000") + "/api/profile/skills";
    fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill, level }),
    }).catch(() => {});
  }, []);

  const setNote = useCallback((skill: string, text: string) => {
    setNotes((prev) => {
      const next = { ...prev, [skill]: text };
      try { localStorage.setItem(NOTES, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setMap({});
    try { localStorage.removeItem(STORAGE); } catch {}
  }, []);

  return { map, notes, set, setNote, reset, ready };
}
