"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import Link from "next/link";
import dynamic from "next/dynamic";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Eye,
  Maximize2,
  Minimize2,
  Pencil,
  PenTool,
  RotateCcw,
  Save,
  CheckCircle2,
  BookOpen,
  GraduationCap,
  Video,
  Hammer,
  Mic,
  FileText,
  Check,
  Plus,
  Trash2,
  ListChecks,
  Briefcase,
  X,
} from "lucide-react";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false },
);
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useSkillMilestones } from "@/lib/milestones";
import { useUserPlans } from "@/lib/plans";
import { VoiceRecorder } from "@/components/voice-recorder";
import { VoiceInputButton } from "@/components/voice-input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { fetcher, type LearnResponse, type JobsResponse } from "@/lib/api";
import { useProficiency } from "@/lib/proficiency";
import { ProficiencyControl, ProficiencyLabel } from "@/components/proficiency";
import { resourcesFor, type Resource } from "@/lib/resources";
import { useUserResources } from "@/lib/user-resources";

export default function SkillPage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill: rawSkill } = use(params);
  const skill = decodeURIComponent(rawSkill);

  const note = useQuery(api.notes.get, { skill });
  const saveNote = useMutation(api.notes.save);
  const resetNote = useMutation(api.notes.reset);
  const learn = useSWR<LearnResponse>("/api/learn", fetcher);
  const jobsRaw = useQuery(api.jobs.list, {
    skill,
    min_score: 50,
    limit: 6,
  });
  const jobsQ = { data: jobsRaw as JobsResponse | undefined, isLoading: jobsRaw === undefined };
  const { map: prof, set, ready } = useProficiency();
  const plans = useUserPlans();
  const onPlan = plans.items.some((p) => !p.done && p.skill?.toLowerCase() === skill.toLowerCase());

  const [draft, setDraft] = useState<string>("");
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  type Tab = "note" | "voice" | "sketch" | "milestones" | "resources" | "jobs";
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "note";
    const v = localStorage.getItem(`learn:tab:${skill}`) as Tab | null;
    return v && ["note", "voice", "sketch", "milestones", "resources", "jobs"].includes(v) ? v : "note";
  });
  useEffect(() => {
    try { localStorage.setItem(`learn:tab:${skill}`, tab); } catch {}
  }, [tab, skill]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const userRes = useUserResources(skill);

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
      await saveNote({ skill, content: draft, category: note?.category });
      setDirty(false);
      toast.success("Saved");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    const blob = new Blob([draft || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = skill.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
    a.href = url;
    a.download = `${safe || "note"}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const reset = async () => {
    if (!confirm(`Reset ${skill} note to starter template? Your edits will be lost.`)) return;
    const data = await resetNote({ skill, category: note?.category });
    setDraft(data.content);
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
    <div className="space-y-6">
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
                if (onPlan) {
                  const target = plans.items.find((p) => !p.done && p.skill?.toLowerCase() === skill.toLowerCase());
                  if (target) {
                    plans.remove(target.id);
                    toast.info(`Removed "${skill}" from your plan`);
                  }
                } else {
                  plans.add({ title: `Master ${skill}`, skill });
                  toast.success(`Added "${skill}" to your plan`);
                }
              }}
              title={onPlan ? "Click to remove from plan" : "Add to plan"}
              className={`group inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all ${
                onPlan
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300 hover:ring-rose-500/30"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              {onPlan ? (
                <>
                  <Check className="h-3 w-3 group-hover:hidden" />
                  <X className="h-3 w-3 hidden group-hover:inline" />
                  <span className="group-hover:hidden">On plan</span>
                  <span className="hidden group-hover:inline">Remove</span>
                </>
              ) : (
                <><Plus className="h-3 w-3" /> Add to plan</>
              )}
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

      {/* Unified tab strip — workspace tabs on left, side-panel tabs on right */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-1">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/60 border">
          {([
            { id: "note",   label: "Notes",  icon: <FileText className="h-3.5 w-3.5" /> },
            { id: "voice",  label: "Voice",  icon: <Mic className="h-3.5 w-3.5" /> },
            { id: "sketch", label: "Sketch", icon: <PenTool className="h-3.5 w-3.5" /> },
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
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/60 border">
          {([
            { id: "milestones", label: "Milestones", icon: <ListChecks className="h-3.5 w-3.5" />, badge: undefined as number | undefined },
            { id: "resources",  label: "Resources",  icon: <BookOpen   className="h-3.5 w-3.5" />, badge: resources.length + userRes.items.length },
            { id: "jobs",       label: "Jobs",       icon: <Briefcase  className="h-3.5 w-3.5" />, badge: jobsQ.data?.items.length ?? 0 },
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
              {t.badge !== undefined && t.badge > 0 && (
                <span className={`ml-0.5 px-1.5 rounded-full text-[9px] tabular-nums ${tab === t.id ? "bg-primary/15 text-primary" : "bg-foreground/10 text-muted-foreground"}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-5">

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
              <Button variant="outline" size="sm" onClick={download} title="Download as .md" disabled={!draft}>
                <Download className="h-3.5 w-3.5 mr-1.5" />Download
              </Button>
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
            <article className="prose dark:prose-invert max-w-none prose-headings:tracking-tight prose-h1:text-3xl prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h3:text-base prose-pre:bg-muted prose-pre:border prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-li:my-1 prose-a:text-primary">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
            </article>
          )}
        </>
      )}

      {tab === "voice" && <VoiceRecorder skill={skill} />}

      {tab === "sketch" && <SkillSketch skill={skill} />}

      {tab === "milestones" && (
        <Card><CardContent className="p-4">
          <SkillMilestonesPanel skill={skill} />
        </CardContent></Card>
      )}

      {tab === "resources" && (
        <ResourcesPane
          skill={skill}
          curated={resources}
          user={userRes.items}
          onAdd={userRes.add}
          onRemove={userRes.remove}
        />
      )}

      {tab === "jobs" && (
        jobsQ.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : (jobsQ.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground italic py-8 text-center">No matching jobs yet. Try scraping.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(jobsQ.data?.items ?? []).map((j) => (
              <li key={j.id}>
                <a href={j.source_url} target="_blank" rel="noopener noreferrer"
                   className="block px-4 py-3 rounded-lg border bg-card hover:bg-accent/40 transition-colors h-full">
                  <div className="flex items-start gap-3">
                    <div className={`text-base font-semibold tabular-nums shrink-0 ${
                      j.score >= 80 ? "text-emerald-500" : j.score >= 60 ? "text-amber-500" : "text-muted-foreground"
                    }`}>{j.score}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium line-clamp-1 text-sm">{j.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {j.company ?? "?"} · {j.source}
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )
      )}

      </div>
    </div>
  );
}

function SkillSketch({ skill }: { skill: string }) {
  const slug = `skill:${skill}`;
  const saved = useQuery(api.sketches.get, { slug });
  const saveSketchMut = useMutation(api.sketches.save);
  const [initial, setInitial] = useState<ExcalidrawInitialDataState | null | undefined>(undefined);
  const [full, setFull] = useState(false);
  const [api_, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [toolbarEl, setToolbarEl] = useState<HTMLElement | null>(null);
  const [miniSvg, setMiniSvg] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const miniTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (initial !== undefined) return;
    if (saved === undefined) return;
    if (saved === null) { setInitial(null); return; }
    try {
      const parsed = JSON.parse(saved.data_json) as ExcalidrawInitialDataState & { appState?: Record<string, unknown> };
      if (parsed.appState) {
        const next: Record<string, unknown> = { ...parsed.appState };
        delete next.collaborators;
        parsed.appState = next;
      }
      setInitial(parsed);
    } catch {
      setInitial(null);
    }
  }, [saved, initial]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  useEffect(() => {
    const find = (): boolean => {
      const root: ParentNode = wrapRef.current ?? document;
      const eraser = root.querySelector('[data-testid="toolbar-eraser"]') as HTMLElement | null;
      const stack = (eraser?.closest(".Stack_horizontal") as HTMLElement | null)
        ?? document.querySelector<HTMLElement>(".App-toolbar .Stack_horizontal");
      if (stack) { setToolbarEl(stack); return true; }
      return false;
    };
    if (find()) return;
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (find() || tries > 40) clearInterval(id);
    }, 150);
    return () => clearInterval(id);
  }, [full, initial]);

  const refreshMinimap = useCallback(async () => {
    if (!api_) return;
    const elements = api_.getSceneElements();
    if (!elements.length) { setMiniSvg(null); return; }
    try {
      const mod = await import("@excalidraw/excalidraw");
      const svg = await mod.exportToSvg({
        elements,
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff" } as never,
        files: api_.getFiles(),
      });
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      setMiniSvg(new XMLSerializer().serializeToString(svg));
    } catch {
      /* ignore */
    }
  }, [api_]);

  useEffect(() => { refreshMinimap(); }, [refreshMinimap]);

  // Mark loaded a tick after initial data settles so onChange doesn't
  // persist an empty scene before hydration completes.
  useEffect(() => {
    if (initial === undefined) return;
    const t = setTimeout(() => { loadedRef.current = true; }, 200);
    return () => clearTimeout(t);
  }, [initial]);

  const onChange = useCallback(
    (elements: unknown, appState: unknown, files: unknown) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (!loadedRef.current) return;
        void saveSketchMut({
          slug,
          data: JSON.stringify({ elements, appState, files }),
        });
      }, 500);
      if (miniTimer.current) clearTimeout(miniTimer.current);
      miniTimer.current = setTimeout(() => { refreshMinimap(); }, 600);
    },
    [slug, saveSketchMut, refreshMinimap],
  );

  const fitAll = () => {
    if (!api_) return;
    const elements = api_.getSceneElements();
    if (elements.length) api_.scrollToContent(elements, { fitToContent: true });
  };

  if (initial === undefined) return <Skeleton className="h-[75vh] w-full rounded-xl" />;

  const wrapClass = full
    ? "fixed inset-0 z-50 bg-background overflow-hidden"
    : "relative h-[75vh] w-full rounded-xl border overflow-hidden";

  return (
    <div ref={wrapRef} className={wrapClass}>
      <Excalidraw
        initialData={initial}
        onChange={onChange as never}
        excalidrawAPI={(a) => setApi(a)}
      />
      {toolbarEl && createPortal(
        <>
          <div className="App-toolbar__divider" />
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            title={full ? "Exit fullscreen (Esc)" : "Fullscreen"}
            aria-label={full ? "Exit fullscreen" : "Fullscreen"}
            style={{
              height: 36,
              width: 36,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--default-border-color, #6965db)",
              borderRadius: 6,
              background: "var(--button-bg, #fff)",
              color: "var(--text-primary-color, #1b1b1f)",
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {full ? (
                <>
                  <path d="M4 14h6v6" /><path d="M20 10h-6V4" /><path d="M14 10l7-7" /><path d="M3 21l7-7" />
                </>
              ) : (
                <>
                  <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
                </>
              )}
            </svg>
          </button>
        </>,
        toolbarEl,
      )}
      <div className="absolute bottom-3 right-3 z-10 w-44 h-32 rounded-md border bg-white/95 dark:bg-neutral-900/95 shadow-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-2 py-1 border-b text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>minimap</span>
          <button onClick={fitAll} title="Fit all" className="hover:text-foreground">fit</button>
        </div>
        <div className="flex-1 bg-white overflow-hidden flex items-center justify-center">
          {miniSvg ? (
            <div className="w-full h-full p-1" dangerouslySetInnerHTML={{ __html: miniSvg }} />
          ) : (
            <span className="text-[10px] text-muted-foreground italic">empty</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourcesPane({
  skill, curated, user, onAdd, onRemove,
}: {
  skill: string;
  curated: Resource[];
  user: Resource[];
  onAdd: (r: Resource) => void;
  onRemove: (url: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<Resource["kind"]>("docs");

  const submit = () => {
    if (!title.trim() || !url.trim()) {
      toast.error("Title + URL required");
      return;
    }
    try { new URL(url); } catch { toast.error("Invalid URL"); return; }
    if (user.some((r) => r.url === url) || curated.some((r) => r.url === url)) {
      toast.warning("Already in list");
      return;
    }
    onAdd({ title: title.trim(), url: url.trim(), kind });
    setTitle(""); setUrl(""); setKind("docs");
    toast.success("Resource added");
  };

  const KINDS: Resource["kind"][] = ["docs", "course", "video", "book", "project"];

  return (
    <div className="space-y-4">
      {/* Add form */}
      <Card><CardContent className="p-3 sm:p-4 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
          Add resource for {skill}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2">
          <Input placeholder="Title (e.g. 'Beta CSS series')" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Resource["kind"])}
            className="h-9 px-2 rounded-md border bg-background text-sm"
          >
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <Button onClick={submit} disabled={!title.trim() || !url.trim()}>
            <Plus className="h-4 w-4 mr-1" />Add
          </Button>
        </div>
      </CardContent></Card>

      {/* Your additions */}
      {user.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Your additions</div>
          <ul className="space-y-1.5">
            {user.map((r) => <ResourceCard key={r.url} r={r} onRemove={() => onRemove(r.url)} />)}
          </ul>
        </div>
      )}

      {/* Curated */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Curated</div>
        {curated.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No curated resources for {skill} yet — add your own above.</p>
        ) : (
          <ul className="space-y-1.5">
            {curated.map((r) => <ResourceCard key={r.url} r={r} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function SkillMilestonesPanel({ skill }: { skill: string }) {
  const ms = useSkillMilestones(skill);
  const [adding, setAdding] = useState("");
  type MId = (typeof ms.items)[number]["_id"];
  const [editId, setEditId] = useState<MId | null>(null);
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
          <div key={m._id} className="group flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-accent/40 transition-colors">
            <button
              onClick={() => ms.toggle(m._id)}
              className={`mt-0.5 h-4.5 w-4.5 rounded border-2 grid place-items-center shrink-0 transition-colors ${
                m.done ? "bg-emerald-500 border-emerald-500" : "border-foreground/30 hover:border-primary"
              }`}
              style={{ height: "1.125rem", width: "1.125rem" }}
              aria-label={m.done ? "Mark not done" : "Mark done"}
            >
              {m.done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </button>
            <span className="font-mono text-[10px] text-muted-foreground mt-1 tabular-nums w-5 text-right shrink-0">{i + 1}.</span>
            {editId === m._id ? (
              <input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => { if (editText.trim() && editText !== m.text) ms.updateText(m._id, editText.trim()); setEditId(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditId(null);
                }}
                className="flex-1 bg-transparent border-b border-primary text-sm focus:outline-none"
              />
            ) : (
              <span
                onClick={() => { if (!m.done) { setEditId(m._id); setEditText(m.text); } }}
                className={`flex-1 text-sm cursor-text ${m.done ? "line-through text-muted-foreground" : ""}`}
              >
                {m.text}
              </span>
            )}
            <button
              onClick={() => ms.remove(m._id)}
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

function ResourceCard({ r, onRemove }: { r: Resource; onRemove?: () => void }) {
  const Icon = r.kind === "video" ? Video
    : r.kind === "course" ? GraduationCap
    : r.kind === "project" ? Hammer
    : BookOpen;
  return (
    <li className="group">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-card hover:bg-accent/40 transition-colors text-sm">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:underline">
          {r.title}
        </a>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.kind}</span>
        <ExternalLink className="h-3 w-3 text-muted-foreground" />
        {onRemove && (
          <button
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-rose-500 ml-1"
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}
