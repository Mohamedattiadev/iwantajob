"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowRight, ChevronDown, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrapeButton } from "@/components/scrape-button";
import { ProficiencyControl } from "@/components/proficiency";
import { useProficiency, LEVELS } from "@/lib/proficiency";
import { fetcher, type LearnResponse, type LearnRow } from "@/lib/api";

export default function LearnPage() {
  const { data, isLoading } = useSWR<LearnResponse>("/api/learn", fetcher);
  const { map: prof, set, ready } = useProficiency();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const all: (LearnRow & { onCv: boolean })[] = useMemo(() => {
    if (!data) return [];
    return [
      ...data.gaps.map((g) => ({ ...g, onCv: false })),
      ...data.have.map((h) => ({ ...h, onCv: true })),
    ];
  }, [data]);

  const ranked = useMemo(() => {
    const priority = (r: LearnRow) => r.count * (5 - (prof[r.skill] ?? 0));
    return [...all]
      .filter((r) => (prof[r.skill] ?? 0) < 4)
      .sort((a, b) => priority(b) - priority(a));
  }, [all, prof]);

  const filtered = useMemo(() => {
    if (!search) return ranked;
    const q = search.toLowerCase();
    return ranked.filter((r) => r.skill.toLowerCase().includes(q));
  }, [ranked, search]);

  const visible = showAll ? filtered : filtered.slice(0, 8);
  const focus = ranked.slice(0, 3);

  const overallPct = all.length
    ? (Object.entries(prof).reduce((sum, [, lvl]) => sum + lvl, 0) /
        (all.length * 5)) *
      100
    : 0;

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="pt-6 max-w-3xl">
        <Badge variant="outline" className="mb-5 text-xs font-mono">step 02 · learn</Badge>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1]">
          One skill at a time.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          Built from{" "}
          <span className="text-foreground font-medium">{data?.total_real ?? 0}</span>{" "}
          real junior jobs. Rate honestly. We show the highest-ROI gaps first.
        </p>
        <div className="mt-7 flex items-center gap-3">
          <ScrapeButton />
        </div>
      </section>

      {/* Progress */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Overall readiness</h2>
          <span className="text-sm text-muted-foreground tabular-nums">{overallPct.toFixed(0)}%</span>
        </div>
        <Progress value={overallPct} className="h-1.5" />
      </section>

      {/* Focus card — top 3 */}
      <section>
        <SectionHeading
          eyebrow="00"
          title="Focus this week"
          subtitle="Highest priority = jobs × (5 − your level). Rate the rest below."
        />
        {isLoading || !ready ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : focus.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            All skills at Confident+. Maintain mode.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {focus.map((row, i) => {
              const lvl = prof[row.skill] ?? 0;
              return (
                <Card key={row.skill} className="border-foreground/15 hover:border-foreground/30 transition-colors">
                  <CardContent className="p-5 space-y-3">
                    <div className="text-xs font-mono text-muted-foreground">#{i + 1}</div>
                    <Link
                      href={`/learn/${encodeURIComponent(row.skill)}`}
                      className="block text-2xl font-semibold tracking-tight hover:underline"
                    >
                      {row.skill}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {row.category} · {row.count} jobs · {row.pct}%
                    </div>
                    <ProficiencyControl value={lvl} onChange={(v) => set(row.skill, v)} size="sm" />
                    <div className="flex items-center gap-3 text-xs">
                      <Link
                        href={`/learn/${encodeURIComponent(row.skill)}`}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        open notebook <ArrowRight className="h-3 w-3" />
                      </Link>
                      <Link
                        href={`/jobs?skill=${encodeURIComponent(row.skill)}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        jobs →
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* List */}
      <section>
        <SectionHeading
          eyebrow="01"
          title="All gaps"
          subtitle="Click any row for resources and notes."
        />
        <div className="relative max-w-md mb-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search skill"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {isLoading || !ready ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No skills match.</div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {visible.map((row) => {
              const lvl = prof[row.skill] ?? 0;
              const priority = row.count * (5 - lvl);
              return (
                <li key={row.skill}>
                  <Link
                    href={`/learn/${encodeURIComponent(row.skill)}`}
                    className="group block px-4 py-3 rounded-xl border bg-card hover:bg-accent/40 transition-colors h-full"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium group-hover:underline">{row.skill}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">{row.category}</Badge>
                          {row.onCv && <Badge variant="secondary" className="text-[10px]">on CV</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {row.count} jobs · priority <span className="font-mono">{priority}</span>
                        </div>
                        <div
                          className="mt-2"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        >
                          <ProficiencyControl value={lvl} onChange={(v) => set(row.skill, v)} size="sm" />
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground mt-0.5 group-hover:translate-x-1 transition-transform shrink-0" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {filtered.length > 8 && (
          <div className="mt-4 text-center">
            <Button variant="outline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show top 8 only" : `Show all ${filtered.length}`}
              <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`} />
            </Button>
          </div>
        )}
      </section>

      {/* Levels legend */}
      <section className="border-t pt-6 text-xs text-muted-foreground max-w-3xl">
        <div className="font-mono uppercase tracking-wider text-foreground mb-2">Levels</div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {LEVELS.map((l) => (
            <span key={l.value} className="inline-flex items-center gap-1.5">
              <span className={`inline-block w-5 h-5 rounded ${l.color} font-mono text-[10px] grid place-items-center`}>{l.short}</span>
              {l.label}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-mono text-muted-foreground mb-1">{eyebrow}</div>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

