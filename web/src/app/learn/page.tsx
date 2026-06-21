"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowRight, Plus, ChevronDown, Target, Sparkles, X } from "lucide-react";
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
import { fetcher, type LearnResponse, type LearnRow, type Profile } from "@/lib/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { api as convexApi } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { AiSearchInput } from "@/components/ai-search-input";
import { SkillHoverCard } from "@/components/skill-hover-card";

const PAGE_SIZE = 12;
const TOP_N = 5;

export default function LearnPage() {
  const { data, isLoading } = useSWR<LearnResponse>("/api/learn", fetcher);
  const { map: prof, set, ready } = useProficiency();
  const plans = useUserPlans();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [goal, setGoal] = useState<string>("");
  const [goalDraft, setGoalDraft] = useState("");
  const [aiRanked, setAiRanked] = useState<{ skill: string; why: string }[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const profileData = useQuery(convexApi.profile.get) as Profile | undefined;
  const saveProfileMut = useMutation(convexApi.profile.save);
  const rerankAction = useAction(convexApi.chat.rerankSkills);
  const persistGoal = async (g: string) => {
    if (!profileData) return;
    const patched: Profile = {
      ...profileData,
      personal: { ...profileData.personal, goal: g } as Profile["personal"],
    };
    try {
      await saveProfileMut({ data: JSON.stringify(patched) });
    } catch { /* silent */ }
  };
  useEffect(() => {
    const storedGoal = (profileData?.personal as { goal?: string } | undefined)?.goal ?? "";
    if (storedGoal && !goal) {
      setGoal(storedGoal);
      setGoalDraft(storedGoal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData]);

  // Rehydrate AI rerank cache on mount so navigating away + back keeps results.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("learn:aiRanked");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { goal: string; ranked: { skill: string; why: string }[] };
      if (parsed?.ranked?.length && parsed.goal) {
        setAiRanked(parsed.ranked);
        if (!goal) {
          setGoal(parsed.goal);
          setGoalDraft(parsed.goal);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const top = ranked.slice(0, TOP_N);

  const rerankByGoal = async (g: string) => {
    if (!g.trim() || all.length === 0) return;
    setAiLoading(true);
    try {
      const candidates = ranked.slice(0, 40).map((r) => r.skill);
      const d = await rerankAction({ goal: g, candidates });
      if (d.error) throw new Error(d.error);
      const rankedRes = d.ranked || [];
      setAiRanked(rankedRes);
      setGoal(g);
      try { localStorage.setItem("learn:aiRanked", JSON.stringify({ goal: g, ranked: rankedRes })); } catch {}
      void persistGoal(g);
      toast.success(`Top 5 reranked for "${g}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rerank failed");
    } finally {
      setAiLoading(false);
    }
  };

  const clearGoal = () => {
    setGoal(""); setGoalDraft(""); setAiRanked(null);
    try { localStorage.removeItem("learn:aiRanked"); } catch {}
    void persistGoal("");
  };

  // If goal-ranked, use those skills (in that order); else market priority.
  const displayTop = useMemo(() => {
    if (!aiRanked) return top;
    const byName = new Map(all.map((r) => [r.skill.toLowerCase(), r]));
    return aiRanked
      .map((x) => byName.get(x.skill.toLowerCase()))
      .filter((r): r is (LearnRow & { onCv: boolean }) => !!r)
      .slice(0, TOP_N);
  }, [aiRanked, top, all]);
  const whyOf = (skill: string) =>
    aiRanked?.find((x) => x.skill.toLowerCase() === skill.toLowerCase())?.why;

  const filtered = useMemo(() => {
    if (!search) return ranked;
    const q = search.toLowerCase();
    return ranked.filter((r) => r.skill.toLowerCase().includes(q));
  }, [ranked, search]);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const overallPct = all.length
    ? (Object.entries(prof).reduce((sum, [, lvl]) => sum + lvl, 0) /
        (all.length * 5)) *
      100
    : 0;


  const onSearch = (v: string) => { setSearch(v); setPage(1); };

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="learn"
        title={<>What to learn <em className="font-serif text-muted-foreground not-italic">next.</em></>}
        subtitle={<>Ranked by what {data?.total_real ?? 0} real junior jobs want. Pick one. Rate yourself. Move on.</>}
        action={<ScrapeButton />}
      />

      {/* Overall readiness */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Readiness</span>
          <span className="text-sm tabular-nums">{overallPct.toFixed(0)}%</span>
        </div>
        <Progress value={overallPct} className="h-1.5" />
      </section>

      {/* Goal-driven rerank input */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Your goal
        </h2>
        <p className="text-xs text-muted-foreground">
          Tell the assistant what you&rsquo;re aiming for. It reranks Top 5 by relevance to that goal — not just raw market frequency.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. AI engineer, backend developer, devops, ML researcher"
            value={goalDraft}
            onChange={(e) => setGoalDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") rerankByGoal(goalDraft); }}
          />
          <Button onClick={() => rerankByGoal(goalDraft)} disabled={!goalDraft.trim() || aiLoading || all.length === 0}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            {aiLoading ? "Ranking..." : "Rank for goal"}
          </Button>
          {goal && (
            <Button variant="ghost" size="icon" onClick={clearGoal} title="Clear goal">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {goal && !aiLoading && (
          <div className="text-xs text-primary flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Top 5 ranked for: <b>{goal}</b>
          </div>
        )}
      </section>

      {/* Top priority skills — the meat */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Top {TOP_N} skills to learn</h2>
          <p className="text-sm text-muted-foreground">
            {aiRanked
              ? "AI-ranked for your goal above. Rate each — list updates."
              : "Ranked by market demand × your gap. Set a goal above for goal-specific ranking."}
          </p>
        </div>
        {isLoading || !ready ? (
          <div className="space-y-2">
            {Array.from({ length: TOP_N }).map((_, i) => (<Skeleton key={i} className="h-20 rounded-xl" />))}
          </div>
        ) : displayTop.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">All caught up. Scrape more jobs or check advanced below.</div>
        ) : (
          <ol className="space-y-2">
            {displayTop.map((row, i) => {
              const lvl = prof[row.skill] ?? 0;
              const why = whyOf(row.skill);
              return (
                <li key={row.skill}>
                <SkillHoverCard skill={row.skill} why={why}>
                <div className="px-4 py-3 rounded-xl border bg-card hover:bg-accent/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl font-mono text-muted-foreground tabular-nums w-8 shrink-0">{i + 1}</div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/learn/${encodeURIComponent(row.skill)}`} className="text-lg font-semibold hover:underline">{row.skill}</Link>
                        <Badge variant="outline" className="text-[10px] capitalize">{row.category}</Badge>
                        <span className="text-xs text-muted-foreground">{row.count} jobs ({row.pct}%)</span>
                      </div>
                      {why && (
                        <div className="text-xs text-primary/80 italic flex items-start gap-1">
                          <Sparkles className="h-3 w-3 mt-0.5 shrink-0" /> {why}
                        </div>
                      )}
                      <ProficiencyControl value={lvl} onChange={(v) => set(row.skill, v)} size="sm" />
                      <div className="flex items-center gap-3 text-xs">
                        <Link href={`/learn/${encodeURIComponent(row.skill)}`} className="text-primary hover:underline inline-flex items-center gap-1">
                          notes <ArrowRight className="h-3 w-3" />
                        </Link>
                        <Link href={`/jobs?skill=${encodeURIComponent(row.skill)}`} className="text-muted-foreground hover:text-foreground">
                          see jobs
                        </Link>
                        <button
                          onClick={() => plans.add({ title: `Master ${row.skill}`, skill: row.skill })}
                          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 ml-auto"
                        >
                          <Plus className="h-3 w-3" /> add to plan
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                </SkillHoverCard>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Advanced: full gap list + level reference */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          Advanced — all skills & level reference
        </summary>

        <div className="mt-6 space-y-8">
          {/* All gaps */}
          <section>
            <h3 className="text-base font-semibold mb-3">All gaps ({filtered.length})</h3>
            <div className="max-w-md mb-4">
              <AiSearchInput
                value={search}
                onChange={onSearch}
                placeholder="Search skill… (✨ AI normalizes name)"
                context="skills"
              />
            </div>
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No skills match.</div>
            ) : (
              <>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {visible.map((row) => {
                    const lvl = prof[row.skill] ?? 0;
                    return (
                      <li key={row.skill}>
                        <Link href={`/learn/${encodeURIComponent(row.skill)}`}
                          className="group block px-4 py-3 rounded-xl border bg-card hover:bg-accent/40 transition-colors h-full">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium group-hover:underline">{row.skill}</span>
                                {row.onCv && <Badge variant="secondary" className="text-[10px]">on CV</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">{row.count} jobs · lvl {lvl}/5</div>
                              <div className="mt-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
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
                <div className="mt-4">
                  <Pagination page={page} pageSize={PAGE_SIZE} totalShown={filtered.length} total={filtered.length}
                    onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                </div>
              </>
            )}
          </section>

          {/* Level reference */}
          <section>
            <h3 className="text-base font-semibold mb-3">Proficiency levels</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {LEVELS.map((l) => (
                <div key={l.value} className="rounded-lg border bg-card p-3">
                  <span className={`inline-grid place-items-center w-7 h-7 rounded-md font-mono font-bold text-xs ${l.color} ring-1 ring-foreground/10 mb-2`}>
                    {l.short}
                  </span>
                  <div className="text-xs font-semibold">{l.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{LEVEL_DESC[l.value]}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </details>
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

