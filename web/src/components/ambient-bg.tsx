"use client";

// Global ambient background — CSS-only, no JS, no canvas.
// Two soft radial blobs + a 24px dot grid + horizon vignette.
// Lives behind everything; pointer-events:none.
export function AmbientBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.18] dark:opacity-[0.22]"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklab, var(--foreground) 30%, transparent) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 85%)",
        }}
      />
      {/* Top-left indigo blob */}
      <div
        className="absolute -top-1/3 -left-1/4 w-[60vw] h-[60vw] rounded-full blur-3xl opacity-30 dark:opacity-40"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 65%, transparent), transparent 70%)",
        }}
      />
      {/* Bottom-right violet blob */}
      <div
        className="absolute -bottom-1/3 -right-1/4 w-[55vw] h-[55vw] rounded-full blur-3xl opacity-25 dark:opacity-35"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, #8b5cf6 70%, transparent), transparent 70%)",
        }}
      />
      {/* Horizon vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, transparent 60%, color-mix(in oklab, var(--background) 50%, transparent) 100%)",
        }}
      />
    </div>
  );
}
