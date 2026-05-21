"use client";
import { useEffect } from "react";

// Adds `app-main--bleed` to the layout's <main> while the calling component
// is mounted. Lets pages opt out of the global padded container (used by
// assistant/interview to fit viewport without scroll).
export function useFullBleed() {
  useEffect(() => {
    const el = document.querySelector("main.app-main");
    if (!el) return;
    el.classList.add("app-main--bleed");
    return () => { el.classList.remove("app-main--bleed"); };
  }, []);
}
