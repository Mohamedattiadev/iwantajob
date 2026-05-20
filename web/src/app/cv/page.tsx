"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Download, FileText, Upload, Save, RotateCcw, ExternalLink, User, Briefcase, GraduationCap, Code, Folder, Check, PanelRightClose, Columns2, Maximize2 } from "lucide-react";
import { AiRewrite } from "@/components/ai-rewrite";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { API, fetcher, type Profile } from "@/lib/api";
import { LEVELS } from "@/lib/proficiency";
import { PageHeader } from "@/components/page-header";

type Section = "personal" | "experience" | "projects" | "education" | "skills";

export default function CvPage() {
  const { data, mutate, isLoading } = useSWR<Profile>("/api/profile", fetcher);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [minLevel, setMinLevel] = useState(3);
  const [mdPreview, setMdPreview] = useState<string>("");
  const [section, setSection] = useState<Section>("personal");
  const [viewMode, setViewMode] = useState<"edit" | "split" | "preview">("split");
  const [autoSaved, setAutoSaved] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data && !draft) setDraft(structuredClone(data));
  }, [data, draft]);

  useEffect(() => {
    fetch(`${API}/api/cv/markdown?min_level=${minLevel}`).then(r => r.text()).then(setMdPreview).catch(() => {});
  }, [minLevel, data]);

  // Auto-save: 800ms after last edit
  useEffect(() => {
    if (!dirty || !draft) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/profile`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: draft }),
        });
        if (r.ok) {
          await mutate();
          setDirty(false);
          setAutoSaved(Date.now());
          // Refresh preview
          fetch(`${API}/api/cv/markdown?min_level=${minLevel}`).then(r => r.text()).then(setMdPreview).catch(() => {});
        }
      } catch { /* silent */ }
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [draft, dirty, mutate, minLevel]);

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
    setDirty(true);
  };

  const updatePersonal = (k: keyof Profile["personal"], v: string) => {
    if (!draft) return;
    setDraft({ ...draft, personal: { ...draft.personal, [k]: v } as Profile["personal"] });
    setDirty(true);
  };

  const updateLink = (k: keyof Profile["personal"]["links"], v: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      personal: {
        ...draft.personal,
        links: { ...draft.personal.links, [k]: v },
      },
    });
    setDirty(true);
  };

  const save = async () => {
    if (!draft) return;
    try {
      const r = await fetch(`${API}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: draft }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      await mutate();
      setDirty(false);
      toast.success("Profile saved");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(`${API}/api/cv/upload`, { method: "POST", body: form });
      if (!r.ok) throw new Error(`${r.status}`);
      const body = (await r.json()) as { profile: Profile; meta: { skills_detected: number } };
      setDraft(structuredClone(body.profile));
      await mutate(body.profile, false);
      setDirty(false);
      toast.success(`Parsed: ${body.meta.skills_detected} skills detected`);
    } catch (e) {
      toast.error(`Upload failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setUploading(false);
    }
  };

  if (isLoading || !draft) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  const skillsList = Object.entries(draft.skills ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="01 · cv"
        title={<>Your CV, <em className="font-serif text-muted-foreground not-italic">built live.</em></>}
        subtitle="Upload PDF to bootstrap. Edit anything. As you rate skills on Learn, the CV updates automatically. Export ATS-clean MD / HTML / LaTeX."
      />

      {/* Upload + actions */}
      <Card accentColor="violet" showAccentLine showCornerGlow>
        <CardContent className="p-5 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf,text/plain"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="hidden"
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Parsing..." : "Upload CV (PDF)"}
          </Button>
          <Button variant="outline" disabled={!dirty} onClick={save}>
            <Save className="h-4 w-4 mr-2" />Save profile
          </Button>
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            {dirty ? (
              <><span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />unsaved</>
            ) : autoSaved ? (
              <><Check className="h-3 w-3 text-emerald-500" />saved</>
            ) : (
              <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />synced</>
            )}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden lg:inline-flex items-center rounded-md border bg-card p-0.5">
              {([
                { k: "edit",    icon: <PanelRightClose className="h-3.5 w-3.5" />, label: "Edit"    },
                { k: "split",   icon: <Columns2 className="h-3.5 w-3.5" />,        label: "Split"   },
                { k: "preview", icon: <Maximize2 className="h-3.5 w-3.5" />,       label: "Preview" },
              ] as const).map(o => (
                <button
                  key={o.k}
                  onClick={() => setViewMode(o.k)}
                  className={`h-7 px-2.5 rounded-sm text-xs inline-flex items-center gap-1.5 transition-colors ${
                    viewMode === o.k ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
                  }`}
                  title={o.label}
                >
                  {o.icon}<span className="hidden xl:inline">{o.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Min level:</label>
              <select
                className="bg-card border rounded px-2 py-1 text-sm"
                value={minLevel}
                onChange={(e) => setMinLevel(parseInt(e.target.value))}
              >
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.value} – {l.label}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className={`grid grid-cols-1 ${viewMode === "split" ? "lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]" : ""} gap-8`}>
        {viewMode !== "preview" && (
        <div className="space-y-5 min-w-0">
          <SectionTabs section={section} onChange={setSection} counts={{
            personal: 0,
            experience: draft.experience.length,
            projects: draft.projects.length,
            education: draft.education.length,
            skills: skillsList.length,
          }} />

          {section === "personal" && (
            <Card accentColor="violet" showAccentLine><CardContent className="p-5 space-y-3">
              <SectionHeader icon={<User className="h-4 w-4" />} title="Personal" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Name"><Input value={draft.personal.name} onChange={(e) => updatePersonal("name", e.target.value)} /></Field>
                <Field label="Email"><Input value={draft.personal.email} onChange={(e) => updatePersonal("email", e.target.value)} /></Field>
                <Field label="Phone"><Input value={draft.personal.phone} onChange={(e) => updatePersonal("phone", e.target.value)} /></Field>
                <Field label="Location"><Input value={draft.personal.location} onChange={(e) => updatePersonal("location", e.target.value)} /></Field>
                <Field label="GitHub"><Input value={draft.personal.links.github ?? ""} onChange={(e) => updateLink("github", e.target.value)} /></Field>
                <Field label="LinkedIn"><Input value={draft.personal.links.linkedin ?? ""} onChange={(e) => updateLink("linkedin", e.target.value)} /></Field>
                <Field label="Portfolio"><Input value={draft.personal.links.portfolio ?? ""} onChange={(e) => updateLink("portfolio", e.target.value)} /></Field>
              </div>
              <Field
                label="Summary"
                action={
                  <AiRewrite
                    field="summary"
                    current={draft.personal.summary}
                    onApply={(t) => updatePersonal("summary", t)}
                  />
                }
              >
                <Textarea rows={4} value={draft.personal.summary} onChange={(e) => updatePersonal("summary", e.target.value)} placeholder="One paragraph: who you are, what you build." />
              </Field>
            </CardContent></Card>
          )}

          {section === "experience" && (
            <ListEditor
              title="Experience"
              icon={<Briefcase className="h-4 w-4" />}
              field="experience"
              placeholder="Role at Company, dates, bullets..."
              items={draft.experience}
              onChange={(v) => update("experience", v)}
            />
          )}
          {section === "projects" && (
            <ListEditor
              title="Projects"
              icon={<Folder className="h-4 w-4" />}
              field="project"
              placeholder="Project name + 1-2 line summary + tech"
              items={draft.projects}
              onChange={(v) => update("projects", v)}
            />
          )}
          {section === "education" && (
            <ListEditor
              title="Education"
              icon={<GraduationCap className="h-4 w-4" />}
              field="education"
              placeholder="School, degree, dates, GPA"
              items={draft.education}
              onChange={(v) => update("education", v)}
            />
          )}
          {section === "skills" && (
            <Card accentColor="emerald" showAccentLine showCornerGlow><CardContent className="p-5 space-y-3">
              <SectionHeader icon={<Code className="h-4 w-4" />} title="Skills" />
              {skillsList.length === 0 ? (
                <p className="text-sm text-muted-foreground">Rate skills in Learn — they appear here automatically.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {skillsList.map(([s, lvl]) => {
                    const L = LEVELS[lvl] ?? LEVELS[0];
                    return (
                      <li key={s}>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs ${L.color}`}>
                          <span className="font-mono font-bold">{L.short}</span>
                          {s}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Skills with level ≥ {minLevel} appear in your generated CV.</p>
            </CardContent></Card>
          )}
        </div>
        )}

        {/* Preview pane */}
        {viewMode !== "edit" && (
          <div className={`${viewMode === "split" ? "lg:sticky lg:top-20 lg:self-start" : ""} space-y-3 min-w-0`}>
            <CVPreview minLevel={minLevel} mdPreview={mdPreview} bust={data?.personal?.name ?? ""} fullHeight={viewMode === "preview"} />
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTabs({
  section,
  onChange,
  counts,
}: {
  section: Section;
  onChange: (s: Section) => void;
  counts: Record<Section, number>;
}) {
  const items: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: "personal",   label: "Personal",   icon: <User className="h-3.5 w-3.5" /> },
    { key: "experience", label: "Experience", icon: <Briefcase className="h-3.5 w-3.5" /> },
    { key: "projects",   label: "Projects",   icon: <Folder className="h-3.5 w-3.5" /> },
    { key: "education",  label: "Education",  icon: <GraduationCap className="h-3.5 w-3.5" /> },
    { key: "skills",     label: "Skills",     icon: <Code className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl glass">
      {items.map((it) => {
        const active = section === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                : "text-foreground/65 hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            {it.icon}
            {it.label}
            {it.key !== "personal" && counts[it.key] > 0 && (
              <span className={`ml-0.5 text-[10px] tabular-nums px-1.5 rounded-full ${active ? "bg-white/20" : "bg-foreground/10"}`}>
                {counts[it.key]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground inline-flex items-center gap-2">
      {icon}{title}
    </div>
  );
}

type TemplateInfo = { id: string; name: string; desc: string };

function CVPreview({
  minLevel,
  mdPreview,
  bust,
  fullHeight = false,
}: {
  minLevel: number;
  mdPreview: string;
  bust: string;
  fullHeight?: boolean;
}) {
  const frameH = fullHeight ? "h-[88vh]" : "h-[78vh]";
  const [tab, setTab] = useState<"page" | "md" | "tex">("page");
  const [template, setTemplate] = useState<string>(() => {
    if (typeof window === "undefined") return "classic";
    return localStorage.getItem("cv:template") || "classic";
  });
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const v = encodeURIComponent(bust + ":" + minLevel + ":" + template);
  const [pdfOk, setPdfOk] = useState(false);
  useEffect(() => {
    fetch(`${API}/api/cv/pdf/available`).then(r => r.json()).then(d => setPdfOk(!!d.available)).catch(() => {});
    fetch(`${API}/api/cv/templates`).then(r => r.json()).then(d => setTemplates(d.templates ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    try { localStorage.setItem("cv:template", template); } catch {}
  }, [template]);

  return (
    <Card accentColor="violet" showAccentLine showCornerGlow><CardContent className="p-0">
      {/* Sticky export toolbar — primary PDF CTA + secondary formats */}
      <div className="sticky top-0 z-20 px-4 sm:px-5 pt-4 pb-3 bg-card/85 backdrop-blur-xl border-b border-foreground/8 rounded-t-xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground inline-flex items-center gap-2 shrink-0">
              <FileText className="h-3.5 w-3.5" /> Live preview
            </div>
            <div className="inline-flex items-center rounded-md border bg-card p-0.5">
              {(["page", "md", "tex"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`h-7 px-3 rounded-sm text-xs uppercase font-mono tracking-wider transition-colors ${
                    tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
                  }`}
                >
                  {t === "page" ? "page" : t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Secondary exports — icon-only */}
            <a href={`${API}/api/cv/markdown?min_level=${minLevel}`} download="cv.md"
               title="Download Markdown (.md)"
               className="inline-flex items-center gap-1 h-9 px-2.5 rounded-md border border-border bg-card hover:bg-accent text-xs font-mono text-foreground/80 transition-colors">
              <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">md</span>
            </a>
            <a href={`${API}/api/cv/tex?min_level=${minLevel}`} download="cv.tex"
               title="Download LaTeX source (.tex)"
               className="inline-flex items-center gap-1 h-9 px-2.5 rounded-md border border-border bg-card hover:bg-accent text-xs font-mono text-foreground/80 transition-colors">
              <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">tex</span>
            </a>
            <a href={`${API}/api/cv/html?min_level=${minLevel}&template=${template}`} target="_blank" rel="noopener noreferrer"
               title="Open HTML — use browser Print → Save as PDF"
               className="inline-flex items-center gap-1 h-9 px-2.5 rounded-md border border-border bg-card hover:bg-accent text-xs font-mono text-foreground/80 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" /><span className="hidden sm:inline">html</span>
            </a>

            {/* Primary CTA — Download PDF */}
            {pdfOk ? (
              <a href={`${API}/api/cv/pdf?min_level=${minLevel}`} target="_blank" rel="noopener noreferrer"
                 className="ml-1 inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 hover:-translate-y-0.5 transition-all">
                <Download className="h-4 w-4" /> Download PDF
              </a>
            ) : (
              <a href={`${API}/api/cv/html?min_level=${minLevel}&template=${template}`} target="_blank" rel="noopener noreferrer"
                 title="Server texlive not installed — falls back to HTML, use browser Print → Save as PDF"
                 className="ml-1 inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 hover:-translate-y-0.5 transition-all">
                <Download className="h-4 w-4" /> Get PDF
                <span className="text-[10px] font-mono opacity-80 border-l border-white/30 pl-2">via print</span>
              </a>
            )}
          </div>
        </div>

        {/* Template picker — only matters for HTML/PDF preview */}
        {tab === "page" && templates.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground mr-1">Template</span>
            {templates.map((t) => {
              const active = template === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id)}
                  title={t.desc}
                  className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "border border-border bg-card text-foreground/70 hover:bg-accent"
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {tab === "page" && (
        <div className="px-3 pb-3">
          <div className="rounded-lg overflow-hidden border bg-white">
            <iframe
              key={v}
              src={`${API}/api/cv/html?min_level=${minLevel}&template=${template}&v=${v}`}
              className={`w-full ${frameH} bg-white`}
              title="CV preview"
              sandbox=""
            />
          </div>
        </div>
      )}

      {tab === "md" && (
        <div className="px-5 pb-5">
          <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap max-h-[88vh] overflow-auto p-4 rounded-lg bg-muted/40 border">{mdPreview}</pre>
        </div>
      )}

      {tab === "tex" && (
        <LatexPane minLevel={minLevel} bust={v} />
      )}

      <p className="px-5 py-3 text-[10px] text-muted-foreground leading-relaxed border-t border-foreground/8">
        ATS-clean exports. HTML + LaTeX are single-column, no images — every Applicant Tracking System parses them.
        {pdfOk ? null : (
          <> Direct <code className="font-mono">.pdf</code> needs <code className="font-mono">pdflatex</code> on backend (<code className="font-mono">sudo pacman -S texlive-most</code>). Until then, &ldquo;Get PDF&rdquo; opens HTML for browser Print → Save as PDF.</>
        )}
      </p>
    </CardContent></Card>
  );
}

function LatexPane({ minLevel, bust }: { minLevel: number; bust: string }) {
  const [tex, setTex] = useState("");
  useEffect(() => {
    fetch(`${API}/api/cv/tex?min_level=${minLevel}&v=${bust}`).then(r => r.text()).then(setTex).catch(() => {});
  }, [minLevel, bust]);
  return (
    <div className="px-5 pb-5">
      <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap max-h-[88vh] overflow-auto p-4 rounded-lg bg-muted/40 border">{tex}</pre>
    </div>
  );
}

function Field({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        {action}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function ListEditor({
  title,
  items,
  onChange,
  placeholder,
  icon,
  field,
}: {
  title: string;
  items: { raw?: string }[];
  onChange: (v: { raw?: string }[]) => void;
  placeholder: string;
  icon?: React.ReactNode;
  field: "experience" | "project" | "education" | "generic";
}) {
  return (
    <Card accentColor="amber" showAccentLine><CardContent className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground inline-flex items-center gap-2">{icon}{title}</div>
        <span className="text-[10px] text-muted-foreground tabular-nums">{items.length} {items.length === 1 ? "entry" : "entries"}</span>
      </div>
      {items.map((it, i) => {
        const raw = (it.raw as string) ?? JSON.stringify(it);
        return (
        <div key={i} className="space-y-1.5 p-3 rounded-lg bg-foreground/[0.025] border border-border/60">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono text-muted-foreground tabular-nums">#{i + 1}</span>
            <div className="flex items-center gap-1.5">
              <AiRewrite
                field={field}
                current={raw}
                label="AI polish"
                onApply={(t) => {
                  const next = [...items];
                  next[i] = { raw: t };
                  onChange(next);
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                title="Remove"
                className="h-7 text-[11px] text-muted-foreground hover:text-rose-500"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />Remove
              </Button>
            </div>
          </div>
          <Textarea
            rows={3}
            value={raw}
            onChange={(e) => {
              const next = [...items];
              next[i] = { raw: e.target.value };
              onChange(next);
            }}
            placeholder={placeholder}
            className="text-sm w-full"
          />
        </div>
        );
      })}
      <Button variant="outline" size="sm" onClick={() => onChange([...items, { raw: "" }])}>
        + Add entry
      </Button>
    </CardContent></Card>
  );
}
