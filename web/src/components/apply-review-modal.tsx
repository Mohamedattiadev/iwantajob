"use client";

import { useEffect, useState } from "react";
import { Sparkles, Download, X, Check, RotateCcw, Send, ExternalLink, Copy, RefreshCw } from "lucide-react";
import { useAction, useMutation } from "convex/react";
import { api as convexApi } from "../../convex/_generated/api";
import { renderHtml } from "@/lib/cv-render";
import type { Profile, JobItem } from "@/lib/api";
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
  job: JobItem;
  profile: Profile;
  tgAvailable: boolean;
  isTgSending: boolean;
  onTelegramApply: (jobId: string) => void;
  onApply: (job: JobItem) => Promise<boolean>;
  onClose: () => void;
};

// The single "prep-to-apply" review screen: fit score, tailored CV diff,
// AI-drafted cover note, and one confirm action. Confirm only records the
// tracker row + opens the real posting for the human to submit by hand —
// this app never automates submission on third-party sites/ATSs.
export function ApplyReviewModal({ job, profile, tgAvailable, isTgSending, onTelegramApply, onApply, onClose }: Props) {
  const jobId = job.id as Id<"jobs_pool">;
  const tailor = useAction(convexApi.cv.tailor);
  const coverNoteAction = useAction(convexApi.cv.coverNote);
  const saveDraft = useMutation(convexApi.cv_drafts.save);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Tailored | null>(null);
  const [accept, setAccept] = useState<{ summary: boolean; experience: boolean[]; projects: boolean[] } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [coverNote, setCoverNote] = useState("");
  const [coverNoteLoading, setCoverNoteLoading] = useState(true);
  const [coverNoteError, setCoverNoteError] = useState<string | null>(null);

  // No synchronous setState here — loading/error already start correct on
  // mount (loading=true, error=null), so the effect below can call these
  // directly without tripping react-hooks/set-state-in-effect.
  const fetchTailor = () => {
    tailor({ jobId })
      .then((res) => {
        const r = res as Tailored;
        setData(r);
        setAccept({
          summary: !!r.summary,
          experience: r.experience.map((p) => p.tailored !== p.original),
          projects: r.projects.map((p) => p.tailored !== p.original),
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  const fetchCoverNote = () => {
    coverNoteAction({ jobId })
      .then((res) => {
        if (res.text) setCoverNote(res.text);
        else setCoverNoteError(res.error || "Cover note generation failed");
      })
      .catch((e) => setCoverNoteError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCoverNoteLoading(false));
  };

  const handleRegenerateCoverNote = () => {
    setCoverNoteLoading(true);
    setCoverNoteError(null);
    fetchCoverNote();
  };

  useEffect(() => {
    fetchTailor();
    fetchCoverNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

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

  const persistDraft = async () => {
    try {
      await saveDraft({
        jobId: job.id,
        payload_json: JSON.stringify({ tailored: data, accept, coverNote, savedAt: Date.now() }),
      });
    } catch { /* best-effort */ }
  };

  const handleDownload = async () => {
    if (!data) return;
    setPdfBusy(true);
    const tailoredProfile = buildTailoredProfile();
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
      const html = renderHtml(tailoredProfile as never, 3, template, false);
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
      const safe = (job.company || job.title).replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
      pdf.save(`cv-${safe}.pdf`);
      await persistDraft();
      toast.success("Tailored CV downloaded");
    } catch (e) {
      toast.error(`PDF failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      document.body.removeChild(iframe);
      setPdfBusy(false);
    }
  };

  const handleCopyCoverNote = async () => {
    try {
      await navigator.clipboard.writeText(coverNote);
      toast.success("Cover note copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleConfirm = async () => {
    setConfirmBusy(true);
    try {
      const ok = await onApply(job);
      if (!ok) {
        toast.error("Could not record application");
        return;
      }
      await persistDraft();
      if (job.source_url) window.open(job.source_url, "_blank", "noopener,noreferrer");
      toast.success("Marked applied — finish submitting on the posting.");
      onClose();
    } finally {
      setConfirmBusy(false);
    }
  };

  const fitScore = job.score;
  const fitReasons = job.fit_reasons ?? [];
  const fitOk = job.fit_ok !== false;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Review application"
        className="bg-popover/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold">Review &amp; apply</div>
              <div className="text-[11px] text-muted-foreground line-clamp-1">
                {job.title}{job.company ? ` · ${job.company}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center h-6 px-2 rounded-full text-[10px] font-mono font-semibold tabular-nums ${
                fitScore >= 70
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : fitScore >= 50
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-muted text-muted-foreground"
              }`}
              title="Skill-match score"
            >
              {fitScore}% fit
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm">
          {!fitOk && fitReasons.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <div className="font-mono uppercase tracking-wider text-[10px] mb-1">Fit gaps</div>
              <ul className="list-disc list-inside space-y-0.5">
                {fitReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Cover note
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleRegenerateCoverNote}
                  disabled={coverNoteLoading}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
                  title="Regenerate"
                >
                  <RefreshCw className={`h-3 w-3 ${coverNoteLoading ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={handleCopyCoverNote}
                  disabled={!coverNote}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
                  title="Copy"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
            {coverNoteLoading ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                <Sparkles className="h-4 w-4 mx-auto mb-1 animate-pulse text-primary" />
                Drafting…
              </div>
            ) : coverNoteError ? (
              <div className="text-xs text-rose-600 dark:text-rose-400">{coverNoteError}</div>
            ) : (
              <textarea
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                rows={6}
                className="w-full rounded-lg border bg-card/40 p-3 text-xs leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-primary/40"
                placeholder="Cover note draft…"
              />
            )}
          </section>

          <section>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
              Tailored CV
            </div>
            {loading && (
              <div className="py-8 text-center text-muted-foreground">
                <Sparkles className="h-5 w-5 mx-auto mb-2 animate-pulse text-primary" />
                Tailoring with Gemini…
              </div>
            )}
            {error && (
              <div className="py-4 text-center text-rose-600 dark:text-rose-400 text-xs">
                {error}
              </div>
            )}
            {data && accept && (
              <div className="space-y-3">
                <DiffBlock
                  label="Summary"
                  original={profile.personal?.summary ?? ""}
                  tailored={data.summary}
                  accepted={accept.summary}
                  onToggle={() => setAccept({ ...accept, summary: !accept.summary })}
                />
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
            )}
          </section>
        </div>

        <footer className="px-5 py-3 border-t flex items-center justify-end gap-2 flex-wrap bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3 rounded-lg text-xs text-muted-foreground hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!data || pdfBusy || loading}
            onClick={handleDownload}
            className="h-9 px-3 rounded-lg border text-xs font-medium hover:bg-background disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {pdfBusy ? "Building…" : "Download CV PDF"}
          </button>
          {tgAvailable && (
            <button
              type="button"
              disabled={isTgSending}
              onClick={() => onTelegramApply(job.id)}
              className="h-9 px-3 rounded-lg border text-xs font-medium hover:bg-background disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {isTgSending ? "Sending…" : "Send TG brief"}
            </button>
          )}
          <button
            type="button"
            disabled={confirmBusy}
            onClick={handleConfirm}
            className="h-9 px-4 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {confirmBusy ? "Recording…" : "Confirm — mark applied & open posting"}
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
