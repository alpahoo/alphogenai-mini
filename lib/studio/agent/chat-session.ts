/**
 * C2b: browser-side conversation session, kept free of React so the late-answer rules can be tested
 * without a DOM. The hook (`components/studio/use-assistant-chat.ts`) is a thin wrapper around it.
 *
 * Late-answer rules (an answer arrives after the admin changed something):
 * - the conversation was reset, closed or the model switched: the answer is dropped, nothing changes;
 * - the reference image changed (A -> B, attached or removed): the reply is shown, the proposal is dropped;
 * - only the form values changed: the proposal is re-validated by the C2a engine against the CURRENT form.
 * This session never starts a generation: its only effect on the form is `propose`, i.e. the C2a card.
 */
import { buildAssistantBody, parseAssistantAnswer } from "./client";
import type { ChatTurn } from "./conversation";
import { fingerprint, type RawPatch } from "./patch";
import type { ParamValues } from "../manifest";

export interface ChatEntry extends ChatTurn { id: string; note?: string }
export interface ChatView { entries: ChatEntry[]; pending: boolean; error: string }

/** The Studio as it is NOW (read again when the answer arrives). */
export interface LiveStudio {
  template: string;
  values: ParamValues;
  referencePath: string | null;
  /** C2a engine: validates against the current form and shows the proposal card; null when refused. */
  propose(patch: RawPatch, rationale: string | null): unknown;
}

export type AssistantFetcher = (body: string, signal: AbortSignal) => Promise<{ ok: boolean; data: unknown }>;

export interface SendOptions { enabled: boolean; maxChars: number; maxMessages: number }

export type SendOutcome = "answered" | "failed" | "dropped" | "refused";

export const NOTES = {
  shown: "Proposal ready below. Nothing changes until you apply it.",
  rechecked: "Your settings changed during this answer. The proposal was checked again against your current settings.",
  noLongerFits: "The proposal no longer fits your current settings.",
  referenceChanged: "The reference image changed during this answer, so its proposal was dropped. Ask again.",
} as const;

const EMPTY: ChatView = { entries: [], pending: false, error: "" };

export class AssistantChatSession {
  private epoch = 0;
  private controller: AbortController | null = null;
  private view: ChatView = EMPTY;
  private readonly listeners = new Set<() => void>();
  private seq = 0;

  constructor(private readonly fetcher: AssistantFetcher, private readonly live: () => LiveStudio | null) {}

  getView = (): ChatView => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private set(next: Partial<ChatView>) {
    this.view = { ...this.view, ...next };
    for (const l of this.listeners) l();
  }

  /** New conversation (button, model switch): any answer in flight is ignored. */
  reset(): void {
    this.epoch++;
    this.controller?.abort();
    this.controller = null;
    this.set(EMPTY);
  }

  /** Panel unmounted: abort and ignore, without notifying anyone. */
  dispose(): void {
    this.epoch++;
    this.controller?.abort();
    this.controller = null;
    this.view = EMPTY;
  }

  isFull(maxMessages: number): boolean {
    return this.view.entries.length + 1 >= maxMessages;
  }

  async send(text: string, opts: SendOptions): Promise<SendOutcome> {
    const content = text.trim();
    const at = this.live();
    // Copy what was sent: the live object may be mutated later, the snapshot must not be.
    const start = at ? { template: at.template, values: at.values, referencePath: at.referencePath } : null;
    if (!start || !content || !opts.enabled || this.view.pending || content.length > opts.maxChars || this.isFull(opts.maxMessages)) {
      return "refused";
    }
    const epoch = this.epoch;
    const sentFingerprint = fingerprint(start.values, !!start.referencePath, start.referencePath);
    const before = this.view.entries;
    const turns: ChatEntry[] = [...before, { id: `u-${++this.seq}`, role: "user", content }];
    this.set({ entries: turns, pending: true, error: "" });
    const controller = new AbortController();
    this.controller = controller;

    // Same conversation and same model as when the question was sent?
    const current = (): LiveStudio | null => {
      if (this.epoch !== epoch || controller.signal.aborted) return null;
      const now = this.live();
      if (!now || now.template !== start.template) { this.reset(); return null; }
      return now;
    };
    const fail = (error: string): SendOutcome => {
      this.controller = null;
      this.set({ entries: before, pending: false, error }); // the failed question is not kept
      return "failed";
    };

    let res: { ok: boolean; data: unknown };
    try {
      res = await this.fetcher(
        buildAssistantBody({ template: start.template, values: start.values, referencePath: start.referencePath, turns }),
        controller.signal,
      );
    } catch {
      return current() ? fail("The assistant did not answer.") : "dropped";
    }
    const now = current();
    if (!now) return "dropped";
    if (!res.ok) {
      const d = res.data as { error?: unknown } | null;
      return fail(typeof d?.error === "string" ? d.error : "The assistant did not answer.");
    }
    const answer = parseAssistantAnswer(res.data);
    if (!answer) return fail("The assistant sent an unreadable answer.");

    let note: string | undefined;
    if (answer.proposal) {
      if (now.referencePath !== start.referencePath) {
        note = NOTES.referenceChanged; // never applied to another reference image
      } else {
        const changed = fingerprint(now.values, !!now.referencePath, now.referencePath) !== sentFingerprint;
        const shown = now.propose(answer.proposal.patch, answer.proposal.rationale);
        note = !shown ? NOTES.noLongerFits : changed ? NOTES.rechecked : NOTES.shown;
      }
    }
    this.controller = null;
    this.set({ entries: [...turns, { id: `a-${++this.seq}`, role: "assistant", content: answer.reply, note }], pending: false, error: "" });
    return "answered";
  }
}
