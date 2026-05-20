"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Loader2, X, Check, AlertTriangle } from "lucide-react";
import useSWR from "swr";
import { API, fetcher } from "@/lib/api";

type Field = "summary" | "experience" | "project" | "education" | "generic";

export function AiRewrite({
  field,
  current,
  onApply,
  label = "AI write",
}: {
  field: Field;
  current: string;
  onApply: (text: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { data: status } = useSWR<{ available: boolean }>("/api/chat/status", fetcher);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 30);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/ai/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, raw: current, instruction }),
      });
      const data = await r.json();
      if (data.error) setError(data.error);
      else setDraft(data.text ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!draft) return;
    onApply(draft);
    setOpen(false);
    setDraft("");
    setInstruction("");
  };

  const placeholder =
    field === "summary"
      ? "Describe yourself: e.g. 'Junior full-stack, love clean APIs and shipping. Comfortable with React + Node, learning Go.'"
      : field === "experience"
      ? "Describe role: 'Intern at X, 5 months, built ecommerce frontend, integrated payment API, fixed bugs.'"
      : field === "project"
      ? "Describe project: 'xv6 OS kernel, added new system calls, scheduler tweaks. C.'"
      : field === "education"
      ? "School, degree, year, GPA if good."
      : "Describe what you want written...";

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={panelRef}
        className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        style={{ boxShadow: "0 25px 60px -15px rgba(0,0,0,0.5), 0 0 0 1px var(--glass-border)" }}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-gradient-to-b from-primary/8 to-transparent">
          <div className="inline-flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-primary/15 text-primary grid place-items-center">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div>
              <div className="text-sm font-semibold leading-none">AI write</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground mt-1">{field}</div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {!status?.available && (
            <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-300 bg-amber-500/10 px-3 py-2 rounded-md border border-amber-500/20">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Backend needs <code className="bg-amber-500/15 px-1 rounded">GEMINI_API_KEY</code>. Get free key at aistudio.google.com.</span>
            </div>
          )}

          <div>
            <label className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground block mb-1.5">What do you want to say?</label>
            <textarea
              ref={inputRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={placeholder}
              rows={5}
              className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary resize-none leading-relaxed"
            />
          </div>

          {current.trim() && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Current text ({current.length} chars) — sent as context
              </summary>
              <div className="mt-2 text-xs whitespace-pre-wrap bg-muted/40 border border-border rounded-md p-2.5 max-h-32 overflow-auto leading-relaxed text-muted-foreground">
                {current}
              </div>
            </details>
          )}

          {error && (
            <div className="text-xs text-rose-500 bg-rose-500/10 px-3 py-2 rounded-md border border-rose-500/20">{error}</div>
          )}

          {draft && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground flex items-center justify-between">
                <span>AI draft</span>
                <span className="text-[10px]">{draft.length} chars</span>
              </div>
              <div className="text-sm whitespace-pre-wrap bg-primary/[0.04] border border-primary/20 rounded-lg p-3 max-h-64 overflow-auto leading-relaxed">
                {draft}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2 bg-muted/30">
          <span className="text-[10px] text-muted-foreground hidden sm:inline">Esc to close</span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={generate}
              disabled={busy || !status?.available}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-sm font-medium border border-border bg-card hover:bg-accent disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {draft ? "Regenerate" : busy ? "Generating..." : "Generate"}
            </button>
            {draft && (
              <button
                type="button"
                onClick={apply}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 shadow-sm shadow-primary/30"
              >
                <Check className="h-4 w-4" /> Use this
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium bg-primary/12 text-primary hover:bg-primary/20 ring-1 ring-primary/25 transition-colors"
        title="Have AI write/polish this field"
      >
        <Sparkles className="h-3 w-3" />
        {label}
      </button>
      {modal}
    </>
  );
}
