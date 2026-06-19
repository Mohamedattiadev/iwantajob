"use client";
import { useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Resource } from "./resources";

export function useUserResources(skill: string) {
  const data = useQuery(api.resources.listBySkill, { skill });
  const addMut = useMutation(api.resources.add);
  const removeMut = useMutation(api.resources.removeByUrl);

  const items: Resource[] = (data ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    kind: r.kind as Resource["kind"],
  }));

  const add = useCallback(
    (r: Resource) => {
      void addMut({ skill, title: r.title, url: r.url, kind: r.kind });
    },
    [addMut, skill],
  );

  const remove = useCallback(
    (url: string) => {
      void removeMut({ skill, url });
    },
    [removeMut, skill],
  );

  return { items, add, remove };
}
