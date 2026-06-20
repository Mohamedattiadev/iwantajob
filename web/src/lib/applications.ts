"use client";
import { useMutation, useQuery } from "convex/react";
import { api as convexApi } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Application, JobItem } from "@/lib/api";

export function useApplications() {
  const data = useQuery(convexApi.applications.list);
  const applyMut = useMutation(convexApi.applications.apply);
  const updateMut = useMutation(convexApi.applications.update);
  const removeMut = useMutation(convexApi.applications.remove);

  const applications = (data ?? []) as unknown as Application[];
  const appliedIds = new Set(applications.map((a) => a.job_id));

  const apply = async (job: JobItem | number): Promise<boolean> => {
    if (typeof job === "number") {
      // Back-compat path — caller only had the id. Will fail without
      // title/company since Convex requires them. Surface a console
      // warning so the call site can be updated.
      // eslint-disable-next-line no-console
      console.warn("[applications.apply] called with bare id — pass JobItem.");
      return false;
    }
    try {
      await applyMut({
        job_external_id: job.id,
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
  };

  const remove = async (appId: string) => {
    try {
      await removeMut({ id: appId as Id<"applications"> });
    } catch {/* silent */}
  };

  const setStatus = async (appId: string, status: Application["status"]) => {
    try {
      await updateMut({ id: appId as Id<"applications">, status });
    } catch {/* silent */}
  };

  return {
    applications,
    appliedIds,
    isLoading: data === undefined,
    apply,
    remove,
    setStatus,
  };
}
