"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { TodoDrawer } from "@/components/todo-drawer";
import { ScratchFab } from "@/components/scratch-fab";

// Floating cluster that collapses to a single chevron button by default
// so the corner stays clean. Click to fan out Tasks + Excalidraw pills.
// Persists open/closed state per browser.
export function FabCluster() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("fabCluster:open");
      if (raw === "1") setOpen(true);
    } catch {}
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem("fabCluster:open", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  return (
    <div className="fixed bottom-5 right-20 z-30 flex flex-row-reverse items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Collapse tools" : "Expand tools"}
        title={open ? "Hide tools" : "Show tools"}
        className="h-10 w-10 grid place-items-center rounded-full bg-background/80 backdrop-blur-md border border-border/60 hover:border-primary/40 text-foreground/80 hover:text-foreground shadow-md shadow-black/10 hover:shadow-lg transition-all"
      >
        {open ? <X className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
      {open && (
        <>
          <TodoDrawer />
          <ScratchFab />
        </>
      )}
    </div>
  );
}
