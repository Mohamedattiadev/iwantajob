"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const KEY = "jobscraper:onboarded";

function readOnboarded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  const isPublicRoute = pathname === "/welcome";

  useEffect(() => {
    if (isPublicRoute) {
      setChecked(true);
      return;
    }
    if (!readOnboarded()) {
      router.replace("/welcome");
      return;
    }
    setChecked(true);
  }, [pathname, isPublicRoute, router]);

  if (!checked) return null;
  return <>{children}</>;
}
