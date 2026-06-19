"use client";

import { usePathname } from "next/navigation";
import { Nav } from "@/components/nav";
import { ChatWidget } from "@/components/chat-widget";
import { TodoDrawer } from "@/components/todo-drawer";
import { ScratchFab } from "@/components/scratch-fab";
import { CommandPalette } from "@/components/command-palette";
import { AmbientBackground } from "@/components/ambient-bg";
import { OnboardingGate } from "@/components/onboarding-gate";

// Routes that should mount a *lean* shell — no nav, no chat widget,
// no todo drawer, no ambient bg, no onboarding gate. Just the page.
// Cuts ~600 KB of React work out of the canvas LCP path.
const LEAN_PREFIXES = ["/excalidraw", "/scratch", "/draw"];
const LEAN_SUBROUTES = ["/sketch/"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const lean =
    LEAN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    LEAN_SUBROUTES.some((p) => pathname.startsWith(p));
  if (lean) {
    return <main className="app-main flex-1 w-full flex flex-col min-h-0">{children}</main>;
  }
  return (
    <>
      <AmbientBackground />
      <OnboardingGate>
        <Nav />
        <main className="app-main flex-1 w-full mx-auto flex flex-col min-h-0">{children}</main>
        <ChatWidget />
        <TodoDrawer />
        <ScratchFab />
        <CommandPalette />
      </OnboardingGate>
    </>
  );
}
