"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Power, RotateCcw, Send, Volume2, VolumeX, MessageSquare, GraduationCap, AlertTriangle, MessageSquarePlus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API } from "@/lib/api";
import { useMutation, useQuery } from "convex/react";
import { api as convexApi } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
type ConvId = Id<"conversations">;
import { PageTabs, ASSISTANT_TABS } from "@/components/page-tabs";

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "interview" | "teach";
type Lang = "en" | "tr" | "ar";
type SessionState = "idle" | "listening" | "recording" | "transcribing" | "thinking" | "speaking";

const LANG_LABEL: Record<Lang, string> = { en: "English", tr: "Türkçe", ar: "العربية" };

// VAD tuning (interview mode = thinking pauses allowed, so generous silence)
const SILENCE_MS = 1800;          // stop recording after this much silence (allows thinking pauses)
const MIN_SPEECH_MS = 250;        // ignore mic blips shorter than this
const ENERGY_THRESHOLD = 0.008;   // 0-1, RMS — lower = more sensitive (whisper-friendly)
const INTERRUPT_MS = 400;         // user must speak this long during AI to interrupt
const POLL_MS = 50;
const MAX_TURN_MS = 45000;        // hard cap: auto-send after this much continuous recording
const MIN_WORDS_TO_SEND = 3;      // shorter transcripts buffer to next turn

export default function InterviewPage() {
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<Mode>("interview");
  const [lang, setLang] = useState<Lang>("en");
  const [pushToTalk, setPushToTalk] = useState(false);
  const transcriptBuffer = useRef("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [state, setState] = useState<SessionState>("idle");
  const [speakOut, setSpeakOut] = useState(true);
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [energy, setEnergy] = useState(0);
  const [convId, setConvId] = useState<ConvId | null>(null);
  const sessionsRaw = useQuery(convexApi.conversations.list, { type: "interview" });
  const sessions = sessionsRaw as { id: ConvId; title: string; updated_at: string; message_count: number }[] | undefined;
  const activeSession = useQuery(
    convexApi.conversations.get,
    convId ? { id: convId } : "skip",
  );
  const createConv = useMutation(convexApi.conversations.create);
  const addMessage = useMutation(convexApi.conversations.addMessage);
  const renameConvMut = useMutation(convexApi.conversations.rename);
  const removeConvMut = useMutation(convexApi.conversations.remove);
  const mutateSessions = () => {/* convex auto-refetches */};

  // Refs (mutable, no re-render)
  const sessionAlive = useRef(false);
  const stateRef = useRef<SessionState>("idle");
  const msgsRef = useRef<Msg[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<BlobPart[]>([]);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsPlayingRef = useRef(false);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechSinceMs = useRef(0);
  const silenceSinceMs = useRef(0);
  const interruptSinceMs = useRef(0);
  const recordingDurMs = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { msgsRef.current = msgs; }, [msgs]);
  useEffect(() => { stateRef.current = state; }, [state]);
  const pushToTalkRef = useRef(pushToTalk);
  useEffect(() => { pushToTalkRef.current = pushToTalk; }, [pushToTalk]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);
  useEffect(() => {
    fetch(`${API}/api/health`).catch((e) => setError(`Backend unreachable: ${e}`));
    return () => { teardown(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lifecycle ────────────────────────────────────────────────────────────
  const teardown = () => {
    sessionAlive.current = false;
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
    try { mediaRecRef.current?.stop(); } catch {}
    mediaRecRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    stopTTS();
  };

  const stopTTS = () => {
    ttsPlayingRef.current = false;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    const a = ttsAudioRef.current;
    if (a) {
      try {
        a.onended = null;
        a.onerror = null;
        a.pause();
        a.removeAttribute("src");
        a.load();
      } catch { /* ignore — play() race */ }
    }
    ttsAudioRef.current = null;
  };

  // ── Mic + VAD ────────────────────────────────────────────────────────────
  const openMic = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) return true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone API not available."); return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // autoGainControl disabled — was suppressing mic after loud AI playback.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      analyserRef.current = analyser;
      return true;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m.toLowerCase().includes("permission") || m.toLowerCase().includes("denied")
        ? "Microphone permission denied. Click address-bar mic icon to allow."
        : `Mic init failed: ${m}`);
      return false;
    }
  }, []);

  const rmsEnergy = (): number => {
    const a = analyserRef.current; if (!a) return 0;
    const buf = new Uint8Array(a.fftSize);
    a.getByteTimeDomainData(buf);
    let sumsq = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sumsq += v * v;
    }
    return Math.sqrt(sumsq / buf.length);
  };

  // Start a recording chunk
  const startChunk = () => {
    if (!streamRef.current) return;
    if (mediaRecRef.current && mediaRecRef.current.state === "recording") return;
    const opts = _pickMime();
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(streamRef.current, opts); }
    catch { rec = new MediaRecorder(streamRef.current); }
    recChunks.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunks.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(recChunks.current, { type: rec.mimeType || "audio/webm" });
      recChunks.current = [];
      if (blob.size < 1000) {
        if (sessionAlive.current) setState("listening");
        return;
      }
      void uploadAndProcess(blob);
    };
    rec.onerror = (e) => setError(`Recorder: ${(e as Event & { error?: Error }).error?.message ?? "error"}`);
    mediaRecRef.current = rec;
    rec.start(150);
    setState("recording");
  };

  const stopChunk = () => {
    const rec = mediaRecRef.current;
    if (rec && rec.state === "recording") {
      try { rec.stop(); } catch {}
    }
  };

  // VAD loop: runs every POLL_MS, drives the state machine.
  const startVAD = () => {
    if (vadIntervalRef.current) return;
    let lastTs = performance.now();
    vadIntervalRef.current = setInterval(() => {
      if (!sessionAlive.current) return;
      // Resume AudioContext if browser suspended it (happens after tab focus changes).
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === "suspended") { ctx.resume().catch(() => {}); }
      const now = performance.now();
      const dt = now - lastTs; lastTs = now;
      const e = rmsEnergy();
      setEnergy(e);
      const speaking = e > ENERGY_THRESHOLD;
      const s = stateRef.current;

      // Push-to-talk mode: skip auto-VAD start/stop. User uses big mic button instead.
      if (pushToTalkRef.current) return;

      if (s === "listening") {
        if (speaking) {
          speechSinceMs.current += dt;
          if (speechSinceMs.current >= MIN_SPEECH_MS) {
            silenceSinceMs.current = 0;
            recordingDurMs.current = 0;
            startChunk(); // → state "recording"
          }
        } else {
          speechSinceMs.current = 0;
        }
      } else if (s === "recording") {
        recordingDurMs.current += dt;
        if (speaking) {
          silenceSinceMs.current = 0;
        } else {
          silenceSinceMs.current += dt;
        }
        // Stop on silence OR hard turn cap (prevents runaway recording).
        if (silenceSinceMs.current >= SILENCE_MS || recordingDurMs.current >= MAX_TURN_MS) {
          silenceSinceMs.current = 0;
          speechSinceMs.current = 0;
          recordingDurMs.current = 0;
          stopChunk(); // → transcribing via onstop
          setState("transcribing");
        }
      } else if (s === "speaking") {
        // Interrupt detection while AI is speaking.
        if (speaking) {
          interruptSinceMs.current += dt;
          if (interruptSinceMs.current >= INTERRUPT_MS) {
            interruptSinceMs.current = 0;
            stopTTS();
            speechSinceMs.current = MIN_SPEECH_MS;  // already speaking
            setState("listening");
            startChunk();
          }
        } else {
          interruptSinceMs.current = 0;
        }
      }
    }, POLL_MS);
  };

  // ── Pipeline: audio → STT → AI → TTS ────────────────────────────────────
  const uploadAndProcess = useCallback(async (blob: Blob) => {
    setError(null);
    setState("transcribing");
    let userText = "";
    try {
      const ext = (blob.type.split("/")[1] || "webm").split(";")[0];
      const form = new FormData();
      form.append("file", blob, `audio.${ext}`);
      const r = await fetch(`${API}/api/stt?lang=${lang}`, { method: "POST", body: form });
      if (!r.ok) {
        const txt = await r.text();
        if (r.status === 404) setError("Backend missing /api/stt — ./run restart");
        else setError(`STT ${r.status}: ${txt.slice(0, 200)}`);
        setState("listening"); return;
      }
      const d = await r.json();
      userText = (d.text || "").trim();
    } catch (e) {
      setError(`STT net: ${e instanceof Error ? e.message : e}`);
      setState("listening"); return;
    }
    if (!userText) { setState("listening"); return; }
    // Buffer fragments: if too short AND we're not in push-to-talk, hold for next turn.
    const wc = userText.split(/\s+/).length;
    if (!pushToTalkRef.current && wc < MIN_WORDS_TO_SEND) {
      transcriptBuffer.current = (transcriptBuffer.current + " " + userText).trim();
      setState("listening");
      return;
    }
    if (transcriptBuffer.current) {
      userText = (transcriptBuffer.current + " " + userText).trim();
      transcriptBuffer.current = "";
    }
    await sendToAI(userText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const sendToAI = useCallback(async (userText: string) => {
    const next: Msg[] = [...msgsRef.current, { role: "user", content: userText }];
    setMsgs(next);
    setState("thinking");
    try {
      const r = await fetch(`${API}/api/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, mode, lang, messages: next }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 404) {
        setError("Backend missing /api/interview — ./run restart");
        setState(sessionAlive.current ? "listening" : "idle"); return;
      }
      if (!r.ok || d.error) {
        const err = d.error || d.detail || `HTTP ${r.status}`;
        setError(typeof err === "string" ? err : JSON.stringify(err));
        setState(sessionAlive.current ? "listening" : "idle"); return;
      }
      const text: string = d.text || "(silence)";
      setMsgs([...next, { role: "assistant", content: text }]);
      await speakAI(text);
    } catch (e) {
      setError(`AI net: ${e instanceof Error ? e.message : e}`);
      setState(sessionAlive.current ? "listening" : "idle");
    }
  }, [topic, mode, lang]);

  // Split AI text into speakable chunks (sentences). Short chunks = first
  // audible byte arrives faster. Edge TTS prosody stays natural per sentence.
  const splitSentences = (text: string): string[] => {
    const out: string[] = [];
    const re = /[^.!?؟]+[.!?؟]+\s*|[^.!?؟]+$/gu;
    let m;
    while ((m = re.exec(text)) !== null) {
      const s = m[0].trim();
      if (s) out.push(s);
    }
    // Merge tiny chunks (<3 words) into the next one so prosody stays natural.
    const merged: string[] = [];
    for (const s of out) {
      if (merged.length && merged[merged.length - 1].split(/\s+/).length < 3) {
        merged[merged.length - 1] += " " + s;
      } else {
        merged.push(s);
      }
    }
    return merged.length ? merged : [text];
  };

  const speakAI = useCallback(async (text: string) => {
    if (!speakOut) {
      setState(sessionAlive.current ? "listening" : "idle");
      return;
    }
    stopTTS();
    setState("speaking");
    ttsPlayingRef.current = true;
    const ctl = new AbortController();
    ttsAbortRef.current = ctl;

    const sentences = splitSentences(text);
    // Prefetch each sentence's mp3 in parallel; play in order.
    const fetches: Promise<Blob | null>[] = sentences.map((s) =>
      fetch(`${API}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: s, lang }),
        signal: ctl.signal,
      })
        .then((r) => {
          if (!r.ok) {
            if (r.status === 404) setError("Backend missing /api/tts — ./run restart");
            else setError(`TTS ${r.status}`);
            return null;
          }
          return r.blob();
        })
        .catch((e) => {
          if ((e as Error).name === "AbortError") return null;
          setError(`TTS net: ${e instanceof Error ? e.message : e}`);
          return null;
        }),
    );

    try {
      for (let i = 0; i < fetches.length; i++) {
        if (!ttsPlayingRef.current) break;
        const blob = await fetches[i];
        if (!blob || !ttsPlayingRef.current) continue;
        await playBlob(blob);
      }
    } finally {
      ttsPlayingRef.current = false;
      ttsAbortRef.current = null;
      if (sessionAlive.current) setState("listening");
      else setState("idle");
    }
  }, [speakOut, lang]);

  const playBlob = (blob: Blob): Promise<void> => new Promise<void>((resolve) => {
    if (!ttsPlayingRef.current) { resolve(); return; }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    ttsAudioRef.current = audio;
    let settled = false;
    const cleanup = () => { if (settled) return; settled = true; URL.revokeObjectURL(url); resolve(); };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    // play() returns a promise — if aborted between start and play, swallow the error
    audio.play().catch(() => { cleanup(); });
    // Safety: if stopTTS clears ttsAudioRef before onended, resolve next tick.
    const watchdog = setInterval(() => {
      if (!ttsPlayingRef.current || ttsAudioRef.current !== audio) {
        clearInterval(watchdog); cleanup();
      }
    }, 100);
    audio.onended = () => { clearInterval(watchdog); cleanup(); };
  });

  // ── Persistence (conversations API) ──────────────────────────────────────
  const persistMsg = async (cid: ConvId, role: string, content: string) => {
    if (!cid) return;
    try {
      await addMessage({ conversationId: cid, role, content });
    } catch {}
  };
  // Persist every new message as it arrives.
  const lastPersistedLen = useRef(0);
  useEffect(() => {
    if (!convId || msgs.length <= lastPersistedLen.current) return;
    for (let i = lastPersistedLen.current; i < msgs.length; i++) {
      const m = msgs[i];
      void persistMsg(convId, m.role, m.content);
    }
    lastPersistedLen.current = msgs.length;
    mutateSessions();
  }, [msgs, convId, mutateSessions]);

  const loadSession = async (id: ConvId) => {
    endSession();
    setConvId(id);
    // activeSession query will fetch + the hydration effect below applies it.
  };

  // Hydrate when activeSession resolves.
  useEffect(() => {
    if (!activeSession) return;
    const loaded: Msg[] = (activeSession.messages || []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    setMsgs(loaded);
    lastPersistedLen.current = loaded.length;
    const meta = activeSession.meta as { topic?: string; mode?: Mode; lang?: Lang };
    if (meta?.topic) setTopic(meta.topic);
    if (meta?.mode) setMode(meta.mode);
    if (meta?.lang) setLang(meta.lang);
  }, [activeSession]);

  const deleteSession = async (id: ConvId) => {
    if (!confirm("Delete this session?")) return;
    await removeConvMut({ id });
    if (convId === id) { setConvId(null); setMsgs([]); }
  };

  const renameSession = async (id: ConvId, title: string) => {
    await renameConvMut({ id, title });
  };

  // ── Session controls ────────────────────────────────────────────────────
  const startSession = async () => {
    setError(null);
    const ok = await openMic();
    if (!ok) return;
    // Create a backed conversation so messages persist.
    if (convId == null) {
      try {
        const d = await createConv({
          type: "interview",
          title: `${mode === "interview" ? "Interview" : "Teach"} — ${topic || "general"} (${lang})`,
          meta: JSON.stringify({ topic, mode, lang }),
        });
        setConvId(d.id as ConvId); lastPersistedLen.current = 0;
      } catch {}
    }
    sessionAlive.current = true;
    startVAD();
    setState("thinking");
    // Greet: send empty user → backend gives first line.
    try {
      const r = await fetch(`${API}/api/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, mode, lang, messages: [] }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 404) { setError("Backend missing /api/interview — ./run restart"); endSession(); return; }
      if (!r.ok || d.error) { setError(d.error || d.detail || `HTTP ${r.status}`); endSession(); return; }
      const text: string = d.text || "Hello.";
      setMsgs([{ role: "assistant", content: text }]);
      await speakAI(text);
    } catch (e) {
      setError(`Start failed: ${e instanceof Error ? e.message : e}`);
      endSession();
    }
  };

  const endSession = () => {
    teardown();
    setState("idle");
  };

  const clear = () => {
    if (msgs.length && !confirm("Reset conversation? (Saved to history)")) return;
    endSession();
    setMsgs([]);
    setConvId(null);
    lastPersistedLen.current = 0;
    setError(null);
  };

  const sendTyped = async () => {
    const t = textInput.trim();
    if (!t) return;
    setTextInput("");
    if (!sessionAlive.current) {
      // Allow typed-only mode (no mic).
      setMsgs((m) => m.length === 0 ? [{ role: "user", content: t }] : m);
      sessionAlive.current = true;
      startVAD();  // no-op without mic
    }
    await sendToAI(t);
  };

  const stateLabel: Record<SessionState, string> = {
    idle: "idle",
    listening: "listening… (speak)",
    recording: "recording your voice",
    transcribing: "transcribing",
    thinking: "AI thinking",
    speaking: "AI speaking (talk to interrupt)",
  };
  const stateDot: Record<SessionState, string> = {
    idle: "bg-muted",
    listening: "bg-emerald-500",
    recording: "bg-rose-500",
    transcribing: "bg-amber-500",
    thinking: "bg-primary",
    speaking: "bg-sky-500",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 flex-1 min-h-0 w-full">
      {/* Sessions sidebar */}
      <aside className="border-r border-border/60 pr-4 flex flex-col overflow-hidden">
        <Button onClick={() => { clear(); }} className="w-full mb-3 justify-start gap-2" disabled={state !== "idle"}>
          <MessageSquarePlus className="h-4 w-4" /> New session
        </Button>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 px-1">
          History ({sessions?.length ?? 0})
        </div>
        <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-0.5">
          {(sessions ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground italic px-2 py-3">No past sessions.</p>
          )}
          {(sessions ?? []).map((s) => (
            <SessionRow
              key={s.id}
              s={s}
              active={s.id === convId}
              onPick={() => loadSession(s.id)}
              onRename={(t) => renameSession(s.id, t)}
              onDelete={() => deleteSession(s.id)}
            />
          ))}
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col min-h-0">
      <header className="pb-3 border-b border-border/60 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Interviewer</h1>
          <p className="text-xs text-muted-foreground">
            Real-time voice. VAD-driven turn-taking. Talk over AI to interrupt. EN / TR / AR. Auto-saved to history.
          </p>
        </div>
        <PageTabs tabs={ASSISTANT_TABS} />
      </header>

      <div className="py-3 flex flex-wrap items-center gap-2 border-b">
        <Input
          placeholder="Topic (optional)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="flex-1 min-w-[200px]"
          disabled={state !== "idle"}
        />
        <div className="inline-flex rounded-md border p-0.5 bg-muted/30">
          {(["interview", "teach"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={state !== "idle"}
              className={`h-8 px-3 rounded-sm text-xs inline-flex items-center gap-1.5 ${
                mode === m ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
              }`}
            >
              {m === "interview" ? <MessageSquare className="h-3.5 w-3.5" /> : <GraduationCap className="h-3.5 w-3.5" />}
              {m === "interview" ? "AI interviews me" : "I teach AI"}
            </button>
          ))}
        </div>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="h-8 px-2 rounded-md border bg-background text-xs"
          disabled={state !== "idle"}
        >
          {(["en", "tr", "ar"] as Lang[]).map((l) => (
            <option key={l} value={l}>{LANG_LABEL[l]}</option>
          ))}
        </select>
        <button
          onClick={() => setSpeakOut((v) => !v)}
          className="h-8 px-2 rounded-md border text-xs inline-flex items-center gap-1 hover:bg-accent"
          title={speakOut ? "AI voice ON" : "AI voice OFF"}
        >
          {speakOut ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => setPushToTalk((v) => !v)}
          className={`h-8 px-2 rounded-md border text-xs inline-flex items-center gap-1 hover:bg-accent ${pushToTalk ? "bg-primary/15 text-primary border-primary/30" : ""}`}
          title={pushToTalk ? "Push-to-talk ON (click mic to record)" : "Auto VAD (talk freely)"}
        >
          PTT
        </button>
      </div>

      {/* State indicator */}
      <div className="py-2 text-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${stateDot[state]} ${state === "listening" || state === "recording" ? "animate-pulse" : ""}`} />
          <span className="text-muted-foreground">{stateLabel[state]}</span>
        </div>
        {state !== "idle" && (
          <div className="flex items-center gap-2 w-64">
            <span className="text-[10px] text-muted-foreground font-mono">mic</span>
            <div className="flex-1 h-2 bg-muted rounded relative overflow-hidden">
              <div
                className={`h-full transition-[width] duration-75 ${energy > ENERGY_THRESHOLD ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                style={{ width: `${Math.min(100, Math.round(energy * 1500))}%` }}
              />
              {/* Threshold marker */}
              <div className="absolute top-0 bottom-0 w-px bg-rose-500/70"
                   style={{ left: `${Math.min(100, ENERGY_THRESHOLD * 1500)}%` }} />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground w-10 text-right">
              {energy.toFixed(3)}
            </span>
            {transcriptBuffer.current && (
              <span className="text-[10px] text-amber-500" title="Buffered short fragment, waiting for more">buf</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="my-2 px-3 py-2 rounded-md text-xs flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div ref={scroller} className="flex-1 overflow-auto py-4 space-y-3">
        {msgs.length === 0 && state === "idle" && (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>Press <b>Start</b>. AI greets you, then mic is always live.</p>
            <p>Talk naturally → 1.2s silence sends your turn. Talk over the AI to interrupt.</p>
            <p>Transcript via Groq Whisper. Voice via Edge TTS. Both free, no Google needed.</p>
            <div className="pt-2">
              <Button onClick={startSession} className="h-11 px-6 text-base">
                <Mic className="h-4 w-4 mr-2" /> Start session
              </Button>
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
              m.role === "user" ? "bg-foreground text-background" : "bg-muted/60 border"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t flex items-center gap-2">
        {state !== "idle" ? (
          <Button variant="destructive" size="icon" onClick={endSession} title="End session">
            <Power className="h-4 w-4" />
          </Button>
        ) : msgs.length > 0 ? (
          <Button variant="outline" size="icon" onClick={clear} title="Reset">
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : null}
        <Input
          placeholder={state === "idle" ? "Or type and press Enter…" : "Type to override mic…"}
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendTyped(); }}
        />
        <Button variant="outline" onClick={sendTyped} disabled={!textInput.trim()}>
          <Send className="h-4 w-4" />
        </Button>
        {state === "idle" && msgs.length === 0 && (
          <Button onClick={startSession}>
            <Mic className="h-4 w-4 mr-1.5" /> Start
          </Button>
        )}
        {state === "listening" && (
          <Button onClick={() => { recordingDurMs.current = 0; startChunk(); }}
                  title="Force start recording (if VAD missed you)" variant="outline" size="icon">
            <Mic className="h-4 w-4" />
          </Button>
        )}
        {state === "recording" && (
          <Button onClick={() => { stopChunk(); setState("transcribing"); }}
                  title="Force send now" variant="default" className="animate-pulse">
            <Send className="h-4 w-4 mr-1" /> Send
          </Button>
        )}
      </div>
      </div>
    </div>
  );
}

function SessionRow({ s, active, onPick, onRename, onDelete }: {
  s: { id: ConvId; title: string; updated_at: string; message_count: number };
  active: boolean; onPick: () => void;
  onRename: (t: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(s.title);
  return (
    <div className={`group flex items-center gap-1 rounded-md ${active ? "bg-primary/15 ring-1 ring-primary/20" : "hover:bg-accent/40"}`}>
      {editing ? (
        <input
          autoFocus value={val} onChange={(e) => setVal(e.target.value)}
          onBlur={() => { onRename(val); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") { onRename(val); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
          className="flex-1 h-7 px-2 text-xs bg-transparent border-b border-primary focus:outline-none"
        />
      ) : (
        <button onClick={onPick} className="flex-1 text-left px-2 py-1.5 text-xs truncate">
          <div className="truncate">{s.title}</div>
          <div className="text-[10px] text-muted-foreground">{s.message_count} msgs</div>
        </button>
      )}
      <button onClick={() => { setEditing(true); setVal(s.title); }} title="Rename"
              className="opacity-0 group-hover:opacity-100 hover:text-primary p-1">
        <Pencil className="h-3 w-3" />
      </button>
      <button onClick={onDelete} title="Delete"
              className="opacity-0 group-hover:opacity-100 hover:text-rose-500 p-1">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function _pickMime(): MediaRecorderOptions {
  if (typeof MediaRecorder === "undefined") return {};
  const tries = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of tries) {
    if (MediaRecorder.isTypeSupported(t)) return { mimeType: t };
  }
  return {};
}
