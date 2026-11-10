/**
 * C2a prototype history: accepted and rejected proposals, kept in the browser only (no migration),
 * bounded, per template. Values are display strings truncated; nothing is sent to a server.
 */
import type { ValueChange } from "../preview";
import type { Proposal } from "./patch";

export type Decision = "accepted" | "rejected";

export interface HistoryEntry {
  id: string;
  template: string;
  decision: Decision;
  at: string;
  changes: ValueChange[];
  rationale: string | null;
}

export const HISTORY_LIMIT = 20;
const VALUE_MAX = 200;
const STORAGE_PREFIX = "alphogen.studio.assistant-history.v1:";

const clip = (s: string) => (s.length > VALUE_MAX ? `${s.slice(0, VALUE_MAX)}…` : s);

export function historyEntry(proposal: Proposal, decision: Decision, now = new Date()): HistoryEntry {
  return {
    id: proposal.id, template: proposal.template, decision, at: now.toISOString(),
    changes: proposal.changes.map(c => ({ ...c, from: clip(c.from), to: clip(c.to) })),
    rationale: proposal.rationale ? clip(proposal.rationale) : null,
  };
}

/** Newest first, one entry per proposal id, at most `limit`. */
export function addEntry(list: readonly HistoryEntry[], entry: HistoryEntry, limit = HISTORY_LIMIT): HistoryEntry[] {
  return [entry, ...list.filter(e => e.id !== entry.id)].slice(0, limit);
}

function isEntry(x: unknown): x is HistoryEntry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.template === "string" && (e.decision === "accepted" || e.decision === "rejected")
    && typeof e.at === "string" && Array.isArray(e.changes)
    && e.changes.every(c => typeof c === "object" && c !== null && ["key", "label", "from", "to"].every(k => typeof (c as Record<string, unknown>)[k] === "string"))
    && (e.rationale === null || typeof e.rationale === "string");
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Read the history for a template. Missing, blocked or malformed storage → empty list. */
export function loadHistory(storage: StorageLike | null | undefined, template: string): HistoryEntry[] {
  try {
    const raw = storage?.getItem(STORAGE_PREFIX + template);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry).filter(e => e.template === template).slice(0, HISTORY_LIMIT) : [];
  } catch { return []; }
}

export function saveHistory(storage: StorageLike | null | undefined, template: string, list: readonly HistoryEntry[]): void {
  try { storage?.setItem(STORAGE_PREFIX + template, JSON.stringify(list.slice(0, HISTORY_LIMIT))); } catch { /* best effort */ }
}
