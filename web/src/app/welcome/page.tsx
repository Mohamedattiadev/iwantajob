"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Upload, Sparkles, CheckCircle2, User, Target as TargetIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { API, type Profile } from "@/lib/api";
import { useMutation } from "convex/react";
import { api as convexApi } from "../../../convex/_generated/api";

function blankProfile(): Profile {
  return {
    personal: { name: "", email: "", phone: "", location: "", links: {}, summary: "" },
    education: [], experience: [], projects: [],
    skills: {}, languages: [], certifications: [],
  };
}
import { useOnboarded } from "@/lib/onboarding";
import { Aurora, Gradient } from "@/components/eye-candy";

type Step = 0 | 1 | 2 | 3;

export default function Welcome() {
  const router = useRouter();
  const { finish } = useOnboarded();
  const [step, setStep] = useState<Step>(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const saveProfileMut = useMutation(convexApi.profile.save);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 1
  const [name, setName] = useState("");

  // Step 2 answers
  const [goal, setGoal] = useState("");
  const [target, setTarget] = useState("");
  const [stack, setStack] = useState("");
  const [constraint, setConstraint] = useState("");

  const persistName = async (override?: Profile): Promise<Profile | null> => {
    const trimmed = name.trim();
    if (!trimmed) return override ?? profile;
    const base: Profile = override ?? profile ?? blankProfile();
    if ((base.personal?.name || "").trim() === trimmed) return base;
    const patched: Profile = {
      ...base,
      personal: { ...base.personal, name: trimmed },
    };
    try {
      await saveProfileMut({ data: JSON.stringify(patched) });
    } catch { /* silent — non-fatal */ }
    setProfile(patched);
    return patched;
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(`${API}/api/cv/upload`, { method: "POST", body: form });
      if (!r.ok) throw new Error(`${r.status}`);
      const body = (await r.json()) as { profile: Profile; meta: { skills_detected: number } };
      // Parsed name beats typed only if user left field empty
      if (!name.trim() && body.profile.personal?.name) setName(body.profile.personal.name);
      // Otherwise keep user-typed name (don't let parser clobber it)
      const merged: Profile = name.trim()
        ? { ...body.profile, personal: { ...body.profile.personal, name: name.trim() } }
        : body.profile;
      setProfile(merged);
      await persistName(merged);
      toast.success(`Parsed: ${body.meta.skills_detected} skills detected`);
      setStep(2);
    } catch (e) {
      toast.error(`Upload failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setUploading(false);
    }
  };

  const saveAnswers = async () => {
    if (!profile) return;
    const summary = [goal && `Goal: ${goal}.`, stack && `Stack focus: ${stack}.`, target && `Target: ${target}.`, constraint && `Constraints: ${constraint}.`].filter(Boolean).join(" ");
    const patch: Profile = {
      ...profile,
      personal: { ...profile.personal, summary: summary || profile.personal.summary },
    };
    await saveProfileMut({ data: JSON.stringify(patch) });
    setProfile(patch);
    setStep(3);
  };

  const done = () => {
    finish();
    router.push("/");
  };

  return (
    <div className="relative min-h-[80vh] flex items-center justify-center">
      <Aurora />
      <div className="w-full max-w-3xl space-y-10 anim-in">
        <div className="text-center">
          <Badge variant="outline" className="mb-4 text-[10px] font-mono uppercase tracking-[0.14em]">welcome to W/ORK</Badge>
          <h1 className="font-serif text-5xl sm:text-7xl font-normal tracking-tight leading-[0.95] text-balance">
            Let&apos;s set up your <Gradient>launchpad</Gradient>.
          </h1>
          <p className="text-muted-foreground mt-3">Takes 2 minutes. Skip anytime.</p>
        </div>

        <Steps current={step} onGoto={(s) => { if (s < step) setStep(s as Step); }} />

        {step === 0 && (
          <Card accentColor="violet" showAccentLine showCornerGlow><CardContent className="p-8 space-y-5">
            <Sparkles className="h-8 w-8 text-indigo-400" />
            <h2 className="text-2xl font-semibold">Hi. I&apos;ll do 3 things for you.</h2>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>Read your existing CV and extract everything I can.</li>
              <li>Ask 4 short questions to know what you actually want.</li>
              <li>Match you against real junior jobs scraped from 6 sources, ghost-filtered.</li>
            </ul>
            <Button onClick={() => setStep(1)} size="lg">Let&apos;s go <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </CardContent></Card>
        )}

        {step === 1 && (
          <Card accentColor="sky" showAccentLine showCornerGlow><CardContent className="p-8 space-y-5">
            <h2 className="text-2xl font-semibold">Step 1 — What&apos;s your name?</h2>
            <p className="text-sm text-muted-foreground">Used to greet you and seed your CV header. You can change it anytime.</p>

            <Field label="Your name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mohamed Attia"
                autoFocus
                className="h-12 text-base"
                onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) fileRef.current?.click(); }}
              />
            </Field>

            <div className="pt-2 border-t border-foreground/10" />
            <h3 className="text-sm font-semibold">Bootstrap from existing CV (optional)</h3>
            <p className="text-xs text-muted-foreground -mt-2">PDF works best. I parse contact, GitHub, education, and detect skills. Skip if you&apos;d rather fill manually.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf,text/plain"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              className="hidden"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button variant="ghost" size="lg" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => fileRef.current?.click()} disabled={uploading || !name.trim()} size="lg" title={!name.trim() ? "Enter your name first" : ""}>
                  <Upload className="mr-2 h-4 w-4" />
                  {uploading ? "Parsing..." : "Upload CV PDF"}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  disabled={!name.trim()}
                  onClick={async () => { await persistName(); setStep(2); }}
                  title={!name.trim() ? "Enter your name first" : ""}
                >
                  Skip — fill manually <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent></Card>
        )}

        {step === 2 && (
          <Card accentColor="amber" showAccentLine showCornerGlow><CardContent className="p-8 space-y-5">
            <h2 className="text-2xl font-semibold">Step 2 — Tell me what you want</h2>
            {profile && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded p-3">
                Read from CV: <span className="text-foreground">{profile.personal.name || "(no name)"}</span>{" "}
                · {Object.keys(profile.skills ?? {}).length} skills detected.
              </div>
            )}
            <Field label="What's your goal in the next 6 months?">
              <Textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. land a junior backend role in Türkiye or remote EU" />
            </Field>
            <Field label="Where are you targeting? (city, remote, country)">
              <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. Ankara, remote-EU, anywhere" />
            </Field>
            <Field label="What stack do you want to lean into?">
              <Input value={stack} onChange={(e) => setStack(e.target.value)} placeholder="e.g. FastAPI + React + Postgres" />
            </Field>
            <Field label="Any hard constraints?">
              <Input value={constraint} onChange={(e) => setConstraint(e.target.value)} placeholder="e.g. visa needed, still in school, must be remote" />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button variant="ghost" size="lg" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <div className="flex gap-3">
                <Button onClick={saveAnswers} size="lg">Save &amp; continue <ArrowRight className="ml-2 h-4 w-4" /></Button>
                <Button variant="outline" size="lg" onClick={() => setStep(3)}>Skip</Button>
              </div>
            </div>
          </CardContent></Card>
        )}

        {step === 3 && (
          <Card accentColor="emerald" showAccentLine showCornerGlow><CardContent className="p-8 space-y-5">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <h2 className="text-2xl font-semibold">
              {name.trim() ? `You're set, ${name.trim().split(" ")[0]}.` : "You're set."}
            </h2>
            <p className="text-sm text-muted-foreground">Your launchpad has four areas:</p>
            <ul className="space-y-2 text-sm">
              <li><b>CV</b> — edit profile, generate ATS-clean Markdown / HTML / LaTeX PDF.</li>
              <li><b>Learn</b> — pick a skill, get curated notebook + resources, track progress 0–5.</li>
              <li><b>Jobs</b> — ghost-filtered listings, match-scored against your skills.</li>
              <li><b>Apply</b> — one click marks a job applied. Auto-dedupes.</li>
            </ul>
            <p className="text-xs text-muted-foreground">The chat bubble (bottom-right) answers any question about your dashboard data.</p>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button variant="ghost" size="lg" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={done} size="lg">Open dashboard <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function Steps({ current, onGoto }: { current: number; onGoto?: (i: number) => void }) {
  const items = [
    { label: "Hi",        icon: <Sparkles className="h-3 w-3" /> },
    { label: "Your name", icon: <User className="h-3 w-3" /> },
    { label: "Goals",     icon: <TargetIcon className="h-3 w-3" /> },
    { label: "Done",      icon: <CheckCircle2 className="h-3 w-3" /> },
  ];
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
      {items.map((it, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = !!onGoto && i < current;
        return (
          <div key={it.label} className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => clickable && onGoto?.(i)}
              disabled={!clickable}
              className={`group inline-flex items-center gap-2 px-2.5 h-8 rounded-full transition-all ${
                active ? "bg-foreground text-background shadow-md" :
                done   ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25" :
                         "bg-muted text-muted-foreground"
              } ${clickable ? "cursor-pointer" : "cursor-default"}`}
              title={clickable ? `Back to: ${it.label}` : it.label}
            >
              <span className={`h-5 w-5 rounded-full grid place-items-center text-[10px] font-mono font-bold ${
                active ? "bg-background/20" : done ? "bg-emerald-500 text-white" : "bg-foreground/10"
              }`}>
                {done ? "✓" : i}
              </span>
              <span className="text-xs font-medium hidden sm:inline">{it.label}</span>
              <span className="sm:hidden">{it.icon}</span>
            </button>
            {i < items.length - 1 && (
              <div className={`h-px w-6 sm:w-10 ${i < current ? "bg-emerald-500/50" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
