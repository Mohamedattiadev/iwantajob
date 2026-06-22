"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, GraduationCap, Briefcase, Sparkles, Pencil, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

type Mode = "signIn" | "signUp";

const FEATURES = [
  { icon: FileText,       title: "CV builder",   desc: "Upload PDF → live edit → ATS-clean MD / HTML / LaTeX / PDF." },
  { icon: GraduationCap,  title: "Skill notebooks", desc: "Markdown notes, sketches, voice memos per skill. Persists." },
  { icon: Briefcase,      title: "Job finder",   desc: "Ghost-filtered junior listings, match-scored against your real skills." },
  { icon: Sparkles,       title: "AI coach",     desc: "Grounded on your CV. Reads notes, suggests next moves, runs voice interview." },
  { icon: Pencil,         title: "Excalidraw",   desc: "Whiteboard tied to each skill. Sketch, learn, recall." },
  { icon: ListChecks,     title: "Weekly focus", desc: "Track applications + study plan. One drawer, one click." },
];

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("password", password);
      fd.set("flow", mode);
      await signIn("password", fd);
      router.replace("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(
        mode === "signIn"
          ? "Invalid credentials."
          : msg.includes("already") ? "Account already exists." : "Sign-up failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex-1 w-full flex items-center justify-center overflow-hidden">
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 grid lg:grid-cols-[1.1fr_minmax(0,340px)] gap-6 lg:gap-10 items-center">
        {/* Pitch */}
        <section className="space-y-4">
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              W/ORK · personal job-market launchpad
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl leading-[1.05] tracking-tight">
              From theory <em className="text-muted-foreground not-italic">to</em>{" "}
              <span className="bg-gradient-to-r from-primary via-fuchsia-400 to-primary bg-clip-text text-transparent">hired.</span>
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              One workspace for the whole job hunt. Your CV, your skill notes, the real listings worth applying to,
              and a coach grounded on all of it.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.title} className="bg-card/40">
                  <CardContent className="p-2.5 flex items-start gap-2">
                    <div className="h-7 w-7 shrink-0 rounded-md bg-primary/10 grid place-items-center ring-1 ring-primary/20">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold leading-tight">{f.title}</div>
                      <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{f.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-primary/40 pl-3">
            How it works · Sign up → upload CV → rate market skills → open Jobs and apply. Notes, sketches, AI coach and voice interview layer on top.
          </div>
        </section>

        {/* Auth */}
        <Card className="w-full">
          <CardContent className="p-5 space-y-3">
            <div>
              <div className="font-serif text-2xl tracking-tight">W/ORK</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {mode === "signIn" ? "Sign in to continue." : "Create your account."}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                placeholder="password (min 8 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={pending || !email || password.length < 8}
              >
                {mode === "signIn" ? "Sign in" : "Sign up"}
              </Button>
            </form>
            <button
              type="button"
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setMode((m) => (m === "signIn" ? "signUp" : "signIn"))}
            >
              {mode === "signIn"
                ? "Need an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
