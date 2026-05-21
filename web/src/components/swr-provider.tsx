"use client";

import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";

// Global SWR defaults — kills the redundant refetch storm the dev server
// log showed (status / sources / stats / profile / applications / chat
// status / jobs all firing multiple times per page mount).
//
// - dedupingInterval 60s: identical-key requests fire at most once per
//   minute even if many components subscribe. Was the dominant source of
//   duplicate /api/scrape/status & friends.
// - revalidateOnFocus false: tab-focus no longer fires a refetch storm.
// - revalidateIfStale false: stale data is shown immediately and only
//   refetched on explicit mutate() or when the dedupe window expires.
// - keepPreviousData: avoids spinner flash when query params change.
// - errorRetryCount 1 + 3s interval: dev backend hiccups don't loop.
export function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 60_000,
        revalidateOnFocus: false,
        revalidateIfStale: false,
        revalidateOnReconnect: true,
        keepPreviousData: true,
        errorRetryCount: 1,
        errorRetryInterval: 3000,
        shouldRetryOnError: (err) => {
          const status = (err as { status?: number })?.status;
          return status !== 401 && status !== 404;
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
