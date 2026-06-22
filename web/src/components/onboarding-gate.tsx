"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConvexAuth } from "convex/react";
import { useOnboarded } from "@/lib/onboarding";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { onboarded } = useOnboarded();
  const { isAuthenticated, isLoading } = useConvexAuth();

  const isPublicRoute = pathname === "/welcome" || pathname === "/login";

  useEffect(() => {
    if (isLoading) return;
    if (isPublicRoute) return;
    if (!isAuthenticated) { router.replace("/login"); return; }
    if (onboarded === false) router.replace("/welcome");
  }, [pathname, isPublicRoute, router, onboarded, isAuthenticated, isLoading]);

  return <>{children}</>;
}
