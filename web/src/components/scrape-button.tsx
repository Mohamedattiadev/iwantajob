"use client";
import { useState } from "react";
import { Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAction } from "convex/react";
import { api as convexApi } from "../../convex/_generated/api";

type RunResult = Record<string, { collected: number; error?: string }>;

export function ScrapeButton() {
  const runAll = useAction(convexApi.jobs.runAllCollectors);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<{ total: number; ts: number } | null>(null);

  const start = async () => {
    if (running) return;
    setRunning(true);
    try {
      const r = (await runAll({})) as RunResult;
      let total = 0;
      const fails: string[] = [];
      for (const [name, info] of Object.entries(r)) {
        total += info.collected ?? 0;
        if (info.error) fails.push(`${name}: ${info.error}`);
      }
      setLast({ total, ts: Date.now() });
      if (fails.length) {
        toast.warning(`Collected ${total} · partial failures: ${fails.join(", ").slice(0, 120)}`);
      } else {
        toast.success(`Collected ${total} jobs`);
      }
    } catch (e) {
      toast.error(`Scrape failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={start} disabled={running}>
        {running ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scraping…</>
        ) : (
          <><RefreshCw className="mr-2 h-4 w-4" />Scrape jobs</>
        )}
      </Button>
      {last && !running && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>Last: {last.total} collected</span>
        </div>
      )}
    </div>
  );
}
