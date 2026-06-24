"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useConvexAuth } from "convex/react";
import { Nav } from "@/components/nav";
import { AmbientBackground } from "@/components/ambient-bg";
import { OnboardingGate } from "@/components/onboarding-gate";

// Heavy / interactive-only chrome — code-split so the initial JS bundle
// stays small. None of these are needed before first paint.
const ChatWidget = dynamic(() => import("@/components/chat-widget").then((m) => m.ChatWidget), { ssr: false });
const FabCluster = dynamic(() => import("@/components/fab-cluster").then((m) => m.FabCluster), { ssr: false });
const CommandPalette = dynamic(() => import("@/components/command-palette").then((m) => m.CommandPalette), { ssr: false });

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
            <FabCluster />
            <CommandPalette />
          </>
        )}
      </OnboardingGate>
    </>
  );
}
