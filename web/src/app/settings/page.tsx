"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  const settings = useQuery(api.userSettings.get);
  const setGroq = useMutation(api.userSettings.setGroqKey);
  const clearGroq = useMutation(api.userSettings.clearGroqKey);
  const setTg = useMutation(api.userSettings.setTelegramToken);
  const clearTg = useMutation(api.userSettings.clearTelegramToken);
  const setChat = useMutation(api.userSettings.setTelegramChatId);
  const clearChat = useMutation(api.userSettings.clearTelegramChatId);
  const registerWebhook = useAction(api.telegram.registerWebhook);

  const [groqKey, setGroqKey] = useState("");
  const [tgToken, setTgToken] = useState("");
  const [chatId, setChatId] = useState("");

  useEffect(() => {
    if (settings?.telegram_chat_id) setChatId(settings.telegram_chat_id);
  }, [settings?.telegram_chat_id]);

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

  return (
    <div className="space-y-8 max-w-2xl">
      <PageHeader
        eyebrow="settings"
        title={<>API keys <em className="font-serif text-muted-foreground not-italic">&amp;</em> integrations</>}
        subtitle="Sealed at rest with AES-GCM. Tokens never leave the backend."
      />

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">Groq API key</div>
              <div className="text-xs text-muted-foreground">
                Optional — speeds up resume parsing.
              </div>
            </div>
            {settings?.has_groq_key ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" /> set
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">unset</span>
            )}
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

      <Card>
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">Telegram bot</div>
              <div className="text-xs text-muted-foreground">
                Bot token + chat ID. Used by &quot;Apply via TG&quot; on the
                jobs page.
              </div>
            </div>
            {settings?.has_telegram_token && settings?.telegram_chat_id ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" /> ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" /> incomplete
              </span>
            )}
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

          <div className="flex items-center justify-between pt-2 border-t border-foreground/10">
            <div>
              <div className="text-sm font-medium">Confirm/Cancel buttons</div>
              <div className="text-[11px] text-muted-foreground">
                Register Telegram webhook so the Confirm/Skip buttons on apply
                briefs record the application back here.
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
  );
}
