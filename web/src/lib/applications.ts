"use client";
import useSWR from "swr";
import { API, fetcher, type Application } from "@/lib/api";

export function useApplications() {
  const { data, mutate, isLoading } = useSWR<Application[]>("/api/applications", fetcher);
  const appliedIds = new Set((data ?? []).map((a) => a.job_id));
  const apply = async (jobId: number) => {
    const r = await fetch(`${API}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, status: "applied" }),
    });
    if (r.ok) await mutate();
    return r.ok;
  };
  const remove = async (appId: number) => {
    const r = await fetch(`${API}/api/applications/${appId}`, { method: "DELETE" });
    if (r.ok) await mutate();
  };
  const setStatus = async (appId: number, status: Application["status"]) => {
    await fetch(`${API}/api/applications/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await mutate();
  };
  return { applications: data ?? [], appliedIds, isLoading, apply, remove, setStatus };
}
