"use client";

import { Suspense, memo, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Filter, X } from "lucide-react";
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
import { PageTabs, JOBS_TABS } from "@/components/page-tabs";
import { Pagination } from "@/components/pagination";
import { AiSearchInput } from "@/components/ai-search-input";
import { type JobsResponse, type JobItem } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import { useAction, useQuery } from "convex/react";
import { api as convexApi } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type JobCardProps = {
  job: JobItem;
  isApplied: boolean;
  tgAvailable: boolean;
  isTgSending: boolean;
  onPickSkill: (skill: string) => void;
  onTelegramApply: (jobId: string) => void;
  onMarkApplied: (job: JobItem) => void;
};

const JobCard = memo(function JobCard({
  job: j,
  isApplied,
  tgAvailable,
  isTgSending,
  onPickSkill,
  onTelegramApply,
  onMarkApplied,
}: JobCardProps) {
  const scoreTone =
    j.score >= 80 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30"
    : j.score >= 60 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30"
    : "bg-muted text-muted-foreground ring-foreground/10";
  return (
    <li>
      <article className={`group h-full flex flex-col rounded-2xl border bg-card hover:shadow-lg hover:border-foreground/20 transition-all ${isApplied ? "opacity-75" : ""}`}>
        <div className="p-5 pb-3 flex-1 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-base leading-snug line-clamp-2 flex-1">{j.title}</h3>
            <span className={`shrink-0 inline-flex items-center justify-center min-w-[40px] h-7 px-2 rounded-full text-xs font-bold tabular-nums ring-1 ${scoreTone}`} title="Match score">
              {j.score}
            </span>
          </div>
          <div className="text-sm text-foreground/80 font-medium line-clamp-1">{j.company ?? "Unknown company"}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-mono uppercase">{j.source}</span>
            {j.posted_at && (<><span>·</span><span>{j.posted_at.slice(0, 10)}</span></>)}
            {j.seniority && (<><span>·</span><span className="capitalize">{j.seniority.replace(/_/g, " ")}</span></>)}
          </div>
          {j.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {j.skills.slice(0, 6).map((sk) => (
                <button
                  key={sk.skill}
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPickSkill(sk.skill); }}
                  className="px-2 py-0.5 rounded-md text-[10px] bg-foreground/[0.04] border border-foreground/10 text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
                >
                  {sk.skill}
                </button>
              ))}
              {j.skills.length > 6 && (
                <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground">+{j.skills.length - 6}</span>
              )}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t bg-muted/30 rounded-b-2xl flex items-center gap-2">
          <a
            href={j.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-9 px-3 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            title="Open posting in new tab"
          >
            Open <ArrowRight className="h-3 w-3 ml-1" />
          </a>
          <div className="flex-1" />
          {isApplied ? (
            <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Applied
            </span>
          ) : tgAvailable ? (
            <button
              type="button"
              disabled={isTgSending}
              onClick={(e) => { e.preventDefault(); onTelegramApply(j.id); }}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:opacity-90 shadow-sm disabled:opacity-50"
              title="Send brief to Telegram + record as applied"
            >
              <Send className="h-3.5 w-3.5" />
              {isTgSending ? "Sending..." : "Apply via TG"}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onMarkApplied(j); }}
              className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 shadow-sm"
            >
              Mark applied
            </button>
          )}
        </div>
      </article>
    </li>
  );
});

function JobsPageInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [source, setSource] = useState(sp.get("source") ?? "all");
  const [seniority, setSeniority] = useState(sp.get("seniority") ?? "junior_or_unknown");
  const [minScore, setMinScore] = useState(sp.get("min_score") ?? "50");
  const [skill, setSkill] = useState(sp.get("skill") ?? "all");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  const raw = useQuery(convexApi.jobs.list, {
    q: q || undefined,
    source: source !== "all" ? source : undefined,
    seniority: seniority || undefined,
    skill: skill !== "all" ? skill : undefined,
    min_score: Number(minScore) || 0,
    limit: 100,
  });
  const data = raw as JobsResponse | undefined;
  const isLoading = raw === undefined;

  const { appliedIds, apply } = useApplications();
  const tgStatus = useQuery(convexApi.telegram.status);
  const sendBrief = useAction(convexApi.telegram.sendApplyBrief);
  const [tgLoading, setTgLoading] = useState<string | null>(null);

  const telegramApply = useCallback(async (jobId: string) => {
    setTgLoading(jobId);
    try {
      const res = await sendBrief({ jobId: jobId as Id<"jobs_pool"> });
      if (!res.ok) throw new Error(res.error || "Telegram send failed");
      toast.success("Brief sent to Telegram. Recorded as applied.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setTgLoading(null);
    }
  }, [sendBrief]);

  const handlePickSkill = useCallback((s: string) => {
    setSkill(s);
    setPage(1);
  }, []);

  const handleMarkApplied = useCallback(async (j: JobItem) => {
    const ok = await apply(j);
    if (ok) toast.success("Marked applied");
  }, [apply]);

  // Filter-setter wrappers that also reset to page 1
  const withReset = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };
  const setQ_ = withReset(setQ);
  const setSource_ = withReset(setSource);
  const setSeniority_ = withReset(setSeniority);
  const setMinScore_ = withReset(setMinScore);
  const setSkill_ = withReset(setSkill);

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

      <PageTabs tabs={JOBS_TABS} />

      {/* Search bar — full-width AI input, filters tucked beside */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <AiSearchInput
            value={q}
            onChange={setQ_}
            placeholder="Search title, company, description… (AI sharpens keywords)"
            context="jobs"
            className="flex-1"
          />
          <Button
            variant="outline"
            onClick={() => setShowFilters((v) => !v)}
            className="h-12 sm:w-auto"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters{activeFilters.length > 0 ? ` · ${activeFilters.length}` : ""}
          </Button>
        </div>
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {activeFilters.map((f) => (
              <Badge key={f.label} variant="secondary" className="gap-1 cursor-pointer" onClick={f.clear}>
                {f.label}
                <X className="h-3 w-3" />
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={reset}>Reset all</Button>
          </div>
        )}

        <Collapsible open={showFilters} onOpenChange={setShowFilters}>
          <CollapsibleContent>
            <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Source</label>
                <Select value={source} onValueChange={(v) => setSource_(v ?? "all")}>
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
                <Select value={seniority} onValueChange={(v) => setSeniority_(v ?? "junior_or_unknown")}>
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
                  onChange={(e) => setMinScore_(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Skill</label>
                <Select value={skill} onValueChange={(v) => setSkill_(v ?? "all")}>
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
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data?.items ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((j) => (
            <JobCard
              key={j.id}
              job={j}
              isApplied={appliedIds.has(j.id)}
              tgAvailable={!!tgStatus?.available}
              isTgSending={tgLoading === j.id}
              onPickSkill={handlePickSkill}
              onTelegramApply={telegramApply}
              onMarkApplied={handleMarkApplied}
            />
          ))}
        </ul>
      )}

      {data && data.items.length > 0 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalShown={data.items.length}
          total={data.total}
          onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        />
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
