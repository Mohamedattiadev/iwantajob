"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageCircle, Send, X, AlertTriangle, Maximize2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API, fetcher } from "@/lib/api";

type Msg = { role: "user" | "assistant"; content: string };
const STORE = "jobscraper:chat:v1";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const { data: status } = useSWR<{ available: boolean }>("/api/chat/status", fetcher);

  useEffect(() => {
    try { const raw = localStorage.getItem(STORE); if (raw) setMsgs(JSON.parse(raw)); } catch {}
    const onOpen = () => setOpen(true);
    window.addEventListener("open-chat", onOpen);
    return () => window.removeEventListener("open-chat", onOpen);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(msgs)); } catch {}
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setInput("");
    setSending(true);
    try {
      const r = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await r.json();
      if (data.error) {
        setMsgs([...next, { role: "assistant", content: `⚠ ${data.error}` }]);
      } else {
        setMsgs([...next, { role: "assistant", content: data.text || "(empty reply)" }]);
      }
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: `Network error: ${e instanceof Error ? e.message : e}` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full glass-strong grid place-items-center shadow-lg hover:scale-105 transition-transform"
        aria-label="Toggle chat"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[92vw] max-w-md h-[60vh] glass-strong rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <header className="px-4 py-3 border-b border-foreground/10 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Career coach</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {status?.available ? "online · grounded on your live data" : "offline — needs GEMINI_API_KEY"}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/assistant" onClick={() => setOpen(false)} title="Open full assistant"
                className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent">
                <Maximize2 className="h-3.5 w-3.5" />
              </Link>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
          </header>

          {!status?.available && (
            <div className="px-4 py-3 text-xs flex items-start gap-2 bg-amber-500/10 border-b border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                Set <code className="bg-muted px-1 rounded">GEMINI_API_KEY</code> in the backend env and restart{" "}
                <code className="bg-muted px-1 rounded">jobscraper serve</code>.
              </div>
            </div>
          )}

          <div ref={scroller} className="flex-1 overflow-auto px-4 py-3 space-y-3">
            {msgs.length === 0 && (
              <div className="text-xs text-muted-foreground space-y-2">
                <p>Try:</p>
                <ul className="space-y-1">
                  <li>• "What should I learn next given my current skills?"</li>
                  <li>• "Which 3 jobs should I apply to today?"</li>
                  <li>• "Rewrite the summary on my CV in 2 sentences."</li>
                </ul>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                  m.role === "user"
                    ? "bg-foreground text-background"
                    : "bg-muted text-foreground"
                }`}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-code:text-xs">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {sending && <div className="text-xs text-muted-foreground italic">thinking…</div>}
          </div>

          <div className="border-t border-foreground/10 p-3 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask anything about your data..."
              disabled={!status?.available}
            />
            <Button size="icon" onClick={send} disabled={!status?.available || sending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
