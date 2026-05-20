"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type PageTab = { href: string; label: string; icon?: React.ReactNode };

export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const pathname = usePathname();
  return (
    <nav className="inline-flex items-center gap-1 p-1 rounded-xl border border-border/60 bg-card/60 backdrop-blur">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] transition-colors",
              active
                ? "bg-primary/15 text-foreground font-medium ring-1 ring-primary/25"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]",
            )}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const JOBS_TABS: PageTab[] = [
  { href: "/jobs", label: "Browse" },
  { href: "/apply", label: "Pipeline" },
];

export const ASSISTANT_TABS: PageTab[] = [
  { href: "/assistant", label: "Chat" },
  { href: "/interview", label: "Interview" },
];
