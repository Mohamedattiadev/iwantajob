"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOnboarded } from "@/lib/onboarding";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { onboarded } = useOnboarded();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = pathname === "/welcome";

  useEffect(() => {
    if (!isPublicRoute && onboarded === false && pathname !== "/welcome") {
      router.replace("/welcome");
    }
  }, [onboarded, pathname, router, isPublicRoute]);

  if (isPublicRoute) return <>{children}</>;
  if (onboarded === null) return null;
  return <>{children}</>;
}
