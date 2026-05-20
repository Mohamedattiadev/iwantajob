"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type RecognitionResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface Props {
  onTranscript: (text: string) => void;
  className?: string;
  size?: "sm" | "lg";
  lang?: string;
}

export function VoiceInputButton({ onTranscript, className, size = "sm", lang = "en-US" }: Props) {
  const [supported, setSupported] = useState(() => typeof window === "undefined" ? true : getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);

  useEffect(() => () => { try { recognitionRef.current?.abort(); } catch { /* noop */ } }, []);

  function start() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { setSupported(false); return; }
    const r = new Ctor();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const first = e.results[0]?.[0]?.transcript;
      if (typeof first === "string" && first.trim()) onTranscript(first.trim());
    };
    r.onerror = () => { setListening(false); setTransitioning(false); };
    r.onend = () => { setListening(false); setTransitioning(false); };
    recognitionRef.current = r;
    setTransitioning(true);
    try { r.start(); setListening(true); } catch { setTransitioning(false); }
  }

  function stop() {
    setTransitioning(true);
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
  }

  const dim = size === "lg" ? "h-14 w-14" : "h-9 w-9";
  const iconDim = size === "lg" ? "h-6 w-6" : "h-4 w-4";

  if (!supported) {
    return (
      <button
        type="button" disabled
        title="Speech recognition not supported in this browser (use Chrome/Edge)"
        aria-label="Speech recognition unsupported"
        className={cn("inline-flex items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5 text-muted-foreground/50 cursor-not-allowed", dim, className)}
      >
        <MicOff className={iconDim} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      disabled={transitioning && !listening}
      aria-pressed={listening}
      title={listening ? "Stop recording" : "Start voice input"}
      className={cn(
        "relative inline-flex items-center justify-center rounded-lg transition-colors",
        listening
          ? "bg-rose-500 text-white hover:bg-rose-500/90"
          : "border border-foreground/10 bg-foreground/5 hover:bg-foreground/10",
        dim,
        className,
      )}
    >
      {transitioning && !listening ? (
        <Loader2 className={cn(iconDim, "animate-spin")} />
      ) : (
        <Mic className={cn(iconDim, listening && "animate-pulse")} />
      )}
      {listening && <span aria-hidden className="absolute inset-0 rounded-lg ring-2 ring-rose-500/40 animate-ping" />}
    </button>
  );
}
