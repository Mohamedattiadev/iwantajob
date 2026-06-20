"use client";
import { useState } from "react";
import { Search, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAction } from "convex/react";
import { Input } from "@/components/ui/input";
import { api } from "../../convex/_generated/api";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  context?: "jobs" | "learn" | "skills";
  className?: string;
};

export function AiSearchInput({ value, onChange, placeholder, context = "jobs", className }: Props) {
  const [busy, setBusy] = useState(false);
  const improveAction = useAction(api.chat.improveSearch);

  const improve = async () => {
    if (!value.trim()) {
      toast.info("Type some keywords first — AI sharpens them.");
      return;
    }
    setBusy(true);
    try {
      const d = await improveAction({ query: value, context });
      if (d.error) throw new Error(d.error);
      if (d.query && d.query !== value) {
        onChange(d.query);
        toast.success(`AI: "${value}" → "${d.query}"`);
      } else {
        toast.info("Already optimal.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Improve failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) improve(); }}
        placeholder={placeholder}
        className="pl-10 pr-24 h-12 text-base"
      />
      <button
        type="button"
        onClick={improve}
        disabled={busy}
        title="AI: sharpen this query (⌘+Enter)"
        className="group absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md text-primary/90 hover:text-primary bg-primary/5 hover:bg-primary/10 ring-1 ring-primary/15 hover:ring-primary/30 disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        <span className="text-[11px] font-medium tracking-wide">AI</span>
      </button>
    </div>
  );
}
