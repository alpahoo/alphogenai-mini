"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssistantChat } from "./use-assistant-chat";
import type { StudioState } from "./use-studio";

/**
 * C2b: conversation with the Studio assistant, inside the existing Create panel. The assistant explains
 * settings and proposes changes (shown in the existing proposal card). It has no Generate button.
 */
export function AssistantChat({ s }: { s: StudioState }) {
  const chat = useAssistantChat(s);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const enabled = !!chat.readiness?.enabled;

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [chat.entries.length, chat.pending]);

  const submit = async () => {
    if (await chat.send(draft)) setDraft("");
  };

  return (
    <section aria-label="Studio assistant" className="rounded-2xl border border-border/60">
      <button type="button" onClick={() => { if (open) chat.reset(); setOpen(!open); }} aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground">
        <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4" />Assistant</span>
        <span className="text-xs">{chat.readiness === null ? "…" : enabled ? "Ask about settings" : "Off"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/50 px-4 py-3">
          {!enabled ? (
            <p className="text-xs text-muted-foreground">{chat.readiness?.reason ?? "Checking the assistant…"}</p>
          ) : (
            <>
              <div ref={list} className="max-h-72 space-y-2 overflow-y-auto pr-1" aria-live="polite">
                {chat.entries.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Ask what a setting does, or describe what you want (for example &ldquo;sharper, more contrast&rdquo;).
                    The assistant proposes changes; you apply them. It never starts a generation.
                  </p>
                )}
                {chat.entries.map(e => (
                  <div key={e.id} className={cn("max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                    e.role === "user" ? "ml-auto bg-primary/10 text-foreground" : "bg-muted/50 text-foreground")}>
                    <p className="whitespace-pre-wrap break-words">{e.content}</p>
                    {e.note && <p className="mt-1 text-[11px] text-muted-foreground">{e.note}</p>}
                  </div>
                ))}
                {chat.pending && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Thinking…</p>
                )}
              </div>

              {chat.error && <p role="alert" className="text-xs text-red-400">{chat.error}</p>}
              {chat.full && <p className="text-xs text-muted-foreground">This conversation reached its length limit. Start a new one.</p>}

              <div className="space-y-2">
                <label htmlFor="studio-assistant-input" className="sr-only">Message to the assistant</label>
                <textarea id="studio-assistant-input" rows={2} value={draft} maxLength={chat.maxChars}
                  disabled={chat.pending || chat.full}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
                  placeholder="Ask the assistant…"
                  className="block w-full resize-y rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20" />
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={chat.reset} disabled={chat.pending || chat.entries.length === 0}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
                    <RotateCcw className="h-3.5 w-3.5" />New conversation
                  </button>
                  <button type="button" onClick={() => void submit()} disabled={chat.pending || chat.full || !draft.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-40">
                    <Send className="h-3.5 w-3.5" />Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
