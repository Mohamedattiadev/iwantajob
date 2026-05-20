"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

type Memo = { id: string; createdAt: number; durationMs: number; dataUrl: string };

function storeKey(skill: string) { return `jobscraper:voice:${skill}`; }

function load(skill: string): Memo[] {
  try { return JSON.parse(localStorage.getItem(storeKey(skill)) || "[]"); } catch { return []; }
}
function save(skill: string, memos: Memo[]) {
  try { localStorage.setItem(storeKey(skill), JSON.stringify(memos)); } catch { /* quota */ }
}

export function VoiceRecorder({ skill }: { skill: string }) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { setMemos(load(skill)); }, [skill]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const dataUrl = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onloadend = () => res(r.result as string);
          r.readAsDataURL(blob);
        });
        const memo: Memo = {
          id: Date.now().toString(36),
          createdAt: Date.now(),
          durationMs: Date.now() - startRef.current,
          dataUrl,
        };
        const next = [memo, ...memos];
        setMemos(next);
        save(skill, next);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      startRef.current = Date.now();
      setElapsed(0);
      tickRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 200);
      setRecording(true);
    } catch (e) {
      alert("Mic permission denied or unavailable: " + (e instanceof Error ? e.message : e));
    }
  }

  function stop() {
    recorderRef.current?.stop();
    if (tickRef.current) clearInterval(tickRef.current);
    setRecording(false);
  }

  function remove(id: string) {
    const next = memos.filter((m) => m.id !== id);
    setMemos(next);
    save(skill, next);
  }

  function toggle(m: Memo) {
    if (playing === m.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = m.dataUrl;
    audioRef.current.onended = () => setPlaying(null);
    audioRef.current.play().then(() => setPlaying(m.id)).catch(() => {});
  }

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-xl glass">
        {recording ? (
          <Button onClick={stop} className="bg-rose-500 hover:bg-rose-500/90 text-white">
            <Square className="h-4 w-4 mr-2 fill-current" /> Stop · {fmt(elapsed)}
          </Button>
        ) : (
          <Button onClick={start}>
            <Mic className="h-4 w-4 mr-2" /> Record voice memo
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          Saved locally per skill ({memos.length} memo{memos.length === 1 ? "" : "s"})
        </span>
      </div>

      {memos.length > 0 && (
        <ul className="space-y-2">
          {memos.map((m) => (
            <li key={m.id} className="glass rounded-lg p-3 flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => toggle(m)}>
                {playing === m.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="flex-1">
                <div className="text-sm tabular-nums">{fmt(m.durationMs)}</div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {new Date(m.createdAt).toLocaleString()}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(m.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
