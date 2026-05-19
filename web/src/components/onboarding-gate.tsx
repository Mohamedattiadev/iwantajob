"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOnboarded } from "@/lib/onboarding";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { onboarded } = useOnboarded();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (onboarded === false && pathname !== "/welcome") {
      router.replace("/welcome");
    }
  }, [onboarded, pathname, router]);

  // Render nothing while we don't yet know — avoids flash on first visit.
  if (onboarded === null) return null;
  return <>{children}</>;
}
