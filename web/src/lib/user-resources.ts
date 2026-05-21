"use client";
import { useEffect, useState, useCallback } from "react";
import type { Resource } from "./resources";

const KEY = "user:resources";

type Store = Record<string, Resource[]>;

function load(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch { return {}; }
}

function save(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function useUserResources(skill: string) {
  const [items, setItems] = useState<Resource[]>([]);

  useEffect(() => {
    setItems(load()[skill] ?? []);
  }, [skill]);

  const add = useCallback((r: Resource) => {
    const store = load();
    const list = [...(store[skill] ?? []), r];
    store[skill] = list;
    save(store);
    setItems(list);
  }, [skill]);

  const remove = useCallback((url: string) => {
    const store = load();
    const list = (store[skill] ?? []).filter((r) => r.url !== url);
    store[skill] = list;
    save(store);
    setItems(list);
  }, [skill]);

  return { items, add, remove };
}
