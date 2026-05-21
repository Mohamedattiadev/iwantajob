"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOnboarded } from "@/lib/onboarding";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { onboarded } = useOnboarded();
  const pathname = usePathname();
  const router = useRouter();

  // Shared sketch links are opened from external devices (iPad) that have no
  // onboarding state. Don't gate them — otherwise the page redirects to
  // /welcome and the viewer sees a black screen.
  const isPublicRoute = pathname?.startsWith("/sketch/") || pathname === "/welcome";

  useEffect(() => {
    if (!isPublicRoute && onboarded === false && pathname !== "/welcome") {
      router.replace("/welcome");
    }
  }, [onboarded, pathname, router, isPublicRoute]);

  if (isPublicRoute) return <>{children}</>;
  if (onboarded === null) return null;
  return <>{children}</>;
}
