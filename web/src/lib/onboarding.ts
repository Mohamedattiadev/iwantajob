"use client";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const KEY = "jobscraper:onboarded";

export function useOnboarded() {
  const remote = useQuery(api.profile.getOnboarded);
  const setRemote = useMutation(api.profile.setOnboarded);

  // remote is undefined while loading; null when unauthenticated; boolean otherwise.
  // Fall back to localStorage cache so first paint after sign-in doesn't bounce.
  let onboarded: boolean | null;
  if (remote === undefined) {
    if (typeof window === "undefined") onboarded = null;
    else {
      try { onboarded = localStorage.getItem(KEY) === "1"; } catch { onboarded = null; }
    }
  } else {
    onboarded = remote === null ? null : remote;
    if (typeof window !== "undefined" && remote === true) {
      try { localStorage.setItem(KEY, "1"); } catch {}
    }
  }

  return {
    onboarded,
    finish: async () => {
      try { localStorage.setItem(KEY, "1"); } catch {}
      try { await setRemote({ value: true }); } catch {}
    },
    reset: async () => {
      try { localStorage.removeItem(KEY); } catch {}
      try { await setRemote({ value: false }); } catch {}
    },
  };
}
