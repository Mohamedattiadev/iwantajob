"use client";
import { useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { API, fetcher, post, type ScrapeStatus } from "@/lib/api";

type SourceInfo = { id: string; configured: boolean; requires: string[] };

export function ScrapeButton() {
  const { data, mutate: refetch } = useSWR<ScrapeStatus>(
    "/api/scrape/status",
    fetcher,
    { refreshInterval: 0 },
  );
  const { data: sources } = useSWR<SourceInfo[]>("/api/scrape/sources", fetcher);
  const [source, setSource] = useState<string>("");  // "" = all
  const [polling, setPolling] = useState(false);
  const [openMenu, setOpenMenu] = useState(false);
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
        toast.success(`Done · ${data.result.new} new · ${data.result.extracted_jobs} extracted`);
      }
      mutate((k) => typeof k === "string" && k.startsWith("/api/"), undefined, { revalidate: true });
    }
  }, [data, polling]);

  const running = data?.running ?? false;

  const startWith = async (src: string) => {
    try {
      const qs = src ? `?source=${encodeURIComponent(src)}` : "";
      await post(`/api/scrape${qs}`);
      setPolling(true);
      toast.info(`Scrape queued (${src || "all sources"})`);
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("409")) toast.warning("Scrape already running");
      else toast.error(`Failed to start: ${msg}`);
    }
  };
  const start = () => startWith(source);
  const pickAndStart = (src: string) => {
    setSource(src);
    setOpenMenu(false);
    if (!running) startWith(src);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg shadow-sm">
        <Button onClick={start} disabled={running} className="rounded-r-none">
          {running ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scraping…</>
          ) : (
            <><RefreshCw className="mr-2 h-4 w-4" />Scrape {source || "all"}</>
          )}
        </Button>
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            disabled={running}
            onClick={() => setOpenMenu((v) => !v)}
            className="rounded-l-none border-l-0 px-2"
            title="Pick source"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          {openMenu && (
            <>
              <button
                aria-hidden
                tabIndex={-1}
                onClick={() => setOpenMenu(false)}
                className="fixed inset-0 z-30 cursor-default"
              />
              <div className="absolute right-0 top-full mt-1 z-40 w-[260px] rounded-lg border bg-popover shadow-xl overflow-hidden text-sm">
                <div className="px-3 py-2 border-b border-border/60 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Scrape source
                </div>
                <ul className="max-h-[320px] overflow-y-auto p-1">
                  <li>
                    <button
                      onClick={() => pickAndStart("")}
                      className={`w-full text-left px-2.5 py-1.5 rounded text-sm hover:bg-accent flex items-center justify-between gap-2 ${source === "" ? "bg-primary/10 text-foreground font-medium" : ""}`}
                    >
                      <span>All sources <span className="text-[10px] text-muted-foreground">— starts scrape</span></span>
                      <span className="text-[10px] font-mono text-muted-foreground">{(sources ?? []).filter((s) => s.configured).length}</span>
                    </button>
                  </li>
                  <li className="my-1 mx-2 border-t border-border/40" />
                  {(sources ?? []).length === 0 && (
                    <li className="px-2.5 py-2 text-xs text-muted-foreground italic">Loading sources…</li>
                  )}
                  {(sources ?? []).map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => pickAndStart(s.id)}
                        disabled={!s.configured || running}
                        className={`w-full text-left px-2.5 py-1.5 rounded text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-2 ${source === s.id ? "bg-primary/10 text-foreground font-medium" : ""}`}
                        title={s.configured ? s.id : `Needs env: ${s.requires.join(", ")}`}
                      >
                        <span className="lowercase">{s.id}</span>
                        {!s.configured && (
                          <span className="text-[9px] font-mono text-amber-500 uppercase">no key</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="px-3 py-2 border-t border-border/60 text-[10px] text-muted-foreground leading-relaxed bg-muted/30">
                  Add new: drop <code className="font-mono">collect_*.py</code> in <code className="font-mono">collectors/</code> and register in <code className="font-mono">COLLECTORS</code>.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {data && (data.running || data.finished_at) && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          {data.running ? (
            <>
              <span>Running…</span>
              {data.log.length > 0 && (
                <span className="font-mono truncate max-w-[260px]">{data.log[data.log.length - 1]}</span>
              )}
            </>
          ) : data.error ? (
            <><AlertCircle className="h-4 w-4 text-red-500" /><span>{data.error}</span></>
          ) : data.result ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Last: {data.result.new} new · {data.result.dup} dup · {data.result.extracted_jobs} extracted</span>
            </>
          ) : null}
        </div>
      )}
      <span className="hidden" aria-hidden>{API}</span>
    </div>
  );
}
