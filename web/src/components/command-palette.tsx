"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, GraduationCap, Briefcase, Send, Sparkles, RefreshCw, Pencil, Home, Search, X } from "lucide-react";
import { API, post } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
  shortcut?: string;
  run: () => void;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const items: Item[] = useMemo(() => {
    const go = (href: string) => () => { setOpen(false); router.push(href); };
    const scrape = async () => {
      setOpen(false);
      try { await post("/api/scrape"); toast.info("Scrape queued"); } catch { toast.error("Failed"); }
    };
    const chat = () => { setOpen(false); window.dispatchEvent(new Event("open-chat")); };
    return [
      { id: "go-/",      group: "Go to", icon: <Home className="h-4 w-4" />,         label: "Overview", shortcut: "g o", run: go("/") },
      { id: "go-cv",     group: "Go to", icon: <FileText className="h-4 w-4" />,     label: "CV",       shortcut: "g c", run: go("/cv") },
      { id: "go-learn",  group: "Go to", icon: <GraduationCap className="h-4 w-4" />,label: "Learn",    shortcut: "g l", run: go("/learn") },
      { id: "go-jobs",   group: "Go to", icon: <Briefcase className="h-4 w-4" />,    label: "Jobs",     shortcut: "g j", run: go("/jobs") },
      { id: "go-apply",  group: "Go to", icon: <Send className="h-4 w-4" />,         label: "Apply",    shortcut: "g a", run: go("/apply") },
      { id: "go-draw",   group: "Go to", icon: <Pencil className="h-4 w-4" />,       label: "Draw",     shortcut: "g d", run: go("/draw") },
      { id: "act-scrape",group: "Actions", icon: <RefreshCw className="h-4 w-4" />,  label: "Scrape new jobs", run: scrape },
      { id: "act-chat",  group: "Actions", icon: <Sparkles className="h-4 w-4" />,   label: "Open coach (chat)", run: chat },
    ];
  }, [router]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => i.label.toLowerCase().includes(needle) || i.id.toLowerCase().includes(needle));
  }, [q, items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => { setCursor(0); }, [q]);

  if (!open) return null;

  const groups = Array.from(new Set(filtered.map((i) => i.group)));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" aria-hidden />
      <div
        role="dialog"
        className="relative w-full max-w-xl glass-strong rounded-2xl overflow-hidden shadow-2xl anim-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-12 border-b border-foreground/10">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); filtered[cursor]?.run(); }
            }}
            placeholder="Search routes, actions…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-foreground/15 text-muted-foreground">esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No results.</div>
          ) : (
            groups.map((g) => (
              <div key={g} className="py-1">
                <div className="px-4 py-1 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{g}</div>
                {filtered.filter((i) => i.group === g).map((it) => {
                  const idx = filtered.indexOf(it);
                  const active = idx === cursor;
                  return (
                    <button
                      key={it.id}
                      onClick={it.run}
                      onMouseEnter={() => setCursor(idx)}
                      className={cn(
                        "w-full px-4 py-2 flex items-center gap-3 text-left text-sm transition-colors",
                        active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="text-foreground/80">{it.icon}</span>
                      <span className="flex-1">{it.label}</span>
                      {it.shortcut && (
                        <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-foreground/15">
                          {it.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-foreground/10 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
          <span>↑↓ navigate · ↵ select</span>
          <button onClick={() => setOpen(false)} className="inline-flex items-center gap-1 hover:text-foreground">
            close <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
