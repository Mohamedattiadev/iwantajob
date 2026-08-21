"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Trash2, AlertTriangle, Sparkles, Send, Brain, Network } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";

type PillTone = "ready" | "incomplete" | "unset";

function StatusPill({ tone, label, icon }: { tone: PillTone; label: string; icon?: React.ReactNode }) {
  const cls =
    tone === "ready"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30"
      : tone === "incomplete"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30"
      : "bg-muted text-muted-foreground ring-border";
  return (
    <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold ring-1 whitespace-nowrap shrink-0 ${cls}`}>
      {icon}
      {label}
    </span>
  );
}

export default function SettingsPage() {
  const settings = useQuery(api.userSettings.get);
  const setGroq = useMutation(api.userSettings.setGroqKey);
  const clearGroq = useMutation(api.userSettings.clearGroqKey);
  const setGemini = useMutation(api.userSettings.setGeminiKey);
  const clearGemini = useMutation(api.userSettings.clearGeminiKey);
  const setOR = useMutation(api.userSettings.setOpenrouterKey);
  const clearOR = useMutation(api.userSettings.clearOpenrouterKey);
  const setORModel = useMutation(api.userSettings.setOpenrouterModel);
  const setTg = useMutation(api.userSettings.setTelegramToken);
  const clearTg = useMutation(api.userSettings.clearTelegramToken);
  const setChat = useMutation(api.userSettings.setTelegramChatId);
  const clearChat = useMutation(api.userSettings.clearTelegramChatId);
  const registerWebhook = useAction(api.telegram.registerWebhook);

  const [groqKey, setGroqKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [orKey, setOrKey] = useState("");
  const [orModel, setOrModel] = useState("");
  const [tgToken, setTgToken] = useState("");
  const [chatId, setChatId] = useState("");

  useEffect(() => {
    if (settings?.telegram_chat_id) setChatId(settings.telegram_chat_id);
  }, [settings?.telegram_chat_id]);
  useEffect(() => {
    if (settings?.openrouter_model) setOrModel(settings.openrouter_model);
  }, [settings?.openrouter_model]);

  const save = async (
    fn: () => Promise<unknown>,
    label: string,
    after?: () => void,
  ) => {
    try {
      await fn();
      toast.success(`${label} saved`);
      after?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to save ${label}`);
    }
  };

  const groqTone: PillTone = settings?.has_groq_key ? "ready" : "unset";
  const geminiTone: PillTone = settings?.has_gemini_key ? "ready" : "unset";
  const orTone: PillTone = settings?.has_openrouter_key ? "ready" : "unset";
  const tgReady = settings?.has_telegram_token && settings?.telegram_chat_id;
  const tgTone: PillTone = tgReady ? "ready" : settings?.has_telegram_token || settings?.telegram_chat_id ? "incomplete" : "unset";

  const OR_MODEL_HINTS = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "deepseek/deepseek-chat-v3.1:free",
    "google/gemini-2.0-flash-exp:free",
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="06 · settings"
        title={<><span>API</span> <span className="text-muted-foreground italic">keys &amp; integrations</span></>}
        subtitle="Sealed at rest with AES-GCM. Tokens never leave the backend."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gemini — primary LLM */}
        <Card accentColor="emerald" showAccentLine showCornerGlow>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Brain className="h-4 w-4 text-foreground/70 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">Gemini API key</div>
                  <div className="text-xs text-muted-foreground">
                    Powers chat, CV parsing, interview, AI rewrite. Free tier ≈ 15 req/min &amp; 1500/day shared across all users on the server key — add your own to skip the queue.
                  </div>
                </div>
              </div>
              <StatusPill
                tone={geminiTone}
                label={geminiTone === "ready" ? "set" : "server key"}
                icon={geminiTone === "ready" ? <Check className="h-3 w-3" /> : null}
              />
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="AIza..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
              />
              <Button
                onClick={() =>
                  save(
                    () => setGemini({ key: geminiKey.trim() }),
                    "Gemini key",
                    () => setGeminiKey(""),
                  )
                }
                disabled={!geminiKey.trim()}
              >
                Save
              </Button>
              {settings?.has_gemini_key && (
                <Button
                  variant="ghost"
                  onClick={() => save(() => clearGemini({}), "Gemini key (clear)")}
                  title="Clear"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Get one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline">aistudio.google.com/apikey</a>.
            </p>
          </CardContent>
        </Card>

        {/* OpenRouter — fallback / model picker */}
        <Card accentColor="amber" showAccentLine showCornerGlow>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Network className="h-4 w-4 text-foreground/70 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">OpenRouter API key</div>
                  <div className="text-xs text-muted-foreground">
                    Fallback provider — unlock free models like Llama 3.3 70B, Qwen 2.5 72B, DeepSeek v3. Used when Gemini is rate-limited.
                  </div>
                </div>
              </div>
              <StatusPill
                tone={orTone}
                label={orTone === "ready" ? "set" : "server key"}
                icon={orTone === "ready" ? <Check className="h-3 w-3" /> : null}
              />
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-or-..."
                value={orKey}
                onChange={(e) => setOrKey(e.target.value)}
              />
              <Button
                onClick={() =>
                  save(
                    () => setOR({ key: orKey.trim() }),
                    "OpenRouter key",
                    () => setOrKey(""),
                  )
                }
                disabled={!orKey.trim()}
              >
                Save
              </Button>
              {settings?.has_openrouter_key && (
                <Button
                  variant="ghost"
                  onClick={() => save(() => clearOR({}), "OpenRouter key (clear)")}
                  title="Clear"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Model (optional)
              </label>
              <div className="flex gap-2">
                <Input
                  list="or-models"
                  placeholder="meta-llama/llama-3.3-70b-instruct:free"
                  value={orModel}
                  onChange={(e) => setOrModel(e.target.value)}
                />
                <datalist id="or-models">
                  {OR_MODEL_HINTS.map((m) => <option key={m} value={m} />)}
                </datalist>
                <Button
                  onClick={() => save(() => setORModel({ model: orModel.trim() }), "OpenRouter model")}
                  disabled={!orModel.trim()}
                >
                  Save
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Get a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">openrouter.ai/keys</a>. Free models append <code>:free</code>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Groq — voice */}
        <Card accentColor="violet" showAccentLine showCornerGlow>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-foreground/70 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">Groq API key</div>
                  <div className="text-xs text-muted-foreground">
                    Powers voice STT (Whisper) + TTS on /interview. Optional.
                  </div>
                </div>
              </div>
              <StatusPill
                tone={groqTone}
                label={groqTone === "ready" ? "set" : "unset"}
                icon={groqTone === "ready" ? <Check className="h-3 w-3" /> : null}
              />
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="gsk_..."
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
              />
              <Button
                onClick={() =>
                  save(
                    () => setGroq({ key: groqKey.trim() }),
                    "Groq key",
                    () => setGroqKey(""),
                  )
                }
                disabled={!groqKey.trim()}
              >
                Save
              </Button>
              {settings?.has_groq_key && (
                <Button
                  variant="ghost"
                  onClick={() => save(() => clearGroq({}), "Groq key (clear)")}
                  title="Clear"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Telegram */}
        <Card accentColor="sky" showAccentLine showCornerGlow>
          <CardContent className="p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Send className="h-4 w-4 text-foreground/70 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">Telegram bot</div>
                  <div className="text-xs text-muted-foreground">
                    Bot token + chat ID. Used by &quot;Apply via TG&quot; on the jobs page.
                  </div>
                </div>
              </div>
              <StatusPill
                tone={tgTone}
                label={tgTone === "ready" ? "ready" : tgTone === "incomplete" ? "incomplete" : "unset"}
                icon={
                  tgTone === "ready" ? <Check className="h-3 w-3" /> :
                  tgTone === "incomplete" ? <AlertTriangle className="h-3 w-3" /> : null
                }
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Bot token
              </label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="123456789:ABCdef..."
                  value={tgToken}
                  onChange={(e) => setTgToken(e.target.value)}
                />
                <Button
                  onClick={() =>
                    save(
                      () => setTg({ token: tgToken.trim() }),
                      "Telegram token",
                      () => setTgToken(""),
                    )
                  }
                  disabled={!tgToken.trim()}
                >
                  Save
                </Button>
                {settings?.has_telegram_token && (
                  <Button
                    variant="ghost"
                    onClick={() => save(() => clearTg({}), "Telegram token (clear)")}
                    title="Clear"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Chat ID
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="-1001234567890 or 1234567890"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                />
                <Button
                  onClick={() =>
                    save(() => setChat({ chat_id: chatId.trim() }), "Chat ID")
                  }
                  disabled={!chatId.trim()}
                >
                  Save
                </Button>
                {settings?.telegram_chat_id && (
                  <Button
                    variant="ghost"
                    onClick={() => save(() => clearChat({}), "Chat ID (clear)")}
                    title="Clear"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Get it from @userinfobot, or look at any update from your bot.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-foreground/10">
              <div>
                <div className="text-sm font-medium">Confirm/Cancel buttons</div>
                <div className="text-[11px] text-muted-foreground">
                  Register Telegram webhook so the Confirm/Skip buttons on apply briefs record the application back here.
                </div>
              </div>
              <Button
                variant="secondary"
                disabled={!settings?.has_telegram_token}
                onClick={async () => {
                  try {
                    const res = await registerWebhook({});
                    if (res.ok) toast.success("Webhook registered");
                    else toast.error(res.error ?? "Failed");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                }}
              >
                Register webhook
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
