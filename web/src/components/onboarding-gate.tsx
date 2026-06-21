"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOnboarded } from "@/lib/onboarding";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { onboarded } = useOnboarded();

  const isPublicRoute = pathname === "/welcome" || pathname === "/login";

  useEffect(() => {
    if (isPublicRoute) return;
    if (onboarded === false) router.replace("/welcome");
  }, [pathname, isPublicRoute, router, onboarded]);

  return <>{children}</>;
}
