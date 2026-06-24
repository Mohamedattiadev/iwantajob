"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download, FileText, Upload, Save, RotateCcw, ExternalLink,
  User, Briefcase, GraduationCap, Code, Folder, Check,
  PanelLeftClose, PanelLeft, Columns2, Maximize2, PanelRightClose,
  ChevronDown,
} from "lucide-react";
import { AiRewrite } from "@/components/ai-rewrite";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { API, type Profile } from "@/lib/api";
import { LEVELS } from "@/lib/proficiency";
import { useAction, useMutation, useQuery } from "convex/react";
import { api as convexApi } from "../../../convex/_generated/api";
import { renderMarkdown, renderHtml, CV_TEMPLATES } from "@/lib/cv-render";
import { renderTex } from "@/lib/cv-tex";

type Section = "personal" | "experience" | "projects" | "education" | "skills";
type ViewMode = "edit" | "split" | "preview";
type TemplateInfo = { id: string; name: string; desc: string };

const SECTION_ITEMS: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: "personal",   label: "Personal",   icon: <User className="h-4 w-4" /> },
  { key: "experience", label: "Experience", icon: <Briefcase className="h-4 w-4" /> },
  { key: "projects",   label: "Projects",   icon: <Folder className="h-4 w-4" /> },
  { key: "education",  label: "Education",  icon: <GraduationCap className="h-4 w-4" /> },
  { key: "skills",     label: "Skills",     icon: <Code className="h-4 w-4" /> },
];

export default function CvPage() {
  const data = useQuery(convexApi.profile.get) as Profile | undefined;
  const saveProfileMut = useMutation(convexApi.profile.save);
  const uploadCv = useAction(convexApi.cv.upload);
  const isLoading = data === undefined;
  const mutate = async () => {/* convex auto-refetches */};
  const [draft, setDraft] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [minLevel, setMinLevel] = useState(3);
  const [mdPreview, setMdPreview] = useState<string>("");
  const [section, setSection] = useState<Section>("personal");
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [autoSaved, setAutoSaved] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Preview state (lifted from CVPreview so sidebar can control template/tab)
  const [previewTab, setPreviewTab] = useState<"page" | "md" | "tex">("page");
  const [template, setTemplate] = useState<string>(() => {
    if (typeof window === "undefined") return "compact";
    return localStorage.getItem("cv:template") || "compact";
  });
  const [templates] = useState<TemplateInfo[]>(CV_TEMPLATES);
  const [pdfOk, setPdfOk] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const downloadClientPdf = async () => {
    if (!draft || pdfBusy) return;
    setPdfBusy(true);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = "794px";
    iframe.style.height = "1123px";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
    try {
      const html = renderHtml(draft, minLevel, template, false);
      const doc = iframe.contentDocument;
      if (!doc) throw new Error("iframe doc unavailable");
      doc.open();
      doc.write(html);
      doc.close();
      await new Promise<void>((resolve) => {
        if (doc.readyState === "complete") resolve();
        else iframe.onload = () => resolve();
      });
      // Let fonts/layout settle
      await new Promise((r) => setTimeout(r, 100));
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const body = doc.body;
      const canvas = await html2canvas(body, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 794,
        windowWidth: 794,
      });
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const A4_W = 210;
      const A4_H = 297;
      const imgRatio = canvas.height / canvas.width;
      let pdfW = A4_W;
      let pdfH = pdfW * imgRatio;
      if (pdfH > A4_H) {
        pdfH = A4_H;
        pdfW = pdfH / imgRatio;
      }
      const x = (A4_W - pdfW) / 2;
      const y = 0;
      const img = canvas.toDataURL("image/png");
      pdf.addImage(img, "PNG", x, y, pdfW, pdfH);
      pdf.save(`cv-${template}.pdf`);
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error(`PDF failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      document.body.removeChild(iframe);
      setPdfBusy(false);
    }
  };

  useEffect(() => {
    if (data && !draft) setDraft(structuredClone(data));
  }, [data, draft]);

  useEffect(() => {
    if (data) setMdPreview(renderMarkdown(data, minLevel));
  }, [minLevel, data]);

  useEffect(() => {
    // PDF still rendered by FastAPI (LaTeX); HTML/templates are local.
    fetch(`${API}/api/cv/pdf/available`).then(r => r.json()).then(d => setPdfOk(!!d.available)).catch(() => setPdfOk(false));
  }, []);

  // Memoize rendered HTML + LaTeX blob URLs. Recompute when profile / minLevel
  // / template change. URL.revokeObjectURL on teardown avoids leaks.
  const [htmlUrl, setHtmlUrl] = useState<string>("");
  const [texUrl, setTexUrl] = useState<string>("");
  const [texSource, setTexSource] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [pdfErr, setPdfErr] = useState<string>("");
  useEffect(() => {
    if (!draft) return;
    const html = renderHtml(draft, minLevel, template);
    const tex = renderTex(draft, minLevel, template);
    setTexSource(tex);
    const htmlBlob = new Blob([html], { type: "text/html;charset=utf-8" });
    const texBlob = new Blob([tex], { type: "application/x-tex;charset=utf-8" });
    const hUrl = URL.createObjectURL(htmlBlob);
    const tUrl = URL.createObjectURL(texBlob);
    setHtmlUrl(hUrl);
    setTexUrl(tUrl);
    return () => {
      URL.revokeObjectURL(hUrl);
      URL.revokeObjectURL(tUrl);
    };
  }, [draft, minLevel, template]);

  // Compile the client-rendered .tex to a per-user PDF blob by POSTing it to
  // FastAPI's stateless /pdf-from-tex compile endpoint. The legacy GET /pdf
  // route loaded a shared on-disk profile.json which leaked the same CV to
  // every authenticated user — this path keeps the profile inside Convex.
  useEffect(() => {
    if (!texSource || !pdfOk) { setPdfUrl(""); return; }
    let cancelled = false;
    let createdUrl = "";
    (async () => {
      try {
        const r = await fetch(`${API}/api/cv/pdf-from-tex`, {
          method: "POST",
          headers: { "Content-Type": "application/x-tex" },
          body: texSource,
        });
        if (!r.ok) throw new Error(`compile ${r.status}`);
        const blob = await r.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setPdfUrl(createdUrl);
        setPdfErr("");
      } catch (e) {
        if (!cancelled) setPdfErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [texSource, pdfOk]);

  useEffect(() => {
    try { localStorage.setItem("cv:template", template); } catch {}
  }, [template]);

  // Auto-save: 800ms after last edit
  useEffect(() => {
    if (!dirty || !draft) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveProfileMut({ data: JSON.stringify(draft) });
        setDirty(false);
        setAutoSaved(Date.now());
        setMdPreview(renderMarkdown(draft, minLevel));
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
      await saveProfileMut({ data: JSON.stringify(draft) });
      setDirty(false);
      toast.success("Profile saved");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const upload = async (file: File) => {
    if (file.size > 4_000_000) {
      toast.error(`File too large (${(file.size / 1_000_000).toFixed(1)}MB). Max 4MB.`);
      return;
    }
    setUploading(true);
    try {
      const ab = await file.arrayBuffer();
      const body = await uploadCv({ filename: file.name, data: ab });
      setDraft(structuredClone(body.profile as Profile));
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
  const counts: Record<Section, number> = {
    personal: 0,
    experience: draft.experience.length,
    projects: draft.projects.length,
    education: draft.education.length,
    skills: skillsList.length,
  };

  const v = encodeURIComponent((data?.personal?.name ?? "") + ":" + minLevel + ":" + template);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="01 · cv"
        title={<>Your CV, <em className="font-serif text-muted-foreground not-italic">built live.</em></>}
        subtitle="Upload a PDF to bootstrap. Edit anything. As you rate skills on Learn, the CV updates automatically. Export ATS-clean MD / HTML / LaTeX."
      />

      <div className={`cv-builder ${viewMode === "split" ? "cv-builder--wide" : ""}`}>
      {/* ── Sidebar ── */}
      <aside className={`cv-sidebar ${sidebarOpen ? "cv-sidebar--open" : "cv-sidebar--collapsed"}`}>
        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="cv-sidebar__toggle"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </button>

        {/* ── Sections nav ── */}
        <div className="cv-sidebar__group">
          {sidebarOpen && <div className="cv-sidebar__label">Sections</div>}
          <nav className="cv-sidebar__nav">
            {SECTION_ITEMS.map((it) => {
              const active = section === it.key;
              return (
                <button
                  key={it.key}
                  onClick={() => { setSection(it.key); if (viewMode === "preview") setViewMode("split"); }}
                  className={`cv-sidebar__nav-item ${active ? "cv-sidebar__nav-item--active" : ""}`}
                  title={it.label}
                >
                  {it.icon}
                  {sidebarOpen && (
                    <>
                      <span className="cv-sidebar__nav-label">{it.label}</span>
                      {it.key !== "personal" && counts[it.key] > 0 && (
                        <span className={`cv-sidebar__badge ${active ? "cv-sidebar__badge--active" : ""}`}>
                          {counts[it.key]}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {sidebarOpen && <div className="cv-sidebar__divider" />}

        {/* ── Upload / Save ── */}
        {sidebarOpen && (
        <div className="cv-sidebar__group">
          <div className="cv-sidebar__label">Actions</div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf,text/plain"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="cv-sidebar__action-btn cv-sidebar__action-btn--primary"
            title="Upload CV (PDF)"
          >
            <Upload className="h-4 w-4" />
            <span>{uploading ? "Parsing..." : "Upload CV"}</span>
          </button>
          <button
            onClick={save}
            disabled={!dirty}
            className="cv-sidebar__action-btn"
            title="Save profile"
          >
            <Save className="h-4 w-4" />
            <span>Save</span>
          </button>
          <div className="cv-sidebar__sync-status">
            {dirty ? (
              <><span className="cv-sidebar__dot cv-sidebar__dot--dirty" />unsaved</>
            ) : autoSaved ? (
              <><Check className="h-3 w-3 text-emerald-500" />saved</>
            ) : (
              <><span className="cv-sidebar__dot cv-sidebar__dot--synced" />synced</>
            )}
          </div>
        </div>
        )}

        {/* Push view + export to bottom */}
        <div className="cv-sidebar__spacer" />

        <div className="cv-sidebar__divider" />

        {/* ── View mode ── */}
        <div className="cv-sidebar__group">
          {sidebarOpen && <div className="cv-sidebar__label">View</div>}
          {([
            { k: "edit" as ViewMode,    icon: <PanelRightClose className="h-3.5 w-3.5" />, label: "Edit"    },
            { k: "split" as ViewMode,   icon: <Columns2 className="h-3.5 w-3.5" />,        label: "Split"   },
            { k: "preview" as ViewMode, icon: <Maximize2 className="h-3.5 w-3.5" />,       label: "Preview" },
          ]).map(o => (
            <button
              key={o.k}
              onClick={() => setViewMode(o.k)}
              className={`cv-sidebar__nav-item ${viewMode === o.k ? "cv-sidebar__nav-item--active" : ""}`}
              title={o.label}
            >
              {o.icon}
              {sidebarOpen && <span className="cv-sidebar__nav-label">{o.label}</span>}
            </button>
          ))}
        </div>

        {sidebarOpen && <div className="cv-sidebar__divider" />}

        {/* ── Min level ── */}
        {sidebarOpen && (
        <div className="cv-sidebar__group">
          <div className="cv-sidebar__label">Min skill level</div>
          <select
            className="cv-sidebar__select"
            value={minLevel}
            onChange={(e) => setMinLevel(parseInt(e.target.value))}
          >
            {LEVELS.map(l => <option key={l.value} value={l.value}>{l.value} – {l.label}</option>)}
          </select>
        </div>
        )}


        {/* ── Templates ── */}
        {sidebarOpen && templates.length > 0 && (
          <div className="cv-sidebar__group">
            <div className="cv-sidebar__label">Template</div>
            <div className="cv-sidebar__templates">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  title={t.desc}
                  className={`cv-sidebar__template-btn ${template === t.id ? "cv-sidebar__template-btn--active" : ""}`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cv-sidebar__divider" />

        {/* ── Export ── */}
        <div className="cv-sidebar__group">
          {sidebarOpen && (
          <>
            <div className="cv-sidebar__label">Export</div>
            <div className="cv-sidebar__export">
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([mdPreview], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "cv.md";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 0);
                }}
                title="Download Markdown" className="cv-sidebar__export-btn">
                <Download className="h-3.5 w-3.5" />
                <span>md</span>
              </button>
              <a href={texUrl} download="cv.tex"
                 title="Download LaTeX" className="cv-sidebar__export-btn">
                <Download className="h-3.5 w-3.5" />
                <span>tex</span>
              </a>
              <a href={htmlUrl} target="_blank" rel="noopener noreferrer"
                 title="Open HTML" className="cv-sidebar__export-btn">
                <ExternalLink className="h-3.5 w-3.5" />
                <span>html</span>
              </a>
            </div>
          </>
          )}
          {pdfOk ? (
            sidebarOpen ? (
              <div className="cv-sidebar__pdf-row">
                <a href={pdfUrl || htmlUrl}
                   target="_blank" rel="noopener noreferrer"
                   className="cv-sidebar__pdf-btn cv-sidebar__pdf-btn--primary" title={`Open ${template} PDF in new tab`}>
                  <ExternalLink className="h-4 w-4" />
                  <span>Open PDF</span>
                </a>
                <a href={pdfUrl || htmlUrl}
                   download={`cv-${template}.pdf`}
                   className="cv-sidebar__pdf-btn cv-sidebar__pdf-btn--icon" title={`Download ${template} PDF`}>
                  <Download className="h-4 w-4" />
                </a>
              </div>
            ) : (
              <a href={pdfUrl || htmlUrl}
                 download={`cv-${template}.pdf`}
                 className="cv-sidebar__pdf-btn" title={`Download ${template} PDF`}>
                <Download className="h-4 w-4" />
              </a>
            )
          ) : (
            <button
              type="button"
              onClick={downloadClientPdf}
              disabled={pdfBusy}
              className="cv-sidebar__pdf-btn"
              title={`Download ${template} PDF`}
            >
              <Download className="h-4 w-4" />
              {sidebarOpen && <span>{pdfBusy ? "Building..." : "Get PDF"}</span>}
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="cv-main">
        <div className={`cv-main__grid ${viewMode === "split" ? "cv-main__grid--split" : ""}`}>
          {/* Editor */}
          {viewMode !== "preview" && (
            <div className="cv-main__editor">
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

                  {/* Fit preferences — drives the "hide jobs I can't apply to" filter on /jobs. */}
                  <div className="pt-4 mt-2 border-t border-border/60 space-y-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Fit preferences</div>
                    <Field label="Target work types">
                      <div className="flex flex-wrap gap-1.5">
                        {(["intern", "working-student", "junior", "mid", "senior"] as const).map((wt) => {
                          const cur = draft.personal.workTypes ?? [];
                          const on = cur.includes(wt);
                          return (
                            <button
                              key={wt}
                              type="button"
                              onClick={() => {
                                const next = on ? cur.filter((x) => x !== wt) : [...cur, wt];
                                setDraft({ ...draft, personal: { ...draft.personal, workTypes: next } });
                              }}
                              className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                                on
                                  ? "bg-primary/15 text-primary border-primary/40"
                                  : "bg-muted text-muted-foreground border-border hover:text-foreground"
                              }`}
                            >
                              {wt}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field label="Years of experience">
                        <Input
                          type="number"
                          min={0}
                          max={50}
                          value={draft.personal.yearsExperience ?? 0}
                          onChange={(e) => setDraft({
                            ...draft,
                            personal: { ...draft.personal, yearsExperience: Number(e.target.value) || 0 },
                          })}
                        />
                      </Field>
                      <Field label="Open to relocation">
                        <label className="inline-flex items-center gap-2 h-9 text-sm">
                          <input
                            type="checkbox"
                            checked={draft.personal.openToRelocation ?? false}
                            onChange={(e) => setDraft({
                              ...draft,
                              personal: { ...draft.personal, openToRelocation: e.target.checked },
                            })}
                          />
                          <span className="text-muted-foreground">Yes, I'll move</span>
                        </label>
                      </Field>
                      <Field label="Open to remote">
                        <label className="inline-flex items-center gap-2 h-9 text-sm">
                          <input
                            type="checkbox"
                            checked={draft.personal.openToRemote ?? true}
                            onChange={(e) => setDraft({
                              ...draft,
                              personal: { ...draft.personal, openToRemote: e.target.checked },
                            })}
                          />
                          <span className="text-muted-foreground">Remote OK</span>
                        </label>
                      </Field>
                    </div>
                  </div>
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

          {/* Preview */}
          {viewMode !== "edit" && (
            <div className={`cv-main__preview ${viewMode === "preview" ? "cv-main__preview--full" : ""}`}>
              <Card accentColor="violet" showAccentLine showCornerGlow><CardContent className="p-0">
                {/* Minimal preview header */}
                <div className="sticky top-0 z-20 px-4 pt-3 pb-2.5 bg-card/85 backdrop-blur-xl border-b border-foreground/8 rounded-t-xl">
                  <div className="flex items-center gap-3">
                    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground inline-flex items-center gap-2 shrink-0">
                      <FileText className="h-3.5 w-3.5" /> Live preview
                    </div>
                    <div className="inline-flex items-center rounded-md border bg-card p-0.5">
                      {(["page", "md", "tex"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setPreviewTab(t)}
                          className={`h-7 px-3 rounded-sm text-xs uppercase font-mono tracking-wider transition-colors ${
                            previewTab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
                          }`}
                        >
                          {t === "page" ? "page" : t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {previewTab === "page" && (
                  <div className="px-3 pb-3">
                    <div className="rounded-lg overflow-hidden border bg-white">
                      {(pdfUrl || htmlUrl) ? (
                        <iframe
                          key={pdfUrl || htmlUrl}
                          src={(pdfOk && pdfUrl)
                            ? `${pdfUrl}#toolbar=0&navpanes=0`
                            : htmlUrl}
                          className={`w-full ${viewMode === "preview" ? "h-[88vh]" : "h-[82vh]"} bg-white`}
                          title="CV preview"
                          sandbox={pdfOk && pdfUrl ? undefined : ""}
                        />
                      ) : (
                        <div className={`w-full ${viewMode === "preview" ? "h-[88vh]" : "h-[82vh]"} bg-white grid place-items-center text-xs text-muted-foreground`}>
                          Rendering preview…
                        </div>
                      )}
                    </div>
                    {pdfOk && (
                      <p className="px-1 pt-2 text-[10px] text-muted-foreground">
                        Preview = exact PDF render. What you see = what downloads.
                      </p>
                    )}
                  </div>
                )}

                {previewTab === "md" && (
                  <div className="px-5 pb-5">
                    <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap max-h-[85vh] overflow-auto p-4 rounded-lg bg-muted/40 border">{mdPreview}</pre>
                  </div>
                )}

                {previewTab === "tex" && (
                  <div className="px-5 pb-5">
                    <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap max-h-[85vh] overflow-auto p-4 rounded-lg bg-muted/40 border">{texSource}</pre>
                  </div>
                )}

                <p className="px-5 py-3 text-[10px] text-muted-foreground leading-relaxed border-t border-foreground/8">
                  ATS-clean exports. HTML + LaTeX are single-column, no images — every ATS parses them.
                </p>
              </CardContent></Card>
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  );
}

/* ── Helper components ── */

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground inline-flex items-center gap-2">
      {icon}{title}
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
