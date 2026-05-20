"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  pageSize,
  totalShown,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  totalShown: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(totalShown / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalShown);

  if (pages <= 1) {
    return (
      <div className="text-center text-xs text-muted-foreground pt-2 tabular-nums">
        {totalShown} of {total}
      </div>
    );
  }

  const nums = pageNumbers(page, pages);

  return (
    <nav className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-foreground/10">
      <div className="text-xs text-muted-foreground tabular-nums">
        Showing <span className="text-foreground">{start}–{end}</span> of <span className="text-foreground">{totalShown}</span>
        {totalShown < total && <span> · {total} matched, top {totalShown} loaded</span>}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {nums.map((n, i) =>
          n === "…" ? (
            <span key={`g${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`h-8 min-w-8 px-2 rounded-md text-xs font-medium tabular-nums transition-colors ${
                n === page
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                  : "border border-border bg-card hover:bg-accent text-foreground/80"
              }`}
            >
              {n}
            </button>
          ),
        )}
        <button
          onClick={() => onChange(Math.min(pages, page + 1))}
          disabled={page === pages}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) out.push("…");
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push("…");
  out.push(total);
  return out;
}
