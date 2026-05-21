"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotebookPen } from "lucide-react";

// Bottom-right launcher pill — sits in the same row as the Chat bubble
// (bottom-5 right-5) and Tasks pill (bottom-5 right-20). Slotted at
// right-[180px] so the three buttons read as one cluster. Hides itself
// inside sketch routes so it never covers the canvas.
export function ScratchFab() {
  const pathname = usePathname();
  if (pathname?.startsWith("/scratch") || pathname?.startsWith("/sketch")) return null;
  return (
    <Link
      href="/scratch"
      title="Scratchpad — quick notes / nonsense sketch"
      aria-label="Scratchpad"
      className="scratch-launcher fixed bottom-5 z-30 group inline-flex items-center gap-2 h-10 pl-3 pr-3.5 rounded-full bg-background/80 backdrop-blur-md text-foreground/90 hover:text-foreground border border-border/60 hover:border-primary/40 shadow-md shadow-black/10 hover:shadow-lg hover:-translate-y-0.5 transition-all"
      style={{ right: 208 }}
    >
      <NotebookPen className="h-4 w-4 text-primary opacity-90 group-hover:opacity-100" />
      <span className="text-[12px] font-medium">Scratch</span>
    </Link>
  );
}
