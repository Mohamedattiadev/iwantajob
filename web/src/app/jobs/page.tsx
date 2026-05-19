"use client";

import { Suspense, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Filter, Search, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ScrapeButton } from "@/components/scrape-button";
import { PageHeader } from "@/components/page-header";
import { fetcher, type JobsResponse } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

function JobsPageInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [source, setSource] = useState(sp.get("source") ?? "all");
  const [seniority, setSeniority] = useState(sp.get("seniority") ?? "junior_or_unknown");
  const [minScore, setMinScore] = useState(sp.get("min_score") ?? "50");
  const [skill, setSkill] = useState(sp.get("skill") ?? "all");
  const [showFilters, setShowFilters] = useState(false);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (source !== "all") params.set("source", source);
  params.set("seniority", seniority);
  params.set("min_score", minScore);
  if (skill !== "all") params.set("skill", skill);
  params.set("limit", "100");

  const { data, isLoading } = useSWR<JobsResponse>(
    `/api/jobs?${params.toString()}`,
    fetcher,
    { keepPreviousData: true },
  );

  const { appliedIds, apply } = useApplications();

  const reset = () => {
    setQ("");
    setSource("all");
    setSeniority("junior_or_unknown");
    setMinScore("50");
    setSkill("all");
    router.push("/jobs");
  };

  const activeFilters = [
    source !== "all" && { label: source, clear: () => setSource("all") },
    skill !== "all" && { label: skill, clear: () => setSkill("all") },
    seniority !== "junior_or_unknown" && { label: seniority, clear: () => setSeniority("junior_or_unknown") },
    minScore !== "50" && { label: `score ≥ ${minScore}`, clear: () => setMinScore("50") },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="03 · jobs"
        title={<><span className="tabular-nums">{data?.total ?? 0}</span> <span className="text-muted-foreground italic">matches</span></>}
        subtitle="Ghost-filtered junior listings. Click any row to open and mark applied."
        action={<ScrapeButton />}
      />

      {/* Search bar */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, company, description..."
            className="pl-10 h-12 text-base"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-3.5 w-3.5 mr-2" />
            Filters
          </Button>
          {activeFilters.map((f) => (
            <Badge key={f.label} variant="secondary" className="gap-1 cursor-pointer" onClick={f.clear}>
              {f.label}
              <X className="h-3 w-3" />
            </Badge>
          ))}
          {activeFilters.length > 0 && (
            <Button variant="ghost" size="sm" onClick={reset}>Reset all</Button>
          )}
        </div>

        <Collapsible open={showFilters} onOpenChange={setShowFilters}>
          <CollapsibleContent>
            <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Source</label>
                <Select value={source} onValueChange={(v) => setSource(v ?? "all")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {(data?.facets.sources ?? []).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Seniority</label>
                <Select value={seniority} onValueChange={(v) => setSeniority(v ?? "junior_or_unknown")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="junior_or_unknown">Junior / intern / unknown</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                    <SelectItem value="junior">Junior</SelectItem>
                    <SelectItem value="mid">Mid</SelectItem>
                    <SelectItem value="senior">Senior</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Min quality</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Skill</label>
                <Select value={skill} onValueChange={(v) => setSkill(v ?? "all")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="all">Any skill</SelectItem>
                    {(data?.facets.skills ?? []).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent></Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Job list */}
      {isLoading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">No matches. Try resetting filters.</div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data?.items ?? []).map((j) => {
            const isApplied = appliedIds.has(j.id);
            return (
            <li key={j.id}>
              <a
                href={j.source_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={async () => {
                  if (!isApplied) {
                    const ok = await apply(j.id);
                    if (ok) toast.success("Marked applied — tracked in /apply");
                  }
                }}
                className={`group block h-full px-5 py-4 rounded-xl border bg-card hover:bg-accent/40 transition-colors ${
                  isApplied ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 text-center shrink-0 pt-0.5">
                    <div className={`text-lg font-semibold tabular-nums ${
                      j.score >= 80 ? "text-emerald-500"
                      : j.score >= 60 ? "text-amber-500"
                      : "text-muted-foreground"
                    }`}>
                      {j.score}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">score</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium line-clamp-1">{j.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{j.company ?? "?"}</span>
                      <span>·</span>
                      <span className="font-mono">{j.source}</span>
                      <span>·</span>
                      <span>{j.posted_at ? j.posted_at.slice(0, 10) : "no date"}</span>
                      {j.seniority && (<>
                        <span>·</span>
                        <span className="capitalize">{j.seniority}</span>
                      </>)}
                    </div>
                    {j.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {j.skills.slice(0, 8).map((sk) => (
                          <span
                            key={sk.skill}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSkill(sk.skill); }}
                            className="px-2 py-0.5 rounded text-[10px] bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors cursor-pointer"
                          >
                            {sk.skill}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {isApplied ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-1 shrink-0" aria-label="applied" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-muted-foreground mt-1 group-hover:translate-x-1 transition-transform shrink-0" />
                  )}
                </div>
              </a>
            </li>
            );
          })}
        </ul>
      )}

      {data && data.items.length > 0 && (
        <div className="text-center text-xs text-muted-foreground pt-2">
          Showing {data.items.length} of {data.total}
        </div>
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
      <JobsPageInner />
    </Suspense>
  );
}
