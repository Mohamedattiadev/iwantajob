"use client";
import { LEVELS } from "@/lib/proficiency";
import { cn } from "@/lib/utils";

export function ProficiencyControl({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex items-center rounded-md border bg-card p-0.5 shadow-sm">
      {LEVELS.map((lvl) => {
        const active = value === lvl.value;
        return (
          <button
            key={lvl.value}
            type="button"
            onClick={() => onChange(lvl.value)}
            title={lvl.label}
            className={cn(
              "rounded-sm font-mono font-semibold transition-colors",
              size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-xs",
              active
                ? lvl.color + " ring-1 ring-foreground/20"
                : "text-muted-foreground hover:bg-accent",
            )}
            aria-pressed={active}
            aria-label={`${lvl.label} (${lvl.value})`}
          >
            {lvl.short}
          </button>
        );
      })}
    </div>
  );
}

export function ProficiencyLabel({ value }: { value: number }) {
  const lvl = LEVELS[value] ?? LEVELS[0];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium", lvl.color)}>
      <span className="font-mono">{lvl.short}</span>
      <span>{lvl.label}</span>
    </span>
  );
}
