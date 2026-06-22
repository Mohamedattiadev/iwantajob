"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Plus, Target, Trash2 } from "lucide-react";
import { useUserPlans, type Priority } from "@/lib/plans";

type PlansApi = ReturnType<typeof useUserPlans>;

const PRIORITY_TONE: Record<Priority, string> = {
  high: "bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-1 ring-rose-500/30",
  med:  "bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/30",
  low:  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/30",
};
const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-rose-500",
  med:  "bg-amber-500",
  low:  "bg-emerald-500",
};
const PRIO_RANK: Record<Priority, number> = { high: 0, med: 1, low: 2 };

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function daysUntil(iso: string) {
  const due = new Date(iso + "T00:00:00").getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((due - today.getTime()) / 86400000);
}

function dueLabel(iso?: string): { text: string; tone: string } | null {
  if (!iso) return null;
  const d = daysUntil(iso);
  if (d < 0) return { text: `${-d}d overdue`, tone: "bg-rose-500/15 text-rose-600 dark:text-rose-300" };
  if (d === 0) return { text: "today", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300" };
  if (d === 1) return { text: "tomorrow", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" };
  if (d <= 7) return { text: `in ${d}d`, tone: "bg-foreground/[0.06] text-foreground/80" };
  return { text: iso.slice(5), tone: "bg-foreground/[0.04] text-muted-foreground" };
}


function ProgressRing({ pct, size = 56, stroke = 5 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width={size} height={size} className="block">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor"
              className="text-foreground/10" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor"
              className="text-primary transition-[stroke-dashoffset] duration-500"
              strokeWidth={stroke} fill="none" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle"
            className="text-[11px] font-mono font-bold fill-foreground tabular-nums">
        {pct}%
      </text>
    </svg>
  );
}

export function WeeklyFocus({ plans: external, compact = false }: { plans?: PlansApi; compact?: boolean } = {}) {
  const internal = useUserPlans();
  const plans = external ?? internal;
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [due, setDue] = useState<string>("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const active = useMemo(() => plans.items.filter((p) => !p.done), [plans.items]);
  const completed = useMemo(() => plans.items.filter((p) => p.done), [plans.items]);
  const pct = active.length + completed.length === 0 ? 0
    : Math.round((completed.length / (active.length + completed.length)) * 100);
  const filtered = useMemo(() => {
    return [...active].sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      const ad = a.due ? daysUntil(a.due) : Infinity;
      const bd = b.due ? daysUntil(b.due) : Infinity;
      const ag = ad < 0 ? -2 : ad === 0 ? -1 : 0;
      const bg = bd < 0 ? -2 : bd === 0 ? -1 : 0;
      if (ag !== bg) return ag - bg;
      const pa = a.priority ? PRIO_RANK[a.priority] : 3;
      const pb = b.priority ? PRIO_RANK[b.priority] : 3;
      if (pa !== pb) return pa - pb;
      if (ad !== bd) return ad - bd;
      return b.created_at - a.created_at;
    });
  }, [active]);

  const submit = () => {
    if (!title.trim()) return;
    plans.add({
      title: title.trim(),
      priority: priority || undefined,
      due: due || undefined,
    });
    setTitle(""); setPriority(""); setDue("");
  };

  return (
    <section className={`rounded-2xl border border-border/50 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur-md shadow-inner shadow-black/5 ${compact ? "p-3 space-y-3 flex flex-col flex-1 min-h-0" : "p-5 space-y-4"}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <ProgressRing pct={pct} size={compact ? 48 : 56} stroke={compact ? 4 : 5} />
          <div>
            {!compact && (
              <h2 className="text-lg font-semibold leading-tight">This week I will&hellip;</h2>
            )}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {completed.length}/{active.length + completed.length} done
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-background focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition p-2 space-y-2">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-muted-foreground ml-1 shrink-0" />
          <input
            placeholder="e.g. finish FastAPI auth tutorial"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="flex-1 bg-transparent h-9 text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <button
            onClick={submit}
            disabled={!title.trim()}
            className="h-8 px-3.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap pl-7">
          <div className="inline-flex items-center gap-0.5">
            {(["low", "med", "high"] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(priority === p ? "" : p)}
                className={`h-7 px-2.5 rounded-md text-[11px] font-mono uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors ${
                  priority === p
                    ? PRIORITY_TONE[p]
                    : "border border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent/40"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[p]}`} />
                {p}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={due}
            min={todayISO()}
            onChange={(e) => setDue(e.target.value)}
            className="h-7 px-2 rounded-md border border-border/60 bg-background text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {(priority || due) && (
            <button
              type="button"
              onClick={() => { setPriority(""); setDue(""); }}
              className="text-[10px] uppercase font-mono text-muted-foreground hover:text-foreground"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {active.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          {completed.length > 0 ? "All caught up." : "Add a task to start."}
        </p>
      )}

      {filtered.length > 0 && (
        <ul className={`space-y-1.5 ${compact ? "flex-1 min-h-0 overflow-y-auto pr-1" : ""}`}>
          {filtered.map((p) => {
            const dueB = dueLabel(p.due);
            const idx = active.indexOf(p);
            return (
              <li
                key={p.id}
                className={`group relative flex items-start gap-3 px-3 py-2.5 rounded-lg border bg-background hover:bg-accent/20 transition-colors ${
                  p.priority === "high" ? "border-rose-500/30" : "border-border/40"
                }`}
              >
                {p.priority && (
                  <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${PRIORITY_DOT[p.priority]}`} />
                )}
                <button
                  onClick={() => plans.update(p.id, { done: true, completed_at: Date.now() })}
                  className="mt-0.5 rounded-md border-2 border-foreground/30 hover:border-emerald-500 grid place-items-center shrink-0 transition-colors"
                  style={{ height: "1.125rem", width: "1.125rem" }}
                  aria-label="Mark done"
                />
                <div className="flex-1 min-w-0 space-y-0.5">
                  {editId === p.id ? (
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={() => { if (editText.trim() && editText !== p.title) plans.update(p.id, { title: editText.trim() }); setEditId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setEditId(null);
                      }}
                      className="w-full bg-transparent border-b border-primary text-sm outline-none"
                    />
                  ) : (
                    <div
                      onClick={() => { setEditId(p.id); setEditText(p.title); }}
                      className="text-sm cursor-text leading-snug"
                    >
                      {p.title}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                    {p.priority && (
                      <span className={`px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${PRIORITY_TONE[p.priority]}`}>{p.priority}</span>
                    )}
                    {dueB && (
                      <span className={`px-1.5 py-0.5 rounded ${dueB.tone}`}>{dueB.text}</span>
                    )}
                    {p.skill && (
                      <Link href={`/learn/${encodeURIComponent(p.skill)}`} className="font-mono uppercase tracking-wider text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded bg-foreground/[0.04]">
                        {p.skill}
                      </Link>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => plans.update(p.id, { pinned: !p.pinned })}
                    title={p.pinned ? "Unpin" : "Pin"}
                    className={`h-7 w-7 grid place-items-center rounded-md ${p.pinned ? "text-primary" : "text-muted-foreground hover:text-foreground"} hover:bg-accent/40`}
                  >
                    <Target className="h-3.5 w-3.5" />
                  </button>
                  {idx > 0 && (
                    <button onClick={() => plans.reorder(idx, idx - 1)} title="Move up"
                            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40">
                      <ArrowRight className="h-3.5 w-3.5 -rotate-90" />
                    </button>
                  )}
                  {idx < active.length - 1 && (
                    <button onClick={() => plans.reorder(idx, idx + 1)} title="Move down"
                            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40">
                      <ArrowRight className="h-3.5 w-3.5 rotate-90" />
                    </button>
                  )}
                  <button
                    onClick={() => plans.remove(p.id)}
                    title="Remove"
                    className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-rose-500 hover:bg-accent/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {completed.length > 0 && (
        <details open={showCompleted} onToggle={(e) => setShowCompleted((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-500" /> {completed.length} completed
          </summary>
          <ul className="mt-2 space-y-1">
            {completed.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5 rounded bg-muted/30">
                <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                <span className="line-through flex-1 truncate">{p.title}</span>
                <button onClick={() => plans.update(p.id, { done: false })} className="text-[10px] hover:text-foreground">restore</button>
                <button onClick={() => plans.remove(p.id)} className="text-muted-foreground hover:text-rose-500"><Trash2 className="h-3 w-3" /></button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

