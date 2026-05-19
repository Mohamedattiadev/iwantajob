"use client";

import useSWR from "swr";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, FileText, GraduationCap, Briefcase, Send, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrapeButton } from "@/components/scrape-button";
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

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="pt-2">
        <Badge variant="outline" className="mb-4 text-xs font-mono">launchpad</Badge>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
          {cvName ? `Hi, ${cvName.split(" ")[0]}.` : "From theory to hired."}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
          Real jobs, ghost-filtered. Mapped against the skills you actually have.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground font-mono">
          <Spec label="jobs" value={stats.data?.total} />
          <Spec label="real" value={stats.data?.real} />
          <Spec label="ready ≥70%" value={readyJobs.length} loading={jobsQ.isLoading} />
          <Spec label="rated" value={skillsRated} />
          <Spec label="applied" value={apps.data?.length} />
        </div>
        <div className="mt-7"><ScrapeButton /></div>
      </section>

      {/* 4-card grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FeatureCard
          eyebrow="01 · CV"
          icon={<FileText className="h-6 w-6" />}
          title="CV builder"
          desc={cvName ? `Profile: ${cvName} · ${Object.keys(profile.data?.skills ?? {}).length} skills` : "Upload your PDF. Auto-extract. Generate ATS-clean exports."}
          href="/cv"
          cta="Open builder"
        />
        <FeatureCard
          eyebrow="02 · Learn"
          icon={<GraduationCap className="h-6 w-6" />}
          title="Learning notebooks"
          desc={`Rate ${stats.data?.top_skills?.length ?? 0}+ skills 0–5. Each skill = real markdown notebook with curated resources.`}
          href="/learn"
          cta={skillsRated ? `Continue (${skillsRated} rated)` : "Start rating"}
        />
        <FeatureCard
          eyebrow="03 · Jobs"
          icon={<Briefcase className="h-6 w-6" />}
          title="Job finder"
          desc={`${stats.data?.real ?? 0} real listings, match-scored against your stack. Ghost listings filtered.`}
          href="/jobs"
          cta="See matches"
          highlight={readyJobs.length > 0 ? `${readyJobs.length} ready` : undefined}
        />
        <FeatureCard
          eyebrow="04 · Apply"
          icon={<Send className="h-6 w-6" />}
          title="Application tracker"
          desc={apps.data?.length ? `Tracking ${apps.data.length} applications. Status pipeline, auto-dedupe.` : "Mark applied with one click. Never apply twice."}
          href="/apply"
          cta="View pipeline"
        />
      </section>

      {/* Ready to apply */}
      <section>
        <SectionHeading
          eyebrow="ready to apply"
          title={readyJobs.length === 0 ? "No matches yet" : `Top ${Math.min(5, readyJobs.length)} matches`}
          subtitle={ready && skillsRated === 0 ? "Rate your skills on Learn to unlock matches." : "≥70% of required skills at Comfortable+."}
          link={{ href: "/jobs?min_score=70", label: "see all" }}
        />
        {jobsQ.isLoading || !ready ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : readyJobs.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            {skillsRated === 0 ? "Set proficiency on /learn first." : "No match. Keep learning."}
          </CardContent></Card>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {readyJobs.slice(0, 6).map(({ j, fit }) => (
              <li key={j.id}>
                <a
                  href={j.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 px-4 py-3 rounded-xl border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="w-14 text-center shrink-0">
                    <div className="text-lg font-semibold tabular-nums">{Math.round(fit * 100)}%</div>
                    <div className="text-[10px] text-muted-foreground font-mono">match</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium line-clamp-1">{j.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {j.company ?? "?"} · {j.source} · {j.posted_at?.slice(0, 10) ?? "—"}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t pt-6 text-sm text-muted-foreground max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-foreground mb-2">
          <Sparkles className="h-3.5 w-3.5" />Tip
        </div>
        <p>
          The chat bubble (bottom-right) reads your live profile + market data and gives concrete next steps.
          Needs <code className="text-foreground">ANTHROPIC_API_KEY</code> on the backend.
        </p>
      </section>
    </div>
  );
}

function FeatureCard({
  eyebrow,
  icon,
  title,
  desc,
  href,
  cta,
  highlight,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
  cta: string;
  highlight?: string;
}) {
  return (
    <Link href={href} className="block group">
      <Card className="h-full hover:border-foreground/30 transition-colors">
        <CardContent className="p-6 h-full flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="h-10 w-10 rounded-lg bg-foreground/5 grid place-items-center">{icon}</div>
            {highlight && <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">{highlight}</Badge>}
          </div>
          <div className="text-xs font-mono text-muted-foreground mt-2">{eyebrow}</div>
          <div className="text-2xl font-semibold tracking-tight">{title}</div>
          <p className="text-sm text-muted-foreground line-clamp-3">{desc}</p>
          <div className="mt-auto pt-3 text-sm inline-flex items-center gap-1 text-foreground group-hover:gap-2 transition-all">
            {cta} <ArrowRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Spec({ label, value, loading }: { label: string; value: number | undefined; loading?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-foreground font-semibold tabular-nums">{loading ? "…" : (value ?? 0)}</span>
      <span>{label}</span>
    </span>
  );
}

function SectionHeading({ eyebrow, title, subtitle, link }: { eyebrow: string; title: string; subtitle: string; link?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <div className="text-xs font-mono text-muted-foreground mb-1 uppercase tracking-wider">{eyebrow}</div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>
      {link && <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground whitespace-nowrap">{link.label} →</Link>}
    </div>
  );
}
