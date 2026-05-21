"use client";
import { createContext, useContext, useEffect, useState } from "react"; // useState retained for provider
import { Minimize2, Maximize2, Square } from "lucide-react";

export type PageWidth = "default" | "wide" | "full";
const KEY = "app:width";

const Ctx = createContext<{ width: PageWidth; setWidth: (w: PageWidth) => void } | null>(null);

export function PageWidthProvider({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState<PageWidth>("default");

  useEffect(() => {
    try {
      const stored = (localStorage.getItem(KEY) as PageWidth) || "default";
      setWidth(stored);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.dataset.width = width;
    try { localStorage.setItem(KEY, width); } catch {}
  }, [width]);

  return <Ctx.Provider value={{ width, setWidth }}>{children}</Ctx.Provider>;
}

export function usePageWidth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePageWidth outside PageWidthProvider");
  return v;
}

export function PageWidthToggle() {
  const { width, setWidth } = usePageWidth();

  const items: { v: PageWidth; icon: React.ReactNode; label: string }[] = [
    { v: "default", icon: <Minimize2 className="h-3.5 w-3.5" />, label: "Default width" },
    { v: "wide",    icon: <Square    className="h-3.5 w-3.5" />, label: "Wide" },
    { v: "full",    icon: <Maximize2 className="h-3.5 w-3.5" />, label: "Full screen" },
  ];
  return (
    <div className="hidden md:inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-card/50 p-0.5" title="Page width">
      {items.map((o) => (
        <button
          key={o.v}
          onClick={() => setWidth(o.v)}
          title={o.label}
          aria-label={o.label}
          className={`h-6 w-6 grid place-items-center rounded transition-colors ${
            width === o.v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
          }`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
