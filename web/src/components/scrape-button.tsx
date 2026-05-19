"use client";
import { useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { API, fetcher, post, type ScrapeStatus } from "@/lib/api";

export function ScrapeButton() {
  const { data, mutate: refetch } = useSWR<ScrapeStatus>(
    "/api/scrape/status",
    fetcher,
    { refreshInterval: 0 },
  );
  const [polling, setPolling] = useState(false);
  const lastFinished = useRef<string | null>(null);

  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => refetch(), 1200);
    return () => clearInterval(id);
  }, [polling, refetch]);

  useEffect(() => {
    if (!data) return;
    if (data.running) {
      setPolling(true);
      return;
    }
    if (polling && data.finished_at && data.finished_at !== lastFinished.current) {
      lastFinished.current = data.finished_at;
      setPolling(false);
      if (data.error) {
        toast.error(`Scrape failed: ${data.error}`);
      } else if (data.result) {
        toast.success(
          `Done · ${data.result.new} new · ${data.result.extracted_jobs} extracted`,
        );
      }
      // Refresh sibling data.
      mutate((k) => typeof k === "string" && k.startsWith("/api/"), undefined, {
        revalidate: true,
      });
    }
  }, [data, polling]);

  const running = data?.running ?? false;

  const start = async () => {
    try {
      await post("/api/scrape");
      setPolling(true);
      toast.info("Scrape queued");
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("409")) toast.warning("Scrape already running");
      else toast.error(`Failed to start: ${msg}`);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <Button onClick={start} disabled={running} size="lg">
        {running ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Scraping...
          </>
        ) : (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            Scrape new jobs
          </>
        )}
      </Button>
      {data && (data.running || data.finished_at) && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          {data.running ? (
            <>
              <span>Running…</span>
              {data.log.length > 0 && (
                <span className="font-mono">{data.log[data.log.length - 1]}</span>
              )}
            </>
          ) : data.error ? (
            <>
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span>{data.error}</span>
            </>
          ) : data.result ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>
                Last run: {data.result.new} new, {data.result.dup} dup,{" "}
                {data.result.extracted_jobs} extracted
              </span>
            </>
          ) : null}
        </div>
      )}
      <span className="hidden" aria-hidden>{API}</span>
    </div>
  );
}
