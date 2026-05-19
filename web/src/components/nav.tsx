"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/", label: "00 · Overview" },
  { href: "/cv", label: "01 · CV" },
  { href: "/learn", label: "02 · Learn" },
  { href: "/jobs", label: "03 · Jobs" },
  { href: "/apply", label: "04 · Apply" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-foreground/10 glass-nav sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-8">
        <Link href="/" className="font-bold tracking-tight flex items-center gap-2">
          <span className="h-6 w-6 rounded bg-foreground text-background grid place-items-center text-xs font-mono">js</span>
          jobscraper
        </Link>
        <div className="flex items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden md:block">Mohamed Attia</span>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
