"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOnboarded } from "@/lib/onboarding";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { onboarded } = useOnboarded();

  const isPublicRoute = pathname === "/welcome";

  useEffect(() => {
    if (isPublicRoute) return;
    if (onboarded === false) router.replace("/welcome");
  }, [pathname, isPublicRoute, router, onboarded]);

  if (isPublicRoute) return <>{children}</>;
  // null = unauthenticated → let auth/middleware handle the redirect, don't block render.
  // undefined→null fallback already resolved in useOnboarded; only block when known-false.
  if (onboarded === false) return null;
  return <>{children}</>;
}
