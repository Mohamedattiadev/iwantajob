"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PencilRuler } from "lucide-react";

// Bottom-right launcher pill. Positioned by parent FabCluster (flex row),
// so Tasks badge width can't shove Excalidraw underneath it.
// Hides itself on /scratch + /sketch so it never covers the canvas.
export function ScratchFab() {
  const pathname = usePathname();
  if (pathname?.startsWith("/excalidraw") || pathname?.startsWith("/scratch") || pathname?.startsWith("/sketch")) return null;
  return (
    <Link
      href="/excalidraw"
      title="Excalidraw — sketch / whiteboard"
      aria-label="Excalidraw"
      className="scratch-launcher group inline-flex items-center gap-2 h-10 pl-3 pr-3.5 rounded-full bg-background/80 backdrop-blur-md text-foreground/90 hover:text-foreground border border-border/60 hover:border-primary/40 shadow-md shadow-black/10 hover:shadow-lg hover:-translate-y-0.5 transition-all"
    >
      <PencilRuler className="h-4 w-4 text-primary opacity-90 group-hover:opacity-100" />
      <span className="text-[12px] font-medium tracking-tight">Excalidraw</span>
    </Link>
  );
}
