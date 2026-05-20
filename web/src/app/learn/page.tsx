"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowRight, Search, Target, Plus, Trash2, Pin, PinOff, Check, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrapeButton } from "@/components/scrape-button";
import { PageHeader } from "@/components/page-header";
import { ProficiencyControl } from "@/components/proficiency";
import { Pagination } from "@/components/pagination";
import { useProficiency, LEVELS } from "@/lib/proficiency";
import { useUserPlans } from "@/lib/plans";
import { fetcher, type LearnResponse, type LearnRow } from "@/lib/api";

const PAGE_SIZE = 12;

export default function LearnPage() {
  const { data, isLoading } = useSWR<LearnResponse>("/api/learn", fetcher);
  const { map: prof, set, ready } = useProficiency();
  const plans = useUserPlans();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Plan composer
  const [newTitle, setNewTitle] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const [newTarget, setNewTarget] = useState("");

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

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const suggested = ranked.slice(0, 3);

  const overallPct = all.length
    ? (Object.entries(prof).reduce((sum, [, lvl]) => sum + lvl, 0) /
        (all.length * 5)) *
      100
    : 0;

  const addPlan = () => {
    if (!newTitle.trim()) return;
    plans.add({ title: newTitle.trim(), skill: newSkill.trim() || undefined, target: newTarget.trim() || undefined });
    setNewTitle(""); setNewSkill(""); setNewTarget("");
  };

  const pinned = plans.items.filter((p) => p.pinned && !p.done);
  const open = plans.items.filter((p) => !p.pinned && !p.done);
  const completed = plans.items.filter((p) => p.done);

  // Reset to page 1 when filter changes
  const onSearch = (v: string) => { setSearch(v); setPage(1); };

  return (
    <div className="space-y-14">
      <PageHeader
        eyebrow="02 · learn"
        title={<>One skill <em className="font-serif text-muted-foreground not-italic">at a time.</em></>}
        subtitle={<>Built from <span className="text-foreground font-medium">{data?.total_real ?? 0}</span> real junior jobs. Rate honestly. Highest-ROI gaps first.</>}
        action={<ScrapeButton />}
      />

      {/* Progress */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Overall readiness</h2>
          <span className="text-sm text-muted-foreground tabular-nums">{overallPct.toFixed(0)}%</span>
        </div>
        <Progress value={overallPct} className="h-1.5" />
      </section>

      {/* Focus this week — user-editable plan */}
      <section>
        <SectionHeading
          eyebrow="00"
          title="Focus this week"
          subtitle="Your plan: add what you actually want to master. Suggestions below are based on the job market."
        />

        {/* Plan composer */}
        <Card accentColor="violet" showAccentLine showCornerGlow className="mb-5">
          <CardContent className="p-5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_180px_auto] gap-2">
              <Input
                placeholder="What do you want to do? (e.g. Build a FastAPI auth flow)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addPlan(); }}
              />
              <Input
                placeholder="Skill (optional)"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
              />
              <Input
                placeholder="Target (e.g. by Fri)"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
              />
              <Button onClick={addPlan} disabled={!newTitle.trim()}>
                <Plus className="h-4 w-4 mr-1.5" />Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pinned + open plans */}
        {plans.ready && plans.items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            {[...pinned, ...open].map((p) => (
              <PlanItemCard
                key={p.id}
                title={p.title}
                skill={p.skill}
                target={p.target}
                pinned={p.pinned}
                done={p.done}
                onPin={() => plans.update(p.id, { pinned: !p.pinned })}
                onDone={() => plans.update(p.id, { done: !p.done })}
                onRemove={() => plans.remove(p.id)}
              />
            ))}
          </div>
        )}

        {/* Suggested from market */}
        {suggested.length > 0 && (
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-2">
              <Target className="h-3 w-3" /> Suggested — highest priority gaps
            </div>
            {isLoading || !ready ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (<Skeleton key={i} className="h-32 rounded-xl" />))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {suggested.map((row, i) => {
                  const lvl = prof[row.skill] ?? 0;
                  return (
                    <Card
                      key={row.skill}
                      accentColor={i === 0 ? "violet" : i === 1 ? "emerald" : "amber"}
                      showAccentLine
                      showCornerGlow
                      className="hover:-translate-y-0.5 transition-transform"
                    >
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-mono text-muted-foreground">#{i + 1}</div>
                          <button
                            onClick={() => plans.add({ title: `Master ${row.skill}`, skill: row.skill })}
                            className="text-[10px] font-mono uppercase tracking-wider text-primary hover:underline inline-flex items-center gap-1"
                            title="Add to my plan"
                          >
                            <Plus className="h-3 w-3" /> plan
                          </button>
                        </div>
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
          </div>
        )}

        {/* Completed collapsed */}
        {completed.length > 0 && (
          <details className="mt-5 group">
            <summary className="cursor-pointer text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground inline-flex items-center gap-2">
              <Check className="h-3 w-3" /> {completed.length} completed
            </summary>
            <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {completed.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-2 rounded-md bg-muted/30">
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="line-through flex-1 min-w-0 truncate">{p.title}</span>
                  <button onClick={() => plans.update(p.id, { done: false })} className="text-[10px] hover:text-foreground">restore</button>
                  <button onClick={() => plans.remove(p.id)} className="text-muted-foreground hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* All gaps list with pagination */}
      <section>
        <SectionHeading
          eyebrow="01"
          title="All gaps"
          subtitle="Click any row for resources, notes, and a milestone checklist."
        />
        <div className="relative max-w-md mb-4">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search skill"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
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
          <>
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

            <div className="mt-6">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                totalShown={filtered.length}
                total={filtered.length}
                onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              />
            </div>
          </>
        )}
      </section>

      {/* Levels — upgraded card grid */}
      <section>
        <SectionHeading
          eyebrow="02"
          title="Proficiency levels"
          subtitle="Tap a number above on any skill to set your level."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {LEVELS.map((l) => (
            <div
              key={l.value}
              className="rounded-xl border bg-card p-4 flex flex-col items-start gap-2 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <span className={`inline-grid place-items-center w-9 h-9 rounded-lg font-mono font-bold text-sm ${l.color} ring-1 ring-foreground/10`}>
                {l.short}
              </span>
              <div className="text-sm font-semibold">{l.label}</div>
              <div className="text-[10px] text-muted-foreground leading-relaxed">
                {LEVEL_DESC[l.value]}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const LEVEL_DESC: Record<number, string> = {
  0: "Not rated yet",
  1: "Aware it exists",
  2: "Tried once or twice",
  3: "Ship small things solo",
  4: "Ship production work",
  5: "Teach others, deep grasp",
};

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-mono text-muted-foreground mb-1">{eyebrow}</div>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

function PlanItemCard({
  title, skill, target, pinned, done, onPin, onDone, onRemove,
}: {
  title: string;
  skill?: string;
  target?: string;
  pinned: boolean;
  done: boolean;
  onPin: () => void;
  onDone: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={`group relative rounded-xl border bg-card p-4 transition-colors ${pinned ? "ring-1 ring-primary/40 bg-primary/[0.03]" : ""}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onDone}
          className={`mt-0.5 h-5 w-5 rounded-md border-2 grid place-items-center shrink-0 transition-colors ${
            done ? "bg-emerald-500 border-emerald-500" : "border-foreground/30 hover:border-primary"
          }`}
          aria-label={done ? "Mark not done" : "Mark done"}
        >
          {done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{title}</div>
          {(skill || target) && (
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {skill && (
                <Link href={`/learn/${encodeURIComponent(skill)}`} className="hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1">
                  <ListChecks className="h-3 w-3" /> {skill}
                </Link>
              )}
              {target && <span className="text-[11px] px-1.5 py-0.5 rounded bg-foreground/5">{target}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <button onClick={onPin} title={pinned ? "Unpin" : "Pin"} className="h-7 w-7 rounded-md hover:bg-accent grid place-items-center">
            {pinned ? <PinOff className="h-3.5 w-3.5 text-primary" /> : <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          <button onClick={onRemove} title="Remove" className="h-7 w-7 rounded-md hover:bg-rose-500/10 hover:text-rose-500 grid place-items-center text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
