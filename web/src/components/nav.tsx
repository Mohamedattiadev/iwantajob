"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  LayoutGrid, FileUser, GraduationCap, Briefcase, Sparkles,
  Search, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageWidthToggle } from "@/components/page-width";

// Top-level surfaces only. Apply lives inside Jobs, Interview lives inside Assistant.
const links = [
  { href: "/",          label: "Overview",  icon: LayoutGrid },
  { href: "/cv",        label: "CV",        icon: FileUser },
  { href: "/learn",     label: "Learn",     icon: GraduationCap },
  { href: "/jobs",      label: "Jobs",      icon: Briefcase },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];

const JOBS_GROUP = ["/jobs", "/apply"];
const ASSISTANT_GROUP = ["/assistant", "/interview"];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/jobs") return JOBS_GROUP.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (href === "/assistant") return ASSISTANT_GROUP.some((p) => pathname === p || pathname.startsWith(p + "/"));
  return pathname === href || pathname.startsWith(href + "/");
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl border-b border-border/60">
      <div aria-hidden className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent pointer-events-none" />

      <div className="max-w-7xl w-full mx-auto h-12 grid grid-cols-3 items-center gap-4 px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="group flex items-center gap-2 shrink-0 justify-self-start">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-primary/60 grid place-items-center text-background font-extrabold text-[11px] shadow-sm">
            W
          </div>
          <span className="hidden sm:inline text-[13px] font-bold tracking-tight">
            W<span className="text-primary mx-px">/</span>ORK
          </span>
        </Link>

        {/* Desktop nav — centered */}
        <ul className="hidden lg:flex items-center justify-center gap-0.5">
          {links.map((l) => {
            const Icon = l.icon;
            const active = isActive(pathname, l.href);
            return (
              <li key={l.href} className="relative">
                <Link
                  href={l.href}
                  className={cn(
                    "h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-[13px] transition-all",
                    active
                      ? "text-foreground bg-foreground/[0.06] font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", active ? "text-primary" : "")} />
                  {l.label}
                </Link>
                {active && (
                  <span className="absolute -bottom-[13px] left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full bg-primary" />
                )}
              </li>
            );
          })}
        </ul>

        {/* Compact mobile/tablet nav: icons only */}
        <ul className="flex lg:hidden items-center justify-center gap-0.5 overflow-x-auto">
          {links.map((l) => {
            const Icon = l.icon;
            const active = isActive(pathname, l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  title={l.label}
                  className={cn(
                    "h-8 w-8 grid place-items-center rounded-md transition-colors",
                    active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Right: width toggle + command palette + theme */}
        <div className="flex items-center justify-end gap-1.5 justify-self-end">
          <PageWidthToggle />
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))}
            className="hidden md:inline-flex items-center gap-2 h-7 px-2.5 rounded-md border border-border/60 bg-foreground/[0.03] text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
            aria-label="Command palette"
          >
            <Search className="h-3 w-3" />
            <span>Search</span>
            <kbd className="ml-1 font-mono text-[10px] px-1 rounded bg-foreground/[0.06]">⌘K</kbd>
          </button>
          <ThemeToggle />
          <button
            onClick={handleSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
