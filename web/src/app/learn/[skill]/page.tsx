"use client";

import { use, useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  Pencil,
  RotateCcw,
  Save,
  CheckCircle2,
  BookOpen,
  GraduationCap,
  Video,
  Hammer,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { API, fetcher, type LearnResponse, type JobsResponse } from "@/lib/api";
import { useProficiency } from "@/lib/proficiency";
import { ProficiencyControl, ProficiencyLabel } from "@/components/proficiency";
import { resourcesFor, type Resource } from "@/lib/resources";

type NoteResp = { skill: string; category: string; content: string };

export default function SkillPage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill: rawSkill } = use(params);
  const skill = decodeURIComponent(rawSkill);

  const noteUrl = `/api/notes/${encodeURIComponent(skill)}`;
  const { data: note, mutate } = useSWR<NoteResp>(noteUrl, fetcher);
  const learn = useSWR<LearnResponse>("/api/learn", fetcher);
  const jobsQ = useSWR<JobsResponse>(
    `/api/jobs?skill=${encodeURIComponent(skill)}&min_score=50&limit=6`,
    fetcher,
  );
  const { map: prof, set, ready } = useProficiency();

  const [draft, setDraft] = useState<string>("");
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (note?.content !== undefined) {
      setDraft(note.content);
      setDirty(false);
    }
  }, [note?.content]);

  const market =
    learn.data?.gaps.find((g) => g.skill === skill) ??
    learn.data?.have.find((h) => h.skill === skill);
  const level = prof[skill] ?? 0;
  const resources = resourcesFor(skill);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}${noteUrl}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      await mutate({ skill, category: note?.category ?? "skill", content: draft }, false);
      setDirty(false);
      toast.success("Saved");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm(`Reset ${skill} note to starter template? Your edits will be lost.`)) return;
    const r = await fetch(`${API}${noteUrl}/reset`, { method: "POST" });
    const data = (await r.json()) as { content: string };
    setDraft(data.content);
    await mutate({ skill, category: note?.category ?? "skill", content: data.content }, false);
    setDirty(false);
    toast.info("Reset to starter");
  };

  // Auto-save on Ctrl+S in edit mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && mode === "edit") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, draft]);

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/learn"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-5"
        >
          <ArrowLeft className="h-3 w-3" />
          back to all skills
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge variant="outline" className="mb-3 text-xs font-mono capitalize">
              {note?.category ?? "skill"}
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
              {skill}
            </h1>
            {market && (
              <p className="text-sm text-muted-foreground mt-3">
                Appears in <span className="text-foreground font-medium">{market.count}</span>{" "}
                real junior jobs ({market.pct}%)
              </p>
            )}
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <div className="text-xs text-muted-foreground">Your level</div>
            {ready && <ProficiencyControl value={level} onChange={(v) => set(skill, v)} />}
            {ready && <ProficiencyLabel value={level} />}
          </div>
        </div>
      </div>

      {/* Editor toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="inline-flex items-center rounded-md border bg-card p-0.5">
          <button
            onClick={() => setMode("preview")}
            className={`h-7 px-3 rounded-sm text-xs inline-flex items-center gap-1.5 ${
              mode === "preview" ? "bg-accent" : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />Preview
          </button>
          <button
            onClick={() => setMode("edit")}
            className={`h-7 px-3 rounded-sm text-xs inline-flex items-center gap-1.5 ${
              mode === "edit" ? "bg-accent" : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <Pencil className="h-3.5 w-3.5" />Edit
          </button>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-500">unsaved</span>}
          {!dirty && note && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />saved</span>}
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Reset
          </Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Editor */}
      {!note ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : mode === "edit" ? (
        <div>
          <Textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
            rows={28}
            spellCheck={false}
            className="font-mono text-sm leading-relaxed"
            placeholder="Markdown..."
          />
          <p className="text-xs text-muted-foreground mt-2">
            Ctrl+S saves. File persists at <code>scraper/data/notes/</code> on the backend.
          </p>
        </div>
      ) : (
        <article className="prose prose-invert max-w-none prose-headings:tracking-tight prose-h1:text-3xl prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h3:text-base prose-pre:bg-muted prose-pre:border prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-li:my-1 prose-a:text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
        </article>
      )}

      {/* Resources */}
      {resources.length > 0 && (
        <section>
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">
            Curated resources
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {resources.map((r) => <ResourceCard key={r.url} r={r} />)}
          </ul>
        </section>
      )}

      {/* Jobs */}
      <section>
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">
          Jobs that want {skill}
        </h2>
        {jobsQ.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (jobsQ.data?.items.length ?? 0) === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No real jobs currently list this skill.</CardContent></Card>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(jobsQ.data?.items ?? []).map((j) => (
              <li key={j.id}>
                <a
                  href={j.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3 rounded-xl border bg-card hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`text-base font-semibold tabular-nums shrink-0 ${
                      j.score >= 80 ? "text-emerald-500" : j.score >= 60 ? "text-amber-500" : "text-muted-foreground"
                    }`}>{j.score}</div>
                    <div className="min-w-0">
                      <div className="font-medium line-clamp-1 text-sm">{j.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {j.company ?? "?"} · {j.source} · {j.posted_at?.slice(0, 10) ?? "—"}
                      </div>
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ResourceCard({ r }: { r: Resource }) {
  const Icon = r.kind === "video" ? Video
    : r.kind === "course" ? GraduationCap
    : r.kind === "project" ? Hammer
    : BookOpen;
  return (
    <li>
      <a
        href={r.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card hover:bg-accent/40 transition-colors text-sm"
      >
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate">{r.title}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.kind}</span>
        <ExternalLink className="h-3 w-3 text-muted-foreground" />
      </a>
    </li>
  );
}
