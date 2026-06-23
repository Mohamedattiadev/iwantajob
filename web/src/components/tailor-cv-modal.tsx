"use client";

import { useEffect, useState } from "react";
import { Sparkles, Download, X, Check, RotateCcw } from "lucide-react";
import { useAction, useMutation } from "convex/react";
import { api as convexApi } from "../../convex/_generated/api";
import { renderHtml } from "@/lib/cv-render";
import type { Profile } from "@/lib/api";
import type { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

type Pair = { original: string; tailored: string };
type Tailored = {
  summary: string;
  experience: Pair[];
  projects: Pair[];
  job: { id: string; title: string; company: string | null };
};

type Props = {
  jobId: Id<"jobs_pool">;
  jobTitle: string;
  jobCompany: string | null;
  profile: Profile;
  onClose: () => void;
};

export function TailorCvModal({ jobId, jobTitle, jobCompany, profile, onClose }: Props) {
  const tailor = useAction(convexApi.cv.tailor);
  const saveDraft = useMutation(convexApi.cv_drafts.save);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Tailored | null>(null);
  // Toggles per entry — true means use tailored, false means use original.
  const [accept, setAccept] = useState<{ summary: boolean; experience: boolean[]; projects: boolean[] } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await tailor({ jobId })) as Tailored;
        if (cancelled) return;
        setData(res);
        setAccept({
          summary: !!res.summary,
          experience: res.experience.map((p) => p.tailored !== p.original),
          projects: res.projects.map((p) => p.tailored !== p.original),
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [jobId, tailor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const buildTailoredProfile = (): Profile => {
    if (!data || !accept) return profile;
    const next = structuredClone(profile);
    if (accept.summary) {
      next.personal = { ...(next.personal ?? {}), summary: data.summary } as Profile["personal"];
    }
    next.experience = data.experience.map((p, i) => ({ raw: accept.experience[i] ? p.tailored : p.original }));
    next.projects = data.projects.map((p, i) => ({ raw: accept.projects[i] ? p.tailored : p.original }));
    return next;
  };

  const handleDownload = async () => {
    if (!data) return;
    setPdfBusy(true);
    const tailored = buildTailoredProfile();
    const template = (typeof window !== "undefined" && localStorage.getItem("cv:template")) || "compact";
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = "794px";
    iframe.style.height = "1123px";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    try {
      const html = renderHtml(tailored as never, 3, template, false);
      const doc = iframe.contentDocument;
      if (!doc) throw new Error("iframe doc unavailable");
      doc.open();
      doc.write(html);
      doc.close();
      await new Promise<void>((resolve) => {
        if (doc.readyState === "complete") resolve();
        else iframe.onload = () => resolve();
      });
      await new Promise((r) => setTimeout(r, 100));
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const canvas = await html2canvas(doc.body, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 794,
        windowWidth: 794,
      });
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const A4_W = 210;
      const A4_H = 297;
      const imgRatio = canvas.height / canvas.width;
      let pdfW = A4_W;
      let pdfH = pdfW * imgRatio;
      if (pdfH > A4_H) { pdfH = A4_H; pdfW = pdfH / imgRatio; }
      const x = (A4_W - pdfW) / 2;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, 0, pdfW, pdfH);
      const safe = (jobCompany || jobTitle).replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
      pdf.save(`cv-${safe}.pdf`);
      try {
        await saveDraft({
          jobId,
          payload_json: JSON.stringify({
            tailored: data,
            accept,
            savedAt: Date.now(),
          }),
        });
      } catch { /* persistence is best-effort */ }
      toast.success("Tailored CV downloaded");
      onClose();
    } catch (e) {
      toast.error(`PDF failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      document.body.removeChild(iframe);
      setPdfBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Tailor CV"
        className="bg-popover/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-semibold">Tailor CV</div>
              <div className="text-[11px] text-muted-foreground line-clamp-1">
                {jobTitle}{jobCompany ? ` · ${jobCompany}` : ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm">
          {loading && (
            <div className="py-12 text-center text-muted-foreground">
              <Sparkles className="h-5 w-5 mx-auto mb-2 animate-pulse text-primary" />
              Tailoring with Gemini…
            </div>
          )}
          {error && (
            <div className="py-8 text-center text-rose-600 dark:text-rose-400 text-xs">
              {error}
            </div>
          )}
          {data && accept && (
            <>
              <DiffBlock
                label="Summary"
                original={profile.personal?.summary ?? ""}
                tailored={data.summary}
                accepted={accept.summary}
                onToggle={() => setAccept({ ...accept, summary: !accept.summary })}
              />
              {data.experience.length > 0 && (
                <section>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                    Experience ({data.experience.length})
                  </div>
                  <div className="space-y-3">
                    {data.experience.map((p, i) => (
                      <DiffBlock
                        key={`e${i}`}
                        label={`Experience #${i + 1}`}
                        original={p.original}
                        tailored={p.tailored}
                        accepted={accept.experience[i]}
                        onToggle={() => {
                          const arr = [...accept.experience];
                          arr[i] = !arr[i];
                          setAccept({ ...accept, experience: arr });
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}
              {data.projects.length > 0 && (
                <section>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                    Projects ({data.projects.length})
                  </div>
                  <div className="space-y-3">
                    {data.projects.map((p, i) => (
                      <DiffBlock
                        key={`p${i}`}
                        label={`Project #${i + 1}`}
                        original={p.original}
                        tailored={p.tailored}
                        accepted={accept.projects[i]}
                        onToggle={() => {
                          const arr = [...accept.projects];
                          arr[i] = !arr[i];
                          setAccept({ ...accept, projects: arr });
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <footer className="px-5 py-3 border-t flex items-center justify-end gap-2 bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg text-xs text-muted-foreground hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!data || pdfBusy || loading}
            onClick={handleDownload}
            className="h-9 px-4 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {pdfBusy ? "Building…" : "Accept + download PDF"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function DiffBlock({
  label,
  original,
  tailored,
  accepted,
  onToggle,
}: {
  label: string;
  original: string;
  tailored: string;
  accepted: boolean;
  onToggle: () => void;
}) {
  const unchanged = tailored.trim() === original.trim();
  return (
    <div className="rounded-lg border bg-card/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
          {unchanged && <span className="ml-2 normal-case text-foreground/50">· unchanged</span>}
        </div>
        {!unchanged && (
          <button
            type="button"
            onClick={onToggle}
            className={`inline-flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-medium ${
              accepted
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                : "bg-muted text-muted-foreground ring-1 ring-foreground/10"
            }`}
          >
            {accepted ? <Check className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
            {accepted ? "use tailored" : "keep original"}
          </button>
        )}
      </div>
      {unchanged ? (
        <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{original}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="text-xs leading-relaxed">
            <div className="text-[9px] font-mono uppercase text-muted-foreground mb-1">Original</div>
            <p className="whitespace-pre-wrap text-foreground/70">{original || "—"}</p>
          </div>
          <div className="text-xs leading-relaxed">
            <div className="text-[9px] font-mono uppercase text-primary mb-1">Tailored</div>
            <p className="whitespace-pre-wrap text-foreground">{tailored || "—"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
