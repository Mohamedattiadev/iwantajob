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
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 px-4 sm:px-6 bg-white/70 dark:bg-black/30 backdrop-blur-xl backdrop-saturate-150 border-b border-black/6 dark:border-white/8 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
      <div aria-hidden className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />
      <div aria-hidden className="absolute -bottom-px inset-x-0 h-px bg-gradient-to-r from-transparent via-black/5 dark:via-white/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl w-full mx-auto flex items-center gap-8">
        <Link href="/" className="group flex items-center shrink-0">
          <span className="text-[18px] font-extrabold tracking-tight leading-none transition-transform group-hover:scale-[1.03] group-active:scale-95">
            W<span className="text-primary mx-[0.5px]">/</span>ORK
          </span>
        </Link>

        <ul className="hidden md:flex items-center gap-0.5">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
            return (
              <li key={l.href} className="relative">
                <Link
                  href={l.href}
                  className={cn(
                    "px-3 h-8 inline-flex items-center gap-2 rounded-lg text-sm transition-all",
                    active
                      ? "text-foreground bg-black/4 dark:bg-white/6"
                      : "text-foreground/55 hover:text-foreground hover:bg-black/3 dark:hover:bg-white/4",
                  )}
                >
                  <span className={cn("font-mono text-[10px]", active ? "text-primary" : "text-foreground/35")}>{l.n}</span>
                  <span>{l.label}</span>
                </Link>
                {active && (
                  <span className="absolute -bottom-[15px] left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
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
            className="hidden md:inline-flex items-center gap-1 rounded-lg border border-black/8 dark:border-white/10 bg-white/40 dark:bg-white/[0.03] px-2 h-7 text-[11px] text-foreground/55 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/8 transition-colors font-mono shadow-sm"
            aria-label="Command palette"
          >
            <kbd className="text-[13px] leading-none">⌘</kbd>
            <kbd className="leading-none">K</kbd>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
