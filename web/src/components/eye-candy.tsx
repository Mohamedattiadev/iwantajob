"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 21st.dev-style components, hand-built so we own the code.
 * - <Aurora>          : animated radial gradient backdrop
 * - <GridBg>          : subtle dotted grid background pattern
 * - <MagicCard>       : card with pointer-following glow
 * - <Gradient>        : multi-stop gradient text
 * - <AnimatedNumber>  : tweens a number into view
 * - <Bento>           : 12-col grid scaffold + asymmetric layout
 */

export function Aurora({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)} aria-hidden>
      <div className="absolute -top-40 -left-20 w-[36rem] h-[36rem] rounded-full opacity-40 blur-3xl bg-[radial-gradient(closest-side,oklch(0.6_0.25_264),transparent)]" />
      <div className="absolute -top-20 right-[-10rem] w-[34rem] h-[34rem] rounded-full opacity-30 blur-3xl bg-[radial-gradient(closest-side,oklch(0.7_0.18_162),transparent)]" />
      <div className="absolute bottom-[-12rem] left-1/3 w-[32rem] h-[32rem] rounded-full opacity-25 blur-3xl bg-[radial-gradient(closest-side,oklch(0.65_0.22_295),transparent)]" />
    </div>
  );
}

export function GridBg({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10",
        "[background-image:linear-gradient(to_right,color-mix(in_oklch,var(--foreground)_6%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--foreground)_6%,transparent)_1px,transparent_1px)]",
        "[background-size:40px_40px]",
        "[mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]",
        className,
      )}
    />
  );
}

export function MagicCard({
  children,
  className,
  glow = "indigo",
}: {
  children: React.ReactNode;
  className?: string;
  glow?: "indigo" | "emerald" | "amber" | "rose" | "violet" | "sky" | "slate";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const colors: Record<string, string> = {
    indigo:  "oklch(0.7 0 0 / 0.35)",
    emerald: "oklch(0.7 0 0 / 0.35)",
    amber:   "oklch(0.7 0 0 / 0.35)",
    rose:    "oklch(0.7 0 0 / 0.35)",
    violet:  "oklch(0.7 0 0 / 0.35)",
    sky:     "oklch(0.7 0 0 / 0.35)",
    slate:   "oklch(0.65 0 0 / 0.3)",
  };

  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => setPos(null)}
      className={cn("relative rounded-2xl overflow-hidden", className)}
    >
      {pos && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity"
          style={{
            background: `radial-gradient(240px circle at ${pos.x}px ${pos.y}px, ${colors[glow]}, transparent 60%)`,
          }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

export function Gradient({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/50",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AnimatedNumber({
  value,
  duration = 600,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = shown;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={cn("tabular-nums", className)}>{shown.toLocaleString()}</span>;
}

export function Bento({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 auto-rows-[minmax(160px,auto)]", className)}>
      {children}
    </div>
  );
}
