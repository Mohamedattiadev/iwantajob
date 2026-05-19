"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Download, FileText, Upload, Save, RotateCcw, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { API, fetcher, type Profile } from "@/lib/api";
import { LEVELS } from "@/lib/proficiency";

export default function CvPage() {
  const { data, mutate, isLoading } = useSWR<Profile>("/api/profile", fetcher);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [minLevel, setMinLevel] = useState(3);
  const [mdPreview, setMdPreview] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data && !draft) setDraft(structuredClone(data));
  }, [data, draft]);

  useEffect(() => {
    fetch(`${API}/api/cv/markdown?min_level=${minLevel}`).then(r => r.text()).then(setMdPreview).catch(() => {});
  }, [minLevel, data]);

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
      <header>
        <Badge variant="outline" className="mb-3 text-xs font-mono">step 01 · cv</Badge>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
          Your CV, built live.
        </h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
          Upload an existing PDF to bootstrap. Edit. As you rate skills on Learn, the CV updates automatically. Export ATS-clean markdown or HTML.
        </p>
      </header>

      {/* Upload + actions */}
      <Card>
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
          <span className="text-xs text-muted-foreground">
            {dirty ? "unsaved changes" : "synced"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Min level to include:</label>
            <select
              className="bg-card border rounded px-2 py-1 text-sm"
              value={minLevel}
              onChange={(e) => setMinLevel(parseInt(e.target.value))}
            >
              {LEVELS.map(l => <option key={l.value} value={l.value}>{l.value} – {l.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Edit form */}
        <div className="space-y-5">
          <Card><CardContent className="p-5 space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Personal</div>
            <Field label="Name"><Input value={draft.personal.name} onChange={(e) => updatePersonal("name", e.target.value)} /></Field>
            <Field label="Email"><Input value={draft.personal.email} onChange={(e) => updatePersonal("email", e.target.value)} /></Field>
            <Field label="Phone"><Input value={draft.personal.phone} onChange={(e) => updatePersonal("phone", e.target.value)} /></Field>
            <Field label="Location"><Input value={draft.personal.location} onChange={(e) => updatePersonal("location", e.target.value)} /></Field>
            <Field label="GitHub"><Input value={draft.personal.links.github ?? ""} onChange={(e) => updateLink("github", e.target.value)} /></Field>
            <Field label="LinkedIn"><Input value={draft.personal.links.linkedin ?? ""} onChange={(e) => updateLink("linkedin", e.target.value)} /></Field>
            <Field label="Portfolio"><Input value={draft.personal.links.portfolio ?? ""} onChange={(e) => updateLink("portfolio", e.target.value)} /></Field>
            <Field label="Summary"><Textarea rows={3} value={draft.personal.summary} onChange={(e) => updatePersonal("summary", e.target.value)} placeholder="One paragraph: who you are, what you build." /></Field>
          </CardContent></Card>

          <ListEditor
            title="Experience"
            placeholder="Role at Company, dates, bullets..."
            items={draft.experience}
            onChange={(v) => update("experience", v)}
          />
          <ListEditor
            title="Projects"
            placeholder="Project name + 1-2 line summary + tech"
            items={draft.projects}
            onChange={(v) => update("projects", v)}
          />
          <ListEditor
            title="Education"
            placeholder="School, degree, dates, GPA"
            items={draft.education}
            onChange={(v) => update("education", v)}
          />

          <Card><CardContent className="p-5 space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Skills</div>
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
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-20 lg:self-start space-y-3">
          <Card><CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" /> CV preview (ATS-clean)
              </div>
              <div className="flex gap-2">
                <a href={`${API}/api/cv/markdown?min_level=${minLevel}`} download="cv.md">
                  <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1.5" />.md</Button>
                </a>
                <a href={`${API}/api/cv/html?min_level=${minLevel}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5 mr-1.5" />.html</Button>
                </a>
              </div>
            </div>
            <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap max-h-[70vh] overflow-auto p-3 rounded bg-muted/40 border">{mdPreview}</pre>
            <p className="text-[10px] text-muted-foreground mt-2">
              ATS = Applicant Tracking System. This format is plain text + headings → parses cleanly by every ATS.
            </p>
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ListEditor({
  title,
  items,
  onChange,
  placeholder,
}: {
  title: string;
  items: { raw?: string }[];
  onChange: (v: { raw?: string }[]) => void;
  placeholder: string;
}) {
  return (
    <Card><CardContent className="p-5 space-y-3">
      <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{title}</div>
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <Textarea
            rows={2}
            value={(it.raw as string) ?? JSON.stringify(it)}
            onChange={(e) => {
              const next = [...items];
              next[i] = { raw: e.target.value };
              onChange(next);
            }}
            placeholder={placeholder}
            className="flex-1 text-sm"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            title="Remove"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...items, { raw: "" }])}>
        + Add entry
      </Button>
    </CardContent></Card>
  );
}
