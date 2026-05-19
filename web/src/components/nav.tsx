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
  { href: "/draw",  n: "05", label: "Draw" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-foreground/10 glass-nav sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 h-14 flex items-center gap-10">
        <Link href="/" className="font-semibold tracking-tight flex items-center gap-2.5">
          <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 grid place-items-center text-[10px] font-mono font-bold text-white shadow-md shadow-indigo-500/30 ring-1 ring-white/20">
            IW
          </span>
          <span className="text-[15px]">IWANTAJOB</span>
        </Link>

        <ul className="hidden md:flex items-center gap-0.5">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
            return (
              <li key={l.href} className="relative">
                <Link
                  href={l.href}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm transition-colors inline-flex items-baseline gap-2",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="font-mono text-[10px] text-muted-foreground">{l.n}</span>
                  <span>{l.label}</span>
                </Link>
                {active && (
                  <span className="absolute -bottom-[15px] left-3 right-3 h-px bg-foreground" />
                )}
              </li>
            );
          })}
        </ul>

        {/* Mobile compact tabs */}
        <ul className="md:hidden flex items-center gap-0.5 overflow-x-auto">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs",
                    active ? "bg-accent" : "text-muted-foreground",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))}
            className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-foreground/15 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors font-mono"
            aria-label="Command palette"
          >
            <span className="text-xs">⌘</span>K
          </button>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
