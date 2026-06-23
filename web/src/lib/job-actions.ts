"use client";
import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api as convexApi } from "../../convex/_generated/api";

export type JobActionKind = "hidden" | "saved" | "none";

export function useJobActions() {
  const data = useQuery(convexApi.jobActions.list);
  const setMut = useMutation(convexApi.jobActions.setAction);

  const hiddenIds = useMemo(
    () => new Set(data?.hidden ?? []),
    [data?.hidden],
  );
  const savedIds = useMemo(
    () => new Set(data?.saved ?? []),
    [data?.saved],
  );

  const setAction = useCallback(
    async (jobId: string, action: JobActionKind) => {
      try {
        await setMut({ job_external_id: jobId, action });
        return true;
      } catch {
        return false;
      }
    },
    [setMut],
  );

  return {
    hiddenIds,
    savedIds,
    isLoading: data === undefined,
    setAction,
  };
}
