"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AssistantReadiness } from "@/lib/studio/agent/client";
import { AssistantChatSession, type AssistantFetcher, type LiveStudio } from "@/lib/studio/agent/chat-session";
import type { StudioState } from "./use-studio";

export type { ChatEntry } from "@/lib/studio/agent/chat-session";

const ENDPOINT = "/api/admin/studio/assistant";

const fetcher: AssistantFetcher = async (body, signal) => {
  const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, signal, body });
  return { ok: res.ok, data: await res.json().catch(() => null) };
};

/**
 * C2b conversation state. The conversation lives in this component only (no storage, no database).
 * Late answers are handled by `AssistantChatSession`: it reads the Studio as it is when the answer
 * arrives (model, form, reference), and a proposal only reaches the C2a engine (`s.assistant.propose`)
 * and its proposal card. This hook never calls `generate`.
 */
export function useAssistantChat(s: StudioState) {
  const [readiness, setReadiness] = useState<AssistantReadiness | null>(null);
  const template = s.model.slug;

  // Latest Studio state, read by the session when an answer arrives (never the state at send time).
  const live = useRef<LiveStudio | null>(null);
  live.current = { template, values: s.values, referencePath: s.reference?.path ?? null, propose: s.assistant.propose };

  const sessionRef = useRef<AssistantChatSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new AssistantChatSession(fetcher, () => live.current);
  const session = sessionRef.current;
  const view = useSyncExternalStore(session.subscribe, session.getView, session.getView);

  useEffect(() => {
    let alive = true;
    fetch(ENDPOINT, { cache: "no-store" })
      .then(r => r.ok ? r.json() : { enabled: false, reason: "The assistant is unavailable." })
      .then(d => { if (alive) setReadiness(d as AssistantReadiness); })
      .catch(() => { if (alive) setReadiness({ enabled: false, reason: "The assistant is unavailable." }); });
    return () => { alive = false; };
  }, []);

  // One conversation per model: switching model starts a new one and ignores any answer in flight.
  useEffect(() => { session.reset(); }, [template, session]);
  useEffect(() => () => session.dispose(), [session]);

  const maxMessages = readiness?.limits?.max_messages ?? 20;
  const maxChars = readiness?.limits?.max_message_chars ?? 2000;
  const enabled = !!readiness?.enabled;

  const send = useCallback(async (text: string) =>
    (await session.send(text, { enabled, maxChars, maxMessages })) === "answered",
  [enabled, maxChars, maxMessages, session]);
  const reset = useCallback(() => session.reset(), [session]);

  return { readiness, entries: view.entries, pending: view.pending, error: view.error, send, reset, full: session.isFull(maxMessages), maxChars };
}

export type AssistantChatState = ReturnType<typeof useAssistantChat>;
