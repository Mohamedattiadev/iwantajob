"use client";
import { useEffect, useState } from "react";

const KEY = "jobscraper:onboarded";

export function useOnboarded() {
  const [state, setState] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setState(localStorage.getItem(KEY) === "1");
    } catch {
      setState(false);
    }
  }, []);
  return {
    onboarded: state,
    finish: () => {
      try { localStorage.setItem(KEY, "1"); } catch {}
      setState(true);
    },
    reset: () => {
      try { localStorage.removeItem(KEY); } catch {}
      setState(false);
    },
  };
}
