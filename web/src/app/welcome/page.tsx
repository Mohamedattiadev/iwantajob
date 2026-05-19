"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Upload, Sparkles, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { API, type Profile } from "@/lib/api";
import { useOnboarded } from "@/lib/onboarding";

type Step = 0 | 1 | 2 | 3;

export default function Welcome() {
  const router = useRouter();
  const { finish } = useOnboarded();
  const [step, setStep] = useState<Step>(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2 answers
  const [goal, setGoal] = useState("");
  const [target, setTarget] = useState("");
  const [stack, setStack] = useState("");
  const [constraint, setConstraint] = useState("");

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch(`${API}/api/cv/upload`, { method: "POST", body: form });
      if (!r.ok) throw new Error(`${r.status}`);
      const body = (await r.json()) as { profile: Profile; meta: { skills_detected: number } };
      setProfile(body.profile);
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
    await fetch(`${API}/api/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: patch }),
    });
    setProfile(patch);
    setStep(3);
  };

  const done = () => {
    finish();
    router.push("/");
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center">
          <Badge variant="outline" className="mb-3 text-xs font-mono">welcome</Badge>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            Let's set up your launchpad.
          </h1>
          <p className="text-muted-foreground mt-3">Takes 2 minutes. Skip anytime.</p>
        </div>

        <Steps current={step} />

        {step === 0 && (
          <Card><CardContent className="p-8 space-y-5">
            <Sparkles className="h-8 w-8 text-indigo-400" />
            <h2 className="text-2xl font-semibold">Hi. I'll do 3 things for you.</h2>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>Read your existing CV and extract everything I can.</li>
              <li>Ask 4 short questions to know what you actually want.</li>
              <li>Match you against real junior jobs scraped from 6 sources, ghost-filtered.</li>
            </ul>
            <Button onClick={() => setStep(1)} size="lg">Let's go <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </CardContent></Card>
        )}

        {step === 1 && (
          <Card><CardContent className="p-8 space-y-5">
            <h2 className="text-2xl font-semibold">Step 1 — Upload your CV</h2>
            <p className="text-sm text-muted-foreground">PDF works best. I parse name, contact, GitHub, education, and detect skills automatically. You can edit anything afterwards.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf,text/plain"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              className="hidden"
            />
            <div className="flex gap-3">
              <Button onClick={() => fileRef.current?.click()} disabled={uploading} size="lg">
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? "Parsing..." : "Upload CV PDF"}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)}>Skip — fill manually</Button>
            </div>
          </CardContent></Card>
        )}

        {step === 2 && (
          <Card><CardContent className="p-8 space-y-5">
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
            <div className="flex gap-3 pt-2">
              <Button onClick={saveAnswers} size="lg">Save & continue <ArrowRight className="ml-2 h-4 w-4" /></Button>
              <Button variant="outline" onClick={() => setStep(3)}>Skip</Button>
            </div>
          </CardContent></Card>
        )}

        {step === 3 && (
          <Card><CardContent className="p-8 space-y-5">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <h2 className="text-2xl font-semibold">You're set.</h2>
            <p className="text-sm text-muted-foreground">Your launchpad has four areas:</p>
            <ul className="space-y-2 text-sm">
              <li><b>CV</b> — edit profile, generate ATS-clean Markdown / HTML / LaTeX PDF.</li>
              <li><b>Learn</b> — pick a skill, get curated notebook + resources, track progress 0–5.</li>
              <li><b>Jobs</b> — ghost-filtered listings, match-scored against your skills.</li>
              <li><b>Apply</b> — one click marks a job applied. Auto-dedupes.</li>
            </ul>
            <p className="text-xs text-muted-foreground">The chat bubble (bottom-right) answers any question about your dashboard data.</p>
            <Button onClick={done} size="lg">Open dashboard <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function Steps({ current }: { current: number }) {
  const labels = ["Hi", "Upload CV", "Goals", "Done"];
  return (
    <div className="flex items-center justify-center gap-3">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-3">
          <div className={`h-7 w-7 rounded-full grid place-items-center text-xs font-mono font-bold ${
            i < current ? "bg-emerald-500 text-white" :
            i === current ? "bg-foreground text-background" :
            "bg-muted text-muted-foreground"
          }`}>
            {i < current ? "✓" : i}
          </div>
          <span className={`text-sm ${i === current ? "font-medium" : "text-muted-foreground"}`}>{l}</span>
          {i < labels.length - 1 && <div className="h-px w-8 bg-border" />}
        </div>
      ))}
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
