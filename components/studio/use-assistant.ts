"use client";

import { useCallback, useEffect, useState } from "react";
import { acceptProposal, proposePatch, templateId, type PatchError, type Proposal, type StudioContext } from "@/lib/studio/agent/patch";
import { addEntry, historyEntry, loadHistory, saveHistory, type HistoryEntry } from "@/lib/studio/agent/history";
import type { ParamValues } from "@/lib/studio/manifest";

const storage = () => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };

/**
 * Studio assistant state (C2a). Proposals come from `propose` (the C2b chat will call it through
 * `runTool`); the user accepts or rejects them. Accepting only replaces the form values: it never
 * calls generate. History is local to this browser, per template.
 */
export function useStudioAssistant(ctx: StudioContext | null, replaceValues: (values: ParamValues) => void) {
  const template = ctx ? templateId(ctx.manifest) : null;
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [errors, setErrors] = useState<PatchError[]>([]);
  const [decisionError, setDecisionError] = useState("");
  const [log, setLog] = useState<HistoryEntry[]>([]);

  // A proposal belongs to one template: switching model drops it and loads that template's history.
  useEffect(() => {
    setProposal(null); setErrors([]); setDecisionError("");
    setLog(template ? loadHistory(storage(), template) : []);
  }, [template]);

  const record = useCallback((p: Proposal, decision: "accepted" | "rejected") => {
    setLog(prev => { const next = addEntry(prev, historyEntry(p, decision)); saveHistory(storage(), p.template, next); return next; });
  }, []);

  const propose = useCallback((raw: unknown, rationale?: string | null) => {
    if (!ctx) return null;
    const r = proposePatch(ctx, raw, { rationale });
    setDecisionError("");
    if (r.ok) { setProposal(r.proposal); setErrors([]); return r.proposal; }
    setErrors(r.errors); return null;
  }, [ctx]);

  const accept = useCallback(() => {
    if (!ctx || !proposal) return;
    const r = acceptProposal(ctx, proposal);
    if (!r.ok) {
      setDecisionError(r.code === "stale" ? "The settings changed since this proposal. Ask again." : "This proposal is no longer valid.");
      return;
    }
    replaceValues(r.values);
    record(proposal, "accepted");
    setProposal(null); setDecisionError("");
  }, [ctx, proposal, record, replaceValues]);

  const reject = useCallback(() => {
    if (!proposal) return;
    record(proposal, "rejected");
    setProposal(null); setDecisionError("");
  }, [proposal, record]);

  return { proposal, errors, decisionError, history: log, propose, accept, reject };
}

export type AssistantState = ReturnType<typeof useStudioAssistant>;
