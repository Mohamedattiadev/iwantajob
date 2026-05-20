import * as React from "react"
import { cn } from "@/lib/utils"

type AccentColor = "violet" | "emerald" | "amber" | "sky" | "slate" | "rose"

const accentRing: Record<AccentColor, string> = {
  violet:  "ring-1 ring-violet-500/25",
  emerald: "ring-1 ring-emerald-500/25",
  amber:   "ring-1 ring-amber-500/25",
  sky:     "ring-1 ring-sky-500/25",
  slate:   "ring-1 ring-slate-500/20",
  rose:    "ring-1 ring-rose-500/25",
}

const accentGlow: Record<AccentColor, string> = {
  violet:  "shadow-violet-500/20",
  emerald: "shadow-emerald-500/20",
  amber:   "shadow-amber-500/20",
  sky:     "shadow-sky-500/20",
  slate:   "shadow-slate-500/15",
  rose:    "shadow-rose-500/20",
}

const accentLine: Record<AccentColor, string> = {
  violet:  "bg-violet-500/70",
  emerald: "bg-emerald-500/70",
  amber:   "bg-amber-400/70",
  sky:     "bg-sky-500/70",
  slate:   "bg-slate-400/60",
  rose:    "bg-rose-500/70",
}

const cornerGlowColor: Record<AccentColor, string> = {
  violet:  "bg-violet-500",
  emerald: "bg-emerald-500",
  amber:   "bg-amber-400",
  sky:     "bg-sky-500",
  slate:   "bg-slate-400",
  rose:    "bg-rose-500",
}

type CardProps = React.ComponentProps<"div"> & {
  size?: "default" | "sm";
  /** BTK-style accent color (defaults to violet) */
  accentColor?: AccentColor;
  /** Show a colored line across the top */
  showAccentLine?: boolean;
  /** Show a colored glow blob in the corner */
  showCornerGlow?: boolean;
  /** "default" plain glass, "gradient" both line+glow, "glow" hover lift */
  variant?: "default" | "gradient" | "glow";
};

function Card({
  className,
  size = "default",
  accentColor = "violet",
  showAccentLine = false,
  showCornerGlow = false,
  variant = "default",
  children,
  ...props
}: CardProps) {
  const isGradient = variant === "gradient";
  const isGlow = variant === "glow";
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card glass relative overflow-hidden rounded-2xl text-card-foreground flex flex-col",
        isGradient && accentRing[accentColor],
        isGlow && ["cursor-pointer shadow-lg transition-transform hover:-translate-y-0.5", accentGlow[accentColor]],
        className,
      )}
      {...props}
    >
      {(showAccentLine || isGradient) && (
        <div className={cn("absolute top-0 left-0 right-0 h-0.5 z-10", accentLine[accentColor])} />
      )}
      {(showCornerGlow || isGradient) && (
        <div
          aria-hidden
          className={cn(
            "absolute -top-1/3 -right-12 w-32 h-32 rounded-full blur-3xl opacity-25 group-hover/card:opacity-40 transition-opacity pointer-events-none",
            cornerGlowColor[accentColor],
          )}
        />
      )}
      <div className="relative flex flex-col gap-4 py-4">{children}</div>
    </div>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min items-start gap-1 px-5 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-5 group-data-[size=sm]/card:px-3", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center border-t border-foreground/8 px-5 pt-3 pb-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
