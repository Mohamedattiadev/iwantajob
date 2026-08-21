"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api as convexApi } from "../../../convex/_generated/api";
import { ExternalLink, Trash2, LayoutGrid, List, ChevronDown, ChevronUp, Mic } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Pagination } from "@/components/pagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApplications } from "@/lib/applications";
import type { Application } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { PageTabs, JOBS_TABS } from "@/components/page-tabs";
import { toast } from "sonner";

const STATUS_TONE: Record<Application["status"], string> = {
  applied: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  interviewing: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  offer: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  ghost: "bg-muted text-muted-foreground",
};

const COLUMNS: Array<{ id: Application["status"]; label: string; accent: string }> = [
  { id: "applied", label: "Applied", accent: "sky" },
  { id: "interviewing", label: "Interview", accent: "amber" },
  { id: "offer", label: "Offer", accent: "emerald" },
  { id: "rejected", label: "Rejected", accent: "rose" },
  { id: "ghost", label: "Ghost", accent: "slate" },
];

type View = "kanban" | "list";

export default function ApplyPage() {
  const { applications, isLoading, remove, setStatus } = useApplications();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;
  const [view, setView] = useState<View>("kanban");
  const [dragging, setDragging] = useState<Application | null>(null);

  const counts = applications.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  const grouped = useMemo(() => {
    const out: Record<Application["status"], Application[]> = {
      applied: [], interviewing: [], offer: [], rejected: [], ghost: [],
    };
    for (const a of applications) {
      (out[a.status] ?? out.applied).push(a);
    }
    return out;
  }, [applications]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (e: DragStartEvent) => {
    const a = applications.find((x) => x.id === e.active.id);
    if (a) setDragging(a);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (!e.over) return;
    const id = String(e.active.id);
    const newStatus = e.over.id as Application["status"];
    const cur = applications.find((a) => a.id === id);
    if (!cur || cur.status === newStatus) return;
    setStatus(id, newStatus);
    toast.success(`Moved to ${newStatus}`);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="03 · jobs · pipeline"
        title={<>Application <em className="font-serif text-muted-foreground not-italic">pipeline.</em></>}
        subtitle="Drag cards between columns to update status. Every job you apply to lives here — dedupe is enforced."
        action={
          <div className="inline-flex rounded-md border bg-card p-0.5">
            <button
              onClick={() => setView("kanban")}
              className={`h-8 px-3 rounded-sm text-xs uppercase font-mono tracking-wider transition-colors inline-flex items-center gap-1 ${
                view === "kanban" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
            <button
              onClick={() => setView("list")}
              className={`h-8 px-3 rounded-sm text-xs uppercase font-mono tracking-wider transition-colors inline-flex items-center gap-1 ${
                view === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
        }
      />

      <PageTabs tabs={JOBS_TABS} />

      <WeeklyTargetWidget applications={applications} />

      {applications.length > 0 && (
        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 -mt-4">
          <span className="font-mono uppercase tracking-wider text-[10px] text-foreground/70">Pipeline</span>
          <span>{applications.length} total</span>
          <span className="text-sky-600 dark:text-sky-400">{counts.applied ?? 0} applied</span>
          <span className="text-amber-600 dark:text-amber-400">{counts.interviewing ?? 0} interview</span>
          <span className="text-emerald-600 dark:text-emerald-400">{counts.offer ?? 0} offer</span>
          <span className="text-rose-600 dark:text-rose-400">{counts.rejected ?? 0} rejected</span>
          <span className="text-muted-foreground">{counts.ghost ?? 0} ghost</span>
        </div>
      )}

      {applications.length > 0 && <ReliabilityPanel />}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : applications.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">
          No applications yet. Head to <Link href="/jobs" className="text-primary hover:underline">Jobs</Link> and click &quot;Apply&quot; on any listing.
        </CardContent></Card>
      ) : view === "kanban" ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {COLUMNS.map((col) => (
              <Column
                key={col.id}
                id={col.id}
                label={col.label}
                count={grouped[col.id]?.length ?? 0}
              >
                {(grouped[col.id] ?? []).map((a) => (
                  <DraggableCard key={a.id} app={a} onRemove={remove} />
                ))}
              </Column>
            ))}
          </div>
          <DragOverlay>
            {dragging && <CardBody app={dragging} ghost />}
          </DragOverlay>
        </DndContext>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {applications.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((a) => (
            <li key={a.id}>
              <Card
                accentColor={
                  a.status === "offer" ? "emerald"
                  : a.status === "interviewing" ? "amber"
                  : a.status === "rejected" ? "rose"
                  : a.status === "ghost" ? "slate"
                  : "sky"
                }
                showAccentLine
              >
                <CardContent className="p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium line-clamp-1">{a.job.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.job.company ?? "?"} · {a.job.source} · applied {a.applied_at.slice(0, 10)}
                    </div>
                  </div>
                  <a href={a.job.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0">
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {a.status === "interviewing" && (
                  <Link
                    href={`/interview?jobId=${a.job.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                  >
                    <Mic className="h-3 w-3" /> Practice for this interview
                  </Link>
                )}
                <div className="flex items-center gap-2">
                  <Select value={a.status} onValueChange={(v) => v && setStatus(a.id, v as Application["status"])}>
                    <SelectTrigger className={`h-8 text-xs w-40 ${STATUS_TONE[a.status]}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="applied">applied</SelectItem>
                      <SelectItem value="interviewing">interviewing</SelectItem>
                      <SelectItem value="offer">offer</SelectItem>
                      <SelectItem value="rejected">rejected</SelectItem>
                      <SelectItem value="ghost">ghosted</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => remove(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent></Card>
            </li>
          ))}
        </ul>
      )}

      {view === "list" && applications.length > 0 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalShown={applications.length}
          total={applications.length}
          onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        />
      )}
    </div>
  );
}

const WEEKLY_TARGET_KEY = "apply:weekly_target";
const DEFAULT_WEEKLY_TARGET = 15;

function startOfWeek(d: Date): Date {
  // Monday-start week, local time — matches the plan's Mon–Sun cadence.
  const out = new Date(d);
  const day = out.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  out.setDate(out.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

// Weekly application-cadence target (plan.md: 15-20 tailored applications/
// week). Computed client-side from applications already in memory — no new
// query — and the target itself is a per-browser preference, not synced
// data, so it lives in localStorage like the CV template choice does.
function WeeklyTargetWidget({ applications }: { applications: Application[] }) {
  const [target, setTarget] = useState(DEFAULT_WEEKLY_TARGET);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(DEFAULT_WEEKLY_TARGET));

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(WEEKLY_TARGET_KEY);
        const n = raw ? Number(raw) : NaN;
        if (Number.isFinite(n) && n > 0) setTarget(n);
      } catch { /* ignore */ }
    });
  }, []);

  const count = useMemo(() => {
    const cutoff = startOfWeek(new Date()).getTime();
    return applications.filter((a) => new Date(a.applied_at).getTime() >= cutoff).length;
  }, [applications]);

  const pct = Math.min(100, Math.round((count / target) * 100));
  const barColor = pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-sky-500";

  const saveTarget = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) {
      const clamped = Math.round(Math.min(100, n));
      setTarget(clamped);
      try { localStorage.setItem(WEEKLY_TARGET_KEY, String(clamped)); } catch { /* ignore */ }
    }
    setEditing(false);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>This week</span>
          {editing ? (
            <span className="inline-flex items-center gap-1 normal-case">
              <input
                autoFocus
                type="number"
                min={1}
                max={100}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveTarget(); if (e.key === "Escape") setEditing(false); }}
                onBlur={saveTarget}
                className="w-14 h-6 px-1.5 rounded border bg-background text-xs text-foreground"
              />
              <span>/ week target</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => { setDraft(String(target)); setEditing(true); }}
              className="normal-case hover:text-foreground"
              title="Click to change your weekly target"
            >
              target: {target}/week
            </button>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-serif text-2xl tabular-nums">{count}</span>
          <span className="text-sm text-muted-foreground">/ {target} applications</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

type ReliabilityRow = {
  name: string;
  applied: number;
  responded: number;
  ghosted: number;
  pending: number;
  sample_size: number;
  response_rate: number | null;
};

function rateTone(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 0.5) return "text-emerald-600 dark:text-emerald-400";
  if (rate > 0) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function ReliabilityList({ rows }: { rows: ReliabilityRow[] }) {
  const shown = rows.filter((r) => r.applied > 0).slice(0, 8);
  if (shown.length === 0) {
    return <div className="text-xs text-muted-foreground py-2">No data yet.</div>;
  }
  return (
    <ul className="space-y-1">
      {shown.map((r) => (
        <li key={r.name} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate">{r.name}</span>
          <span className="shrink-0 tabular-nums">
            <span className={rateTone(r.response_rate)}>
              {r.response_rate === null ? "pending" : `${Math.round(r.response_rate * 100)}%`}
            </span>
            <span className="text-muted-foreground"> · {r.applied}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Response-rate tracking per source/company, computed from the user's own
// application history (Phase 3 — no new data source, closes the loop on
// data the tracker already has). "Responded" = interviewing/offer/rejected;
// still-"applied" rows are excluded from the rate as too early to judge.
function ReliabilityPanel() {
  const [open, setOpen] = useState(true);
  const stats = useQuery(convexApi.reliability.companyStats);
  const hasData =
    (stats?.by_company.some((r) => r.applied > 0) || stats?.by_source.some((r) => r.applied > 0)) ?? false;
  if (!hasData) return null;
  return (
    <Card>
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Response rate — where it&apos;s worth applying again
          </span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        {open && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1.5">By source</div>
              <ReliabilityList rows={stats?.by_source ?? []} />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1.5">By company</div>
              <ReliabilityList rows={stats?.by_company ?? []} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Column({ id, label, count, children }: {
  id: Application["status"];
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-w-0 rounded-xl border bg-muted/30 p-2.5 min-h-[300px] transition-colors ${
        isOver ? "bg-primary/10 ring-1 ring-primary/40" : ""
      }`}
    >
      <div className="px-2 py-1 flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DraggableCard({ app, onRemove }: { app: Application; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`w-full min-w-0 cursor-grab active:cursor-grabbing ${isDragging ? "opacity-30" : ""}`}
    >
      <CardBody app={app} onRemove={onRemove} />
    </div>
  );
}

function CardBody({ app, onRemove, ghost }: { app: Application; onRemove?: (id: string) => void; ghost?: boolean }) {
  return (
    <div className={`w-full min-w-0 overflow-hidden rounded-lg border bg-card p-2.5 shadow-sm ${ghost ? "ring-2 ring-primary/40 shadow-lg" : ""}`}>
      <div className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="font-medium text-sm line-clamp-2 break-words">{app.job.title}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {app.job.company ?? "?"} · {app.job.source}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
            {app.applied_at.slice(0, 10)}
          </div>
          {app.status === "interviewing" && (
            <Link
              href={`/interview?jobId=${app.job.id}`}
              onClick={(e) => e.stopPropagation()}
              className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-foreground hover:underline"
            >
              <Mic className="h-3 w-3" /> Practice for this interview
            </Link>
          )}
        </div>
        {onRemove && (
          <div className="flex flex-col gap-1 shrink-0">
            <a
              href={app.job.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Open posting"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(app.id); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded text-muted-foreground hover:text-rose-500 hover:bg-accent"
              title="Remove"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color = "slate" }: {
  label: string;
  value: number;
  color?: "violet" | "emerald" | "amber" | "sky" | "slate" | "rose";
}) {
  const accents: Record<string, string> = {
    violet: "text-violet-500",
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    sky: "text-sky-500",
    slate: "text-foreground",
    rose: "text-rose-500",
  };
  return (
    <Card accentColor={color} showAccentLine showCornerGlow>
      <CardContent className="py-3">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className={`font-serif text-3xl tabular-nums mt-2 ${accents[color]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
