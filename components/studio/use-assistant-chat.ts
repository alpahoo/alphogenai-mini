"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildAssistantBody, parseAssistantAnswer, type AssistantReadiness } from "@/lib/studio/agent/client";
import type { ChatTurn } from "@/lib/studio/agent/conversation";
import type { StudioState } from "./use-studio";

export interface ChatEntry extends ChatTurn { id: string; note?: string }

/**
 * C2b conversation state. The conversation lives in this component only (no storage, no database).
 * A proposal from the server goes through `s.assistant.propose`, i.e. the C2a engine and the existing
 * proposal card. This hook never calls `generate`.
 */
export function useAssistantChat(s: StudioState) {
  const [readiness, setReadiness] = useState<AssistantReadiness | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const template = s.model.slug;

  useEffect(() => {
    let live = true;
    fetch("/api/admin/studio/assistant", { cache: "no-store" })
      .then(r => r.ok ? r.json() : { enabled: false, reason: "The assistant is unavailable." })
      .then(d => { if (live) setReadiness(d as AssistantReadiness); })
      .catch(() => { if (live) setReadiness({ enabled: false, reason: "The assistant is unavailable." }); });
    return () => { live = false; };
  }, []);

  // One conversation per model: switching model starts a new one.
  const reset = useCallback(() => {
    abort.current?.abort(); abort.current = null;
    setEntries([]); setPending(false); setError("");
  }, []);
  useEffect(() => { reset(); }, [template, reset]);
  useEffect(() => () => abort.current?.abort(), []);

  const maxMessages = readiness?.limits?.max_messages ?? 20;
  const maxChars = readiness?.limits?.max_message_chars ?? 2000;
  const full = entries.length + 1 >= maxMessages;

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || pending || !readiness?.enabled || full || content.length > maxChars) return false;
    const userEntry: ChatEntry = { id: `u-${Date.now()}`, role: "user", content };
    const turns = [...entries, userEntry];
    setEntries(turns); setPending(true); setError("");
    const controller = new AbortController();
    abort.current?.abort(); abort.current = controller;
    try {
      const res = await fetch("/api/admin/studio/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: buildAssistantBody({ template, values: s.values, referencePath: s.reference?.path ?? null, turns }),
      });
      const data = await res.json().catch(() => null);
      if (controller.signal.aborted) return false;
      if (!res.ok) {
        setEntries(entries); // the failed question is not kept in the conversation
        setError(typeof data?.error === "string" ? data.error : "The assistant did not answer.");
        return false;
      }
      const answer = parseAssistantAnswer(data);
      if (!answer) { setEntries(entries); setError("The assistant sent an unreadable answer."); return false; }
      let note: string | undefined;
      if (answer.proposal) {
        // Re-validated against the current form by the C2a engine; refusals show in the existing error list.
        const shown = s.assistant.propose(answer.proposal.patch, answer.proposal.rationale);
        note = shown ? "Proposal ready below. Nothing changes until you apply it." : "The proposal no longer fits your current settings.";
      }
      setEntries([...turns, { id: `a-${Date.now()}`, role: "assistant", content: answer.reply, note }]);
      return true;
    } catch {
      if (!controller.signal.aborted) { setEntries(entries); setError("The assistant did not answer."); }
      return false;
    } finally {
      if (abort.current === controller) { abort.current = null; setPending(false); }
    }
  }, [entries, full, maxChars, pending, readiness?.enabled, s.assistant, s.reference?.path, s.values, template]);

  return { readiness, entries, pending, error, send, reset, full, maxChars };
}

export type AssistantChatState = ReturnType<typeof useAssistantChat>;
