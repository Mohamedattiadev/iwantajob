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
  PenTool,
  Mic,
  FileText,
  Check,
  Plus,
  Trash2,
  ListChecks,
  Briefcase,
  X as XIcon,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useSkillMilestones } from "@/lib/milestones";
import { useUserPlans } from "@/lib/plans";
import { SkillSketch, SketchPreloader } from "@/components/skill-sketch";
import { VoiceRecorder } from "@/components/voice-recorder";
import { VoiceInputButton } from "@/components/voice-input";
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
  const plans = useUserPlans();
  const onPlan = plans.items.some((p) => !p.done && p.skill?.toLowerCase() === skill.toLowerCase());

  const [draft, setDraft] = useState<string>("");
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [tab, setTab] = useState<"note" | "sketch" | "voice">("note");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [panel, setPanel] = useState<null | "milestones" | "resources" | "jobs">(null);

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
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link
        href="/learn"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" />
        all skills
      </Link>

      {/* Compact header card */}
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-[10px] font-mono capitalize">{note?.category ?? "skill"}</Badge>
              {market && (
                <span className="text-xs text-muted-foreground">
                  {market.count} jobs · {market.pct}%
                </span>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">{skill}</h1>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (onPlan) { toast.info(`${skill} is already in your plan.`); return; }
                plans.add({ title: `Master ${skill}`, skill });
                toast.success(`Added "${skill}" to your plan`);
              }}
              disabled={onPlan}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all ${
                onPlan
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              {onPlan ? (<><Check className="h-3 w-3" /> On plan</>) : (<><Plus className="h-3 w-3" /> Add to plan</>)}
            </button>
          </div>
        </div>

        {/* Level row */}
        <div className="mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Your level</div>
          <div className="flex items-center gap-3">
            {ready && <ProficiencyLabel value={level} />}
            {ready && <ProficiencyControl value={level} onChange={(v) => set(skill, v)} />}
          </div>
        </div>
      </div>

      {/* Tabs — pill style */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/60 border">
        {([
          { id: "note",   label: "Notes",  icon: <FileText className="h-3.5 w-3.5" /> },
          { id: "sketch", label: "Sketch", icon: <PenTool className="h-3.5 w-3.5" /> },
          { id: "voice",  label: "Voice",  icon: <Mic className="h-3.5 w-3.5" /> },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 h-8 text-xs rounded-md inline-flex items-center gap-1.5 transition-colors ${
              tab === t.id ? "bg-background shadow-sm text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Main content full width — icon sidebar floats right; panel slides in on click */}
      <div className="relative">
        <div className="space-y-5 pr-12">

      {tab === "note" && (
        <>
          {/* Editor toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
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
              <VoiceInputButton
                onTranscript={(text) => {
                  setDraft((d) => d + (d.endsWith("\n") || d === "" ? "" : "\n") + text + "\n");
                  setDirty(true);
                  setMode("edit");
                }}
              />
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
                placeholder="Markdown... (use mic button to dictate)"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Ctrl+S saves. Mic button appends transcribed speech.
              </p>
            </div>
          ) : (
            <article className="prose prose-invert max-w-none prose-headings:tracking-tight prose-h1:text-3xl prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h3:text-base prose-pre:bg-muted prose-pre:border prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-li:my-1 prose-a:text-primary">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
            </article>
          )}
        </>
      )}

      <SketchPreloader />
      <div className={tab === "sketch" ? "" : "hidden"}>
        <SkillSketch skill={skill} />
      </div>
      {tab === "voice" && <VoiceRecorder skill={skill} />}

        </div>

        {/* Right icon column — always visible, like CV sidebar */}
        <nav className="absolute right-0 top-0 w-10 flex flex-col items-center gap-1 py-1 sticky-supports:sticky">
          {([
            { id: "milestones", icon: <ListChecks className="h-4 w-4" />, label: "Milestones" },
            { id: "resources",  icon: <BookOpen   className="h-4 w-4" />, label: `Resources (${resources.length})` },
            { id: "jobs",       icon: <Briefcase  className="h-4 w-4" />, label: `Jobs (${jobsQ.data?.items.length ?? 0})` },
          ] as const).map((it) => (
            <button
              key={it.id}
              onClick={() => setPanel(panel === it.id ? null : it.id)}
              title={it.label}
              className={`h-9 w-9 grid place-items-center rounded-lg transition-colors ${
                panel === it.id ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              }`}
            >
              {it.icon}
            </button>
          ))}
        </nav>

        {/* Slide-in panel */}
        {panel && (
          <>
            <div className="fixed inset-0 z-30 lg:hidden" onClick={() => setPanel(null)} />
            <aside className="fixed lg:absolute right-12 lg:right-12 top-[5rem] lg:top-0 z-40 w-[320px] max-h-[calc(100vh-6rem)] lg:max-h-[80vh] overflow-y-auto rounded-xl border bg-card shadow-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {panel === "milestones" ? "Milestones"
                   : panel === "resources" ? `Resources (${resources.length})`
                   : `Jobs wanting ${skill}`}
                </h3>
                <button onClick={() => setPanel(null)} className="text-muted-foreground hover:text-foreground">
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              {panel === "milestones" && <SkillMilestonesPanel skill={skill} />}

              {panel === "resources" && (
                resources.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No curated resources for this skill yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {resources.map((r) => <ResourceCard key={r.url} r={r} />)}
                  </ul>
                )
              )}

              {panel === "jobs" && (
                jobsQ.isLoading ? (
                  <div className="space-y-1.5">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
                  </div>
                ) : (jobsQ.data?.items.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No matching jobs yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {(jobsQ.data?.items ?? []).slice(0, 8).map((j) => (
                      <li key={j.id}>
                        <a href={j.source_url} target="_blank" rel="noopener noreferrer"
                           className="block px-3 py-2 rounded-lg border bg-card hover:bg-accent/40 transition-colors">
                          <div className="flex items-start gap-2">
                            <div className={`text-xs font-semibold tabular-nums shrink-0 mt-0.5 ${
                              j.score >= 80 ? "text-emerald-500" : j.score >= 60 ? "text-amber-500" : "text-muted-foreground"
                            }`}>{j.score}</div>
                            <div className="min-w-0">
                              <div className="font-medium line-clamp-1 text-xs">{j.title}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {j.company ?? "?"} · {j.source}
                              </div>
                            </div>
                          </div>
                        </a>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

function SkillMilestonesPanel({ skill }: { skill: string }) {
  const ms = useSkillMilestones(skill);
  const [adding, setAdding] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const pct = Math.round(ms.progress * 100);
  const doneCount = ms.items.filter((m) => m.done).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">{doneCount}/{ms.items.length}</span>
        <Progress value={pct} className="h-1 flex-1" />
        <button
          onClick={() => { if (confirm("Reset milestones to default?")) ms.reset(); }}
          className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
          title="Reset to default"
        >
          reset
        </button>
      </div>

      <Card><CardContent className="p-2.5 space-y-1">
        {ms.items.length === 0 && (
          <div className="text-xs text-muted-foreground py-2">No milestones yet. Add your first below.</div>
        )}
        {ms.items.map((m, i) => (
          <div key={m.id} className="group flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-accent/40 transition-colors">
            <button
              onClick={() => ms.toggle(m.id)}
              className={`mt-0.5 h-4.5 w-4.5 rounded border-2 grid place-items-center shrink-0 transition-colors ${
                m.done ? "bg-emerald-500 border-emerald-500" : "border-foreground/30 hover:border-primary"
              }`}
              style={{ height: "1.125rem", width: "1.125rem" }}
              aria-label={m.done ? "Mark not done" : "Mark done"}
            >
              {m.done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </button>
            <span className="font-mono text-[10px] text-muted-foreground mt-1 tabular-nums w-5 text-right shrink-0">{i + 1}.</span>
            {editId === m.id ? (
              <input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => { if (editText.trim() && editText !== m.text) ms.updateText(m.id, editText.trim()); setEditId(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditId(null);
                }}
                className="flex-1 bg-transparent border-b border-primary text-sm focus:outline-none"
              />
            ) : (
              <span
                onClick={() => { if (!m.done) { setEditId(m.id); setEditText(m.text); } }}
                className={`flex-1 text-sm cursor-text ${m.done ? "line-through text-muted-foreground" : ""}`}
              >
                {m.text}
              </span>
            )}
            <button
              onClick={() => ms.remove(m.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-rose-500 shrink-0"
              aria-label="Remove milestone"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-1 pt-1.5 mt-1 border-t border-foreground/8">
          <Plus className="h-3 w-3 text-muted-foreground ml-1" />
          <Input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && adding.trim()) { ms.add(adding); setAdding(""); }
            }}
            placeholder="Add milestone…"
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 px-1 text-xs h-7"
          />
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" disabled={!adding.trim()} onClick={() => { ms.add(adding); setAdding(""); }}>
            Add
          </Button>
        </div>
      </CardContent></Card>
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
