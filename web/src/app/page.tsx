"use client";

import useSWR from "swr";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, FileText, GraduationCap, Briefcase, Send, Sparkles, BadgeCheck, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrapeButton } from "@/components/scrape-button";
import { MagicCard, Gradient, AnimatedNumber, Bento } from "@/components/eye-candy";
import { ShaderBackground } from "@/components/shader-background";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { fetcher, type Stats, type JobsResponse, type Profile, type Application } from "@/lib/api";
import { useProficiency } from "@/lib/proficiency";

export default function Home() {
  const stats = useSWR<Stats>("/api/stats", fetcher);
  const jobsQ = useSWR<JobsResponse>(
    "/api/jobs?seniority=junior_or_unknown&min_score=50&limit=500",
    fetcher,
  );
  const profile = useSWR<Profile>("/api/profile", fetcher);
  const apps = useSWR<Application[]>("/api/applications", fetcher);
  const { map: prof, ready } = useProficiency();

  const confidentSet = useMemo(
    () => new Set(Object.entries(prof).filter(([, v]) => v >= 3).map(([k]) => k)),
    [prof],
  );

  const readyJobs = useMemo(() => {
    if (!jobsQ.data) return [];
    return jobsQ.data.items
      .map((j) => ({ j, fit: (j.skills.filter((s) => confidentSet.has(s.skill)).length || 0) / Math.max(1, j.skills.length) }))
      .filter((x) => x.fit >= 0.7)
      .sort((a, b) => b.fit - a.fit);
  }, [jobsQ.data, confidentSet]);

  const skillsRated = Object.keys(prof).length;
  const cvName = profile.data?.personal?.name;
  const first = cvName?.split(" ")[0];

  return (
    <div className="relative space-y-16">
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-35 mix-blend-screen">
        <ShaderBackground />
      </div>

      <PageHeader
        eyebrow="launchpad"
        title={
          first ? (
            <>
              Hi, <Gradient>{first}.</Gradient>
            </>
          ) : (
            <>
              From theory <em className="font-serif text-muted-foreground not-italic">to</em>{" "}
              <Gradient>hired</Gradient>.
            </>
          )
        }
        subtitle="Real jobs, ghost-filtered. Mapped against the skills you actually have."
        action={<ScrapeButton />}
      />

      {/* Stat strip — compact key numbers */}
      <section className="anim-in border-y border-foreground/10 py-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 text-center sm:text-left">
        <Stat label="jobs"        value={stats.data?.total} />
        <Stat label="real"        value={stats.data?.real} accent="emerald" />
        <Stat label="ready ≥70%"  value={readyJobs.length} accent="indigo" />
        <Stat label="rated"       value={skillsRated} />
        <Stat label="applied"     value={apps.data?.length ?? 0} />
      </section>

      {/* Bento */}
      <section>
        <SectionTitle
          eyebrow="00 · workspace"
          title="Where to go next"
          subtitle="Four areas. One bubble for chat."
        />
        <Bento className="anim-in-stagger">
          <FeatureCard
            n="01" icon={<FileText className="h-5 w-5" />}
            title="CV builder"
            desc={cvName ? `${cvName} · ${Object.keys(profile.data?.skills ?? {}).length} skills` : "Upload PDF → parse → export ATS-clean."}
            href="/cv" cta="Open builder"
            glow="violet"
            className="lg:col-span-3"
          />
          <FeatureCard
            n="03" icon={<Briefcase className="h-5 w-5" />}
            title="Job finder"
            desc={`${stats.data?.real ?? 0} real listings, ghost-filtered, match-scored.`}
            href="/jobs" cta="See matches"
            highlight={readyJobs.length > 0 ? `${readyJobs.length} ready` : undefined}
            glow="emerald"
            className="lg:col-span-3"
          />
          <FeatureCard
            n="02" icon={<GraduationCap className="h-5 w-5" />}
            title="Notebooks"
            desc="Per-skill markdown. Curated. Editable. Persists."
            href="/learn"
            cta={skillsRated ? `Continue (${skillsRated})` : "Start rating"}
            glow="violet"
            className="lg:col-span-3"
          />
          <FeatureCard
            n="04" icon={<Send className="h-5 w-5" />}
            title="Pipeline"
            desc={apps.data?.length ? `${apps.data.length} tracked. Auto-dedupe.` : "One click apply. Never twice."}
            href="/apply" cta="View pipeline"
            glow="amber"
            className="lg:col-span-3"
          />
          <FeatureCard
            n="05" icon={<Pencil className="h-5 w-5" />}
            title="Sketch + voice"
            desc="Each Learn skill has Note · Sketch · Voice tabs. Draw, record memo, dictate notes."
            href="/learn" cta="Open Learn"
            glow="rose"
            className="lg:col-span-3"
          />
          <button
            onClick={() => window.dispatchEvent(new Event("open-chat"))}
            className="lg:col-span-3 text-left group"
          >
            <MagicCard glow="violet" className="h-full glass press hover:-translate-y-0.5 transition-transform">
              <CardContent className="p-5 sm:p-6 h-full flex flex-col gap-3">
                <Sparkles className="h-5 w-5 text-violet-400" />
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground mt-1">06 · chat</div>
                <div className="font-serif text-2xl sm:text-3xl leading-tight tracking-tight">Career coach</div>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  Reads live data, suggests next moves. Press <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-foreground/20 bg-foreground/5">⌘K</kbd> anytime.
                </p>
                <div className="mt-auto pt-2 text-sm inline-flex items-center gap-1 text-foreground group-hover:gap-2 transition-all">
                  Open coach <ArrowRight className="h-4 w-4" />
                </div>
              </CardContent>
            </MagicCard>
          </button>
        </Bento>
      </section>

      {/* Ready to apply */}
      <section className="anim-in">
        <SectionTitle
          eyebrow="ready to apply"
          title={readyJobs.length === 0 ? "No matches yet" : `Top ${Math.min(6, readyJobs.length)} matches`}
          subtitle={ready && skillsRated === 0 ? "Rate your skills on Learn to unlock matches." : "≥70% required skills at Comfortable+."}
          link={{ href: "/jobs?min_score=70", label: "see all" }}
        />
        {jobsQ.isLoading || !ready ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
          </div>
        ) : readyJobs.length === 0 ? (
          <div className="glass rounded-2xl py-14 text-center text-sm text-muted-foreground">
            {skillsRated === 0 ? "Set proficiency on /learn first." : "No match. Keep learning."}
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {readyJobs.slice(0, 6).map(({ j, fit }) => (
              <li key={j.id}>
                <MagicCard glow="emerald">
                  <a
                    href={j.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass flex items-center gap-4 px-5 py-4 rounded-2xl hover:bg-accent/30 transition-colors"
                  >
                    <div className="w-14 text-center shrink-0">
                      <div className="font-serif text-2xl leading-none">
                        <AnimatedNumber value={Math.round(fit * 100)} />
                        <span className="text-xs text-muted-foreground align-top ml-0.5">%</span>
                      </div>
                      <div className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider mt-1">match</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium line-clamp-1">{j.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {j.company ?? "?"} · {j.source} · {j.posted_at?.slice(0, 10) ?? "—"}
                      </div>
                    </div>
                    <BadgeCheck className="h-4 w-4 text-emerald-500/70" />
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </a>
                </MagicCard>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | undefined; accent?: "emerald" | "indigo" }) {
  const cls =
    accent === "emerald" ? "text-emerald-500"
    : accent === "indigo" ? "text-indigo-400"
    : "text-foreground";
  return (
    <div>
      <div className="font-serif text-3xl leading-none">
        {value === undefined ? (
          <span className={`tabular-nums ${cls} opacity-40`}>—</span>
        ) : (
          <AnimatedNumber value={value} className={cls} />
        )}
      </div>
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground mt-1.5">{label}</div>
    </div>
  );
}

function FeatureCard({
  n, icon, title, desc, href, cta, highlight, glow, className,
}: {
  n: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
  cta: string;
  highlight?: string;
  glow: "violet" | "emerald" | "amber" | "sky" | "slate" | "rose";
  className?: string;
}) {
  return (
    <Link href={href} className={`block group ${className ?? ""}`}>
      <Card accentColor={glow as "violet"|"emerald"|"amber"|"sky"|"slate"|"rose"} showAccentLine showCornerGlow className="h-full press hover:-translate-y-0.5 transition-transform">
        <CardContent className="p-5 sm:p-6 h-full flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="h-9 w-9 rounded-lg bg-foreground/5 grid place-items-center ring-1 ring-foreground/10">{icon}</div>
            {highlight && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/20">
                {highlight}
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground mt-1">{n}</div>
          <div className="font-serif text-2xl sm:text-3xl leading-tight tracking-tight">{title}</div>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{desc}</p>
          <div className="mt-auto pt-2 text-sm inline-flex items-center gap-1 text-foreground group-hover:gap-2 transition-all">
            {cta} <ArrowRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
