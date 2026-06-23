"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useConvexAuth } from "convex/react";
import { useOnboarded } from "@/lib/onboarding";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const { onboarded } = useOnboarded();
  const { isAuthenticated, isLoading } = useConvexAuth();

  const isWelcome = pathname === "/welcome";
  const isLogin = pathname === "/login";
  const force = sp.get("force") === "1";

  useEffect(() => {
    if (isLoading) return;

    // Authenticated user hitting /login → home (unless ?force=1 to re-auth).
    if (isLogin) {
      if (isAuthenticated && !force) router.replace("/");
      return;
    }

    // /welcome is only valid for authed users who have NOT onboarded yet.
    // Onboarded users get bounced home; ?force=1 lets settings re-run it.
    if (isWelcome) {
      if (!isAuthenticated) { router.replace("/login"); return; }
      if (onboarded === true && !force) router.replace("/");
      return;
    }

    // All other routes require auth + completed onboarding.
    if (!isAuthenticated) { router.replace("/login"); return; }
    if (onboarded === false) router.replace("/welcome");
  }, [pathname, isLogin, isWelcome, force, router, onboarded, isAuthenticated, isLoading]);

  return <>{children}</>;
}
