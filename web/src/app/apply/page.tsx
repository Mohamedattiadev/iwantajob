"use client";

import Link from "next/link";
import { ExternalLink, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApplications } from "@/lib/applications";
import type { Application } from "@/lib/api";

const STATUS_TONE: Record<Application["status"], string> = {
  applied: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  interviewing: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  offer: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  ghost: "bg-muted text-muted-foreground",
};

export default function ApplyPage() {
  const { applications, isLoading, remove, setStatus } = useApplications();

  const counts = applications.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <header>
        <Badge variant="outline" className="mb-3 text-xs font-mono">step 04 · apply</Badge>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          Application history.
        </h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
          Every job you mark as applied lives here. The Jobs page dedupes against this list — never apply twice.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Total" value={applications.length} />
        <Stat label="Applied" value={counts.applied ?? 0} />
        <Stat label="Interviewing" value={counts.interviewing ?? 0} />
        <Stat label="Offer" value={counts.offer ?? 0} accent="emerald" />
        <Stat label="Rejected" value={counts.rejected ?? 0} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : applications.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">
          No applications yet. Head to <Link href="/jobs" className="text-primary hover:underline">Jobs</Link> and click "Apply" on any listing.
        </CardContent></Card>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {applications.map((a) => (
            <li key={a.id}>
              <Card><CardContent className="p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium line-clamp-1">{a.job.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.job.company ?? "?"} · {a.job.source} · applied {a.applied_at.slice(0, 10)}
                    </div>
                  </div>
                  <a href={a.job.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0">
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={a.status} onValueChange={(v) => v && setStatus(a.id, v as Application["status"])}>
                    <SelectTrigger className={`h-8 text-xs w-40 ${STATUS_TONE[a.status]}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="applied">applied</SelectItem>
                      <SelectItem value="interviewing">interviewing</SelectItem>
                      <SelectItem value="offer">offer</SelectItem>
                      <SelectItem value="rejected">rejected</SelectItem>
                      <SelectItem value="ghost">ghosted</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => remove(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent></Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "emerald" }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${accent === "emerald" ? "text-emerald-500" : ""}`}>{value}</div>
    </CardContent></Card>
  );
}
