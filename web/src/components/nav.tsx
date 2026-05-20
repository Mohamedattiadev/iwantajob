"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/",      n: "00", label: "Overview" },
  { href: "/cv",    n: "01", label: "CV" },
  { href: "/learn", n: "02", label: "Learn" },
  { href: "/jobs",  n: "03", label: "Jobs" },
  { href: "/apply", n: "04", label: "Apply" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 px-4 sm:px-6 bg-white/75 dark:bg-black/25 backdrop-blur-xl border-b border-black/6 dark:border-white/8">
      <div aria-hidden className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none" />

      <div className="max-w-6xl w-full mx-auto flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="h-7 w-7 rounded-lg grid place-items-center text-[10px] font-mono font-bold text-white shadow-md shadow-primary/30 ring-1 ring-white/20"
                style={{ background: "linear-gradient(135deg, oklch(0.545 0.24 264.376), oklch(0.50 0.22 220))" }}>
            IW
          </span>
          <span className="text-[15px] font-semibold tracking-tight">IWANTAJOB</span>
        </Link>

        <ul className="hidden md:flex items-center gap-0.5">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
            return (
              <li key={l.href} className="relative">
                <Link
                  href={l.href}
                  className={cn(
                    "px-3 h-8 inline-flex items-center gap-2 rounded-md text-sm transition-colors",
                    active
                      ? "text-foreground"
                      : "text-foreground/50 hover:text-foreground/85",
                  )}
                >
                  <span className="font-mono text-[10px] text-foreground/35">{l.n}</span>
                  <span>{l.label}</span>
                </Link>
                {active && (
                  <span className="absolute -bottom-[15px] left-3 right-3 h-px bg-primary" />
                )}
              </li>
            );
          })}
        </ul>

        <ul className="md:hidden flex items-center gap-0.5 overflow-x-auto">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={cn(
                    "px-2.5 h-7 inline-flex items-center rounded-md text-xs",
                    active ? "bg-primary/10 text-primary" : "text-foreground/50",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))}
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-black/8 dark:border-white/10 px-2 py-1 text-[11px] text-foreground/50 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/8 transition-colors font-mono"
            aria-label="Command palette"
          >
            <span className="text-xs">⌘</span>K
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
