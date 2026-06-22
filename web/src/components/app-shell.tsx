"use client";

import { usePathname } from "next/navigation";
import { useConvexAuth } from "convex/react";
import { Nav } from "@/components/nav";
import { ChatWidget } from "@/components/chat-widget";
import { TodoDrawer } from "@/components/todo-drawer";
import { ScratchFab } from "@/components/scratch-fab";
import { CommandPalette } from "@/components/command-palette";
import { AmbientBackground } from "@/components/ambient-bg";
import { OnboardingGate } from "@/components/onboarding-gate";

const LEAN_PREFIXES = ["/excalidraw", "/scratch", "/draw"];
const LEAN_SUBROUTES = ["/sketch/"];
const PUBLIC_PREFIXES = ["/login", "/welcome"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const { isAuthenticated } = useConvexAuth();
  const lean =
    LEAN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    LEAN_SUBROUTES.some((p) => pathname.startsWith(p));
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (lean) {
    return <main className="app-main flex-1 w-full flex flex-col min-h-0">{children}</main>;
  }
  const showAuthChrome = isAuthenticated && !isPublic;
  return (
    <>
      <AmbientBackground />
      <OnboardingGate>
        {showAuthChrome && <Nav />}
        <main className={`app-main flex-1 w-full mx-auto flex flex-col min-h-0 ${showAuthChrome ? "app-main--with-fabs" : ""}`}>{children}</main>
        {showAuthChrome && (
          <>
            <ChatWidget />
            <TodoDrawer />
            <ScratchFab />
            <CommandPalette />
          </>
        )}
      </OnboardingGate>
    </>
  );
}
