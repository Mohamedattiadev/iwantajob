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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { data: status } = useSWR<{ available: boolean }>("/api/chat/status", fetcher);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
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
      ? "e.g. 'Junior full-stack dev, love clean APIs, comfortable with React + Node, learning Go.'"
      : field === "experience"
      ? "e.g. 'Intern at X, 5 months, built ecommerce frontend, integrated payment API.'"
      : field === "project"
      ? "e.g. 'xv6 OS kernel, added new system calls, scheduler tweaks. C.'"
      : field === "education"
      ? "e.g. 'BSc CS, Cairo University, 2025, GPA 3.5'"
      : "Describe what you want written...";

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Dim overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        style={{ animation: "aiPanelIn 180ms ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">AI Write</span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {field}
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="h-7 w-7 grid place-items-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {!status?.available && (
            <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-300 bg-amber-500/10 px-3 py-2.5 rounded-lg border border-amber-500/20">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Backend needs <code className="bg-amber-500/15 px-1 rounded">GEMINI_API_KEY</code>.</span>
            </div>
          )}

          <div>
            <label className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground block mb-2">
              Describe what you want
            </label>
            <textarea
              ref={inputRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={placeholder}
              rows={4}
              className="w-full text-sm leading-relaxed bg-background text-foreground border border-border rounded-lg px-3.5 py-3 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none placeholder:text-muted-foreground/60"
            />
          </div>

          {error && (
            <div className="text-xs text-rose-500 bg-rose-500/10 px-3 py-2 rounded-lg border border-rose-500/20">{error}</div>
          )}

          {draft && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex justify-between items-center px-3.5 py-2 bg-muted/50 border-b border-border">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Generated draft</span>
                <span className="text-[10px] font-mono text-muted-foreground">{draft.length} chars</span>
              </div>
              <div className="px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap max-h-52 overflow-y-auto">
                {draft}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={generate}
            disabled={busy || !status?.available}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium border border-border bg-card hover:bg-accent disabled:opacity-40 transition-colors"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {draft ? "Regenerate" : busy ? "Writing..." : "Generate"}
          </button>
          {draft && (
            <button
              type="button"
              onClick={apply}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Check className="h-4 w-4" /> Use this
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
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
