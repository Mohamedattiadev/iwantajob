"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api as convexApi } from "../../convex/_generated/api";
import Link from "next/link";
import { BookOpen, ListChecks, Briefcase, ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { type JobsResponse } from "@/lib/api";
import { resourcesFor } from "@/lib/resources";
import { useSkillMilestones } from "@/lib/milestones";
import { useUserResources } from "@/lib/user-resources";

type Props = {
  skill: string;
  children: React.ReactNode;
  why?: string;
};

const CARD_W = 380;
const GAP = 12;
const EDGE = 8; // viewport breathing room

type Anchor = { top: number; bottom: number; left: number; right: number };

export function SkillHoverCard({ skill, children, why }: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const capture = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    setAnchor({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
  };

  const onEnter = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (open) return;
    openTimer.current = setTimeout(() => { capture(); setOpen(true); }, 220);
  };
  const onLeave = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  };

  useEffect(() => {
    if (!open) return;
    const onScroll = () => capture();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  useEffect(() => () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <div ref={wrapRef} className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
      {open && anchor && <HoverPanel skill={skill} why={why} anchor={anchor} />}
    </div>
  );
}

function HoverPanel({ skill, why, anchor }: { skill: string; why?: string; anchor: Anchor }) {
  const curated = resourcesFor(skill);
  const userRes = useUserResources(skill);
  const ms = useSkillMilestones(skill);
  const jobsRaw = useQuery(convexApi.jobs.list, {
    skill,
    min_score: 50,
    limit: 4,
  });
  const jobsQ = { data: jobsRaw as JobsResponse | undefined };
  const allRes = [...userRes.items, ...curated];
  const doneCount = ms.items.filter((m) => m.done).length;

  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = panelRef.current;
      if (!el) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const available = vh - 2 * EDGE;
      const desired = Math.min(el.scrollHeight, Math.min(600, available));
      const cardH = desired;

      // Horizontal: anchor right of row, clamp to right edge.
      const ideal = anchor.right + GAP;
      let left = Math.min(ideal, vw - CARD_W - EDGE);
      left = Math.max(EDGE, left);

      // Vertical: prefer top-aligned with anchor. If card would overflow bottom,
      // flip upward (align bottom with anchor.bottom). Then clamp into viewport.
      let top = anchor.top;
      if (top + cardH > vh - EDGE) {
        top = anchor.bottom - cardH;
      }
      top = Math.max(EDGE, Math.min(top, vh - cardH - EDGE));

      setPos({ top, left, maxHeight: cardH });
    };
    place();
    const onWin = () => place();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [anchor, allRes.length, ms.items.length, jobsQ.data?.items.length]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: CARD_W,
        maxHeight: pos?.maxHeight ?? "min(70vh, 600px)",
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-50 max-w-[92vw] rounded-xl border border-border/80 bg-popover/95 backdrop-blur-xl shadow-2xl p-4 overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-sm">{skill}</div>
        <Link
          href={`/learn/${encodeURIComponent(skill)}`}
          className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
        >
          open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {why && (
        <div className="mb-3 text-[11px] text-primary/85 italic flex items-start gap-1.5 leading-relaxed">
          <Sparkles className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{why}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
        <Stat icon={<ListChecks className="h-3 w-3" />} label="milestones" value={`${doneCount}/${ms.items.length}`} />
        <Stat icon={<BookOpen className="h-3 w-3" />} label="resources" value={String(allRes.length)} />
        <Stat icon={<Briefcase className="h-3 w-3" />} label="jobs" value={String(jobsQ.data?.items.length ?? 0)} />
      </div>

      {allRes.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Top resources</div>
          <ul className="space-y-0.5">
            {allRes.slice(0, 3).map((r) => (
              <li key={r.url}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-accent/50 truncate"
                >
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{r.title}</span>
                  <span className="text-[9px] uppercase text-muted-foreground">{r.kind}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ms.items.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Next milestones</div>
          <ul className="space-y-0.5">
            {ms.items.filter((m) => !m.done).slice(0, 3).map((m) => (
              <li key={m._id} className="text-xs px-2 py-0.5 text-foreground/80 truncate">
                — {m.text}
              </li>
            ))}
            {ms.items.filter((m) => !m.done).length === 0 && (
              <li className="text-xs px-2 py-0.5 text-emerald-500">All done ✓</li>
            )}
          </ul>
        </div>
      )}

      {(jobsQ.data?.items.length ?? 0) > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Hot jobs</div>
          <ul className="space-y-0.5">
            {(jobsQ.data?.items ?? []).slice(0, 3).map((j) => (
              <li key={j.id}>
                <a
                  href={j.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-accent/50"
                >
                  <span className={`tabular-nums font-semibold shrink-0 ${j.score >= 80 ? "text-emerald-500" : j.score >= 60 ? "text-amber-500" : "text-muted-foreground"}`}>
                    {j.score}
                  </span>
                  <span className="truncate flex-1">{j.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {allRes.length === 0 && ms.items.length === 0 && (jobsQ.data?.items.length ?? 0) === 0 && (
        <p className="text-[11px] text-muted-foreground italic">Open the skill to add resources, milestones, and explore jobs.</p>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 py-1.5">
      <div className="inline-flex items-center gap-1 justify-center text-foreground">
        {icon}
        <span className="font-mono text-xs tabular-nums">{value}</span>
      </div>
      <div className="text-[9px] mt-0.5">{label}</div>
    </div>
  );
}
