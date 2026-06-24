"use client";
import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api as convexApi } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Application, JobItem } from "@/lib/api";

export function useApplications() {
  const data = useQuery(convexApi.applications.list);
  const applyMut = useMutation(convexApi.applications.apply);
  const updateMut = useMutation(convexApi.applications.update);
  const removeMut = useMutation(convexApi.applications.remove);

  const applications = useMemo(
    () => (data ?? []) as unknown as Application[],
    [data],
  );
  const appliedIds = useMemo(
    () => new Set(applications.map((a) => a.job_id)),
    [applications],
  );

  const apply = useCallback(async (job: JobItem): Promise<boolean> => {
    try {
      await applyMut({
        job_external_id: String(job.id),
        job_title: job.title,
        job_company: job.company ?? undefined,
        job_source: job.source,
        job_source_url: job.source_url,
        job_posted_at: job.posted_at ?? undefined,
        status: "applied",
      });
      return true;
    } catch {
      return false;
    }
  }, [applyMut]);

  const remove = useCallback(async (appId: string) => {
    try {
      await removeMut({ id: appId as Id<"applications"> });
    } catch {/* silent */}
  }, [removeMut]);

  const setStatus = useCallback(async (appId: string, status: Application["status"]) => {
    try {
      await updateMut({ id: appId as Id<"applications">, status });
    } catch {/* silent */}
  }, [updateMut]);

  const setNotes = useCallback(async (appId: string, notes: string) => {
    try {
      await updateMut({ id: appId as Id<"applications">, notes });
    } catch {/* silent */}
  }, [updateMut]);

  return {
    applications,
    appliedIds,
    isLoading: data === undefined,
    apply,
    remove,
    setStatus,
    setNotes,
  };
}
