"use client";
import { useEffect, useState } from "react";
import { ListChecks, X } from "lucide-react";
import { WeeklyFocus } from "@/components/weekly-focus";
import { useUserPlans } from "@/lib/plans";

// Slide-in drawer accessible from a floating button. Lives globally so plans
// are reachable from any page without dedicating a route or stealing real
// estate on the dashboard.
export function TodoDrawer() {
  const [open, setOpen] = useState(false);
  const plans = useUserPlans();
  const active = plans.items.filter((p) => !p.done).length;
  const overdue = plans.items.filter((p) => {
    if (p.done || !p.due) return false;
    const d = new Date(p.due + "T00:00:00").getTime();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return d < today.getTime();
  }).length;

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Floating launcher — gradient pill, sits left of chat bubble */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open weekly focus"
        aria-label="Open weekly focus"
        className="tasks-launcher fixed bottom-5 right-20 z-30 group inline-flex items-center gap-2 h-10 pl-3 pr-3.5 rounded-full bg-background/80 backdrop-blur-md text-foreground/90 hover:text-foreground border border-border/60 hover:border-primary/40 shadow-md shadow-black/10 hover:shadow-lg hover:-translate-y-0.5 transition-all"
      >
        <ListChecks className="h-4 w-4 text-primary" />
        <span className="text-[12px] font-medium tracking-tight">Tasks</span>
        {active > 0 && (
          <span className={`min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular-nums grid place-items-center ring-1 ${
            overdue > 0 ? "bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-rose-500/30" : "bg-primary/15 text-primary ring-primary/25"
          }`}>
            {overdue > 0 ? `!${overdue}` : active}
          </span>
        )}
      </button>

      {/* Backdrop — dark wash so the page (including ambient blobs) reads as "dimmed". */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 dark:bg-black/60 animate-in fade-in duration-200"
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-50 h-dvh w-full sm:w-[760px] lg:w-[860px] bg-background/95 backdrop-blur-2xl border-l border-border/60 shadow-2xl transition-transform duration-250 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ backgroundImage: "radial-gradient(120% 60% at 100% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)" }}
        aria-hidden={!open}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="relative flex items-center justify-between px-5 py-4 border-b border-border/50">
            <div className="inline-flex items-center gap-2.5">
              <span className="h-8 w-8 grid place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
                <ListChecks className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold leading-tight">Weekly focus</h2>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {active === 0 ? "Nothing queued" : `${active} active${overdue > 0 ? ` · ${overdue} overdue` : ""}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden p-3 flex flex-col">
            {open && <WeeklyFocus plans={plans} compact />}
          </div>
        </div>
      </aside>
    </>
  );
}
