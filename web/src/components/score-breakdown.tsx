"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

type Skill = { skill: string; level?: number };
type Props = {
  score: number;
  matched: Skill[];
  missed: Skill[];
  toneClass: string;
};

const W = 320;
const EDGE = 8;

export function ScoreBreakdown({ score, matched, missed, toneClass }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      const p = panelRef.current;
      if (!r || !p) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = r.right - W;
      left = Math.max(EDGE, Math.min(left, vw - W - EDGE));
      let top = r.bottom + 6;
      const h = p.scrollHeight;
      if (top + h > vh - EDGE) top = Math.max(EDGE, r.top - h - 6);
      setPos({ top, left });
    };
    place();
    const onWin = () => place();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className={`shrink-0 inline-flex items-center justify-center min-w-[40px] h-7 px-2 rounded-full text-xs font-bold tabular-nums ring-1 ${toneClass} hover:brightness-110 cursor-pointer`}
        title="Click for breakdown"
        aria-expanded={open}
      >
        {score}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          style={{
            position: "fixed",
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: W,
            visibility: pos ? "visible" : "hidden",
          }}
          className="z-50 max-w-[92vw] rounded-xl border border-border/80 bg-popover/95 backdrop-blur-xl shadow-2xl p-3 text-xs animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center gap-1.5 mb-2 font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Score breakdown — <span className="tabular-nums">{score}</span>
          </div>
          <div className="mb-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
              Matched ({matched.length})
            </div>
            {matched.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No skills matched this posting.</p>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {matched.map((m) => (
                  <li
                    key={m.skill}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20"
                  >
                    {m.skill}
                    {typeof m.level === "number" && (
                      <span className="ml-1 opacity-70 tabular-nums">·lvl{m.level}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {missed.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Your skills not in this posting ({missed.length})
              </div>
              <ul className="flex flex-wrap gap-1">
                {missed.slice(0, 12).map((m) => (
                  <li
                    key={m.skill}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground ring-1 ring-foreground/10"
                  >
                    {m.skill}
                    {typeof m.level === "number" && (
                      <span className="ml-1 opacity-70 tabular-nums">·lvl{m.level}</span>
                    )}
                  </li>
                ))}
                {missed.length > 12 && (
                  <li className="px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    +{missed.length - 12}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
