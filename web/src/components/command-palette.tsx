"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { FileText, GraduationCap, Briefcase, Send, Sparkles, RefreshCw, Pencil, Home } from "lucide-react";
import { API, post } from "@/lib/api";
import { toast } from "sonner";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => { setOpen(false); router.push(href); };
  const scrape = async () => {
    setOpen(false);
    try { await post("/api/scrape"); toast.info("Scrape queued"); }
    catch { toast.error("Failed"); }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search routes, actions…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go("/")}><Home className="mr-2 h-4 w-4" />Overview<CommandShortcut>g o</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go("/cv")}><FileText className="mr-2 h-4 w-4" />CV<CommandShortcut>g c</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go("/learn")}><GraduationCap className="mr-2 h-4 w-4" />Learn<CommandShortcut>g l</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go("/jobs")}><Briefcase className="mr-2 h-4 w-4" />Jobs<CommandShortcut>g j</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go("/apply")}><Send className="mr-2 h-4 w-4" />Apply<CommandShortcut>g a</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go("/draw")}><Pencil className="mr-2 h-4 w-4" />Draw<CommandShortcut>g d</CommandShortcut></CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={scrape}><RefreshCw className="mr-2 h-4 w-4" />Scrape new jobs</CommandItem>
          <CommandItem onSelect={() => { setOpen(false); window.dispatchEvent(new Event("open-chat")); }}>
            <Sparkles className="mr-2 h-4 w-4" />Open coach (chat)
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
