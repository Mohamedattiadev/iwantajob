"use client";
import { Badge } from "@/components/ui/badge";
import { Gradient } from "@/components/eye-candy";

type Props = {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  /** When true, wrap title in <Gradient> automatically. */
  gradient?: boolean;
};

export function PageHeader({ eyebrow, title, subtitle, action, gradient = false }: Props) {
  return (
    <header className="anim-in flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
      <div className="max-w-2xl">
        {eyebrow && (
          <Badge variant="outline" className="mb-4 text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-0.5">
            {eyebrow}
          </Badge>
        )}
        <h1 className="font-serif text-balance text-5xl sm:text-6xl font-normal tracking-tight leading-[0.95]">
          {gradient ? <Gradient>{title}</Gradient> : title}
        </h1>
        {subtitle && (
          <p className="text-pretty mt-4 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
  link,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  link?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground mb-2">{eyebrow}</div>
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>}
      </div>
      {link && (
        <a href={link.href} className="text-sm text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors">
          {link.label} →
        </a>
      )}
    </div>
  );
}
