"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send, Sparkles, Wrench, Trash2, AlertTriangle, MessageSquarePlus,
  Copy, Check, Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { API, fetcher } from "@/lib/api";
import { PageTabs, ASSISTANT_TABS } from "@/components/page-tabs";

type ToolCall = { name: string; args: Record<string, unknown>; result_preview: unknown };
type Msg = { id?: number; role: "user" | "assistant"; content: string; tool_calls?: ToolCall[] };
type ConvSummary = { id: number; title: string; type: string; updated_at: string; message_count: number };

const SUGGESTIONS = [
  "What 3 skills should I prioritize given my current notes and the job market?",
  "Add a note to my javascript skill: 'today I learned closures + the event loop'.",
  "Find the top 5 React internships and summarize the common skills they ask for.",
  "Read my profile and suggest a sharper 1-sentence summary, then update it.",
  "List my applications and which ones are still 'applied' (need follow-up).",
];

export default function AssistantPage() {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const { data: status } = useSWR<{ available: boolean }>("/api/chat/status", fetcher);
  const { data: convs, mutate: mutateConvs } = useSWR<ConvSummary[]>("/api/conversations?type=assistant", fetcher);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  // Load conversation when activeId changes.
  useEffect(() => {
    if (activeId == null) { setMsgs([]); return; }
    fetch(`${API}/api/conversations/${activeId}`)
      .then((r) => r.json())
      .then((d) => {
        const loaded: Msg[] = (d.messages || []).map((m: { id: number; role: string; content: string; meta?: { tool_calls?: ToolCall[] } }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          tool_calls: m.meta?.tool_calls,
        }));
        setMsgs(loaded);
      });
  }, [activeId]);

  const newConversation = async (title = "New chat") => {
    const r = await fetch(`${API}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "assistant", title }),
    });
    const d = await r.json();
    await mutateConvs();
    setActiveId(d.id);
    setMsgs([]);
    return d.id as number;
  };

  const persistMsg = async (convId: number, role: string, content: string, meta: object = {}) => {
    await fetch(`${API}/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content, meta }),
    });
  };

  const renameConv = async (id: number, title: string) => {
    await fetch(`${API}/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    mutateConvs();
  };

  const deleteConv = async (id: number) => {
    if (!confirm("Delete this conversation?")) return;
    await fetch(`${API}/api/conversations/${id}`, { method: "DELETE" });
    mutateConvs();
    if (activeId === id) { setActiveId(null); setMsgs([]); }
  };

  const sendText = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;
    let convId = activeId;
    if (convId == null) {
      // Auto-title first message
      const t = text.trim().slice(0, 60) + (text.length > 60 ? "…" : "");
      convId = await newConversation(t);
    }
    const next: Msg[] = [...msgs, { role: "user", content: text.trim() }];
    setMsgs(next);
    setInput("");
    setSending(true);
    void persistMsg(convId, "user", text.trim());
    try {
      const r = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await r.json();
      if (data.error) {
        const m: Msg = { role: "assistant", content: `⚠ ${data.error}` };
        setMsgs([...next, m]);
        void persistMsg(convId, "assistant", m.content);
      } else {
        const m: Msg = { role: "assistant", content: data.text || "(empty reply)", tool_calls: data.tool_calls };
        setMsgs([...next, m]);
        void persistMsg(convId, "assistant", m.content, { tool_calls: data.tool_calls });
      }
      mutateConvs();
    } catch (e) {
      const m: Msg = { role: "assistant", content: `Network error: ${e instanceof Error ? e.message : e}` };
      setMsgs([...next, m]);
    } finally {
      setSending(false);
    }
  }, [activeId, msgs, sending, mutateConvs]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 flex-1 min-h-0 w-full">
      {/* Sidebar */}
      <aside className="border-r border-border/60 pr-4 flex flex-col overflow-hidden">
        <Button onClick={() => newConversation()} className="w-full mb-3 justify-start gap-2">
          <MessageSquarePlus className="h-4 w-4" /> New chat
        </Button>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 px-1">
          History ({convs?.length ?? 0})
        </div>
        <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-0.5">
          {(convs ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground italic px-2 py-3">No saved chats yet.</p>
          )}
          {(convs ?? []).map((c) => (
            <ConvRow
              key={c.id}
              c={c}
              active={c.id === activeId}
              onPick={() => setActiveId(c.id)}
              onRename={(t) => renameConv(c.id, t)}
              onDelete={() => deleteConv(c.id)}
            />
          ))}
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col min-h-0">
        <header className="pb-3 border-b border-border/60 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Assistant
            </h1>
            <p className="text-xs text-muted-foreground">
              Grounded on your CV + notes + jobs. Tools: read/write notes, search jobs, update profile, manage applications.
            </p>
          </div>
          <PageTabs tabs={ASSISTANT_TABS} />
        </header>

        {!status?.available && (
          <div className="mt-3 px-3 py-2 rounded-lg text-xs flex items-start gap-2 bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div><code className="bg-muted px-1 rounded">GEMINI_API_KEY</code> not set. Restart backend after setting it.</div>
          </div>
        )}

        <div ref={scroller} className="flex-1 overflow-y-auto py-4 space-y-4">
          {msgs.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Try asking:</p>
              <div className="grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendText(s)}
                    disabled={!status?.available || sending}
                    className="text-left px-4 py-3 rounded-xl border bg-card hover:bg-accent/40 hover:border-primary/30 transition-colors text-sm disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, i) => <MessageRow key={m.id ?? i} m={m} />)}

          {sending && (
            <div className="flex justify-start">
              <div className="px-4 py-2.5 rounded-2xl bg-muted/50 border text-sm text-muted-foreground italic inline-flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Thinking…
              </div>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-border/60 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(input); } }}
            placeholder={status?.available ? "Ask anything…" : "Backend offline"}
            disabled={!status?.available || sending}
            className="h-11"
          />
          <Button onClick={() => sendText(input)} disabled={!status?.available || sending || !input.trim()} className="h-11 px-5">
            <Send className="h-4 w-4 mr-1.5" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConvRow({ c, active, onPick, onRename, onDelete }: {
  c: ConvSummary; active: boolean; onPick: () => void;
  onRename: (t: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(c.title);
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
          {c.title}
        </button>
      )}
      <button onClick={() => { setEditing(true); setVal(c.title); }} title="Rename"
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

function MessageRow({ m }: { m: Msg }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(m.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); });
  };
  return (
    <div className={`group flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] ${m.role === "user" ? "" : "w-full"}`}>
        <div className={`relative px-4 py-3 rounded-2xl text-sm ${
          m.role === "user"
            ? "bg-foreground text-background rounded-tr-md"
            : "bg-muted/40 border rounded-tl-md"
        }`}>
          {m.role === "assistant" ? (
            <article className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-code:before:content-none prose-code:after:content-none prose-code:bg-background prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-background prose-pre:border">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
            </article>
          ) : (
            m.content
          )}
          <button
            onClick={copy}
            className={`absolute -bottom-2 ${m.role === "user" ? "left-2" : "right-2"} opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 grid place-items-center rounded-md border bg-background hover:bg-accent`}
            title="Copy"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        {m.tool_calls && m.tool_calls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.tool_calls.map((tc, j) => (
              <details key={j} className="text-[11px]">
                <summary className="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  <Wrench className="h-3 w-3" /> {tc.name}
                </summary>
                <pre className="mt-1.5 p-2 rounded-md bg-muted text-[10px] overflow-auto max-h-40 max-w-md">
{`args: ${JSON.stringify(tc.args, null, 2)}
result: ${JSON.stringify(tc.result_preview, null, 2)}`}
                </pre>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
