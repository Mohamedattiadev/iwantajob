"use client";

import { SkillSketch, SketchPreloader } from "@/components/skill-sketch";

// General-purpose scratchpad. Opens the full SkillSketch immediately
// (defaultFull) so the user lands on a clean fullscreen canvas with all
// laptop features (frames, present, AI, share/export, pen QR, templates,
// minimap, live collab). `homeHref="/"` injects a Home pill into the
// fullscreen overlay. Backend doc slug = `skill-scratchpad`.
export default function ScratchPage() {
  return (
    <>
      <SketchPreloader />
      <SkillSketch skill="Scratchpad" homeHref="/" defaultFull />
    </>
  );
}
