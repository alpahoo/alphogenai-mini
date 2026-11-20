"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  /** True right after Apply: the panel tells the admin to review the form (it never generates). */
  const [applied, setApplied] = useState(false);

  // A proposal belongs to one template: switching model drops it and loads that template's history.
  useEffect(() => {
    setProposal(null); setErrors([]); setDecisionError(""); setApplied(false);
    setLog(template ? loadHistory(storage(), template) : []);
  }, [template]);

  // Replacing, attaching or removing the reference makes the shown proposal stale: drop it at once
  // (Apply would refuse it anyway through the fingerprint) instead of leaving a dead card on screen.
  const referenceKey = ctx ? `${ctx.hasReference}|${ctx.hasReference ? ctx.referenceId ?? "" : ""}` : "";
  const firstReference = useRef(true);
  useEffect(() => {
    if (firstReference.current) { firstReference.current = false; return; }
    setProposal(null); setDecisionError(""); setApplied(false);
  }, [referenceKey]);

  const record = useCallback((p: Proposal, decision: "accepted" | "rejected") => {
    setLog(prev => { const next = addEntry(prev, historyEntry(p, decision)); saveHistory(storage(), p.template, next); return next; });
  }, []);

  const propose = useCallback((raw: unknown, rationale?: string | null) => {
    if (!ctx) return null;
    const r = proposePatch(ctx, raw, { rationale });
    setDecisionError("");
    if (r.ok) { setProposal(r.proposal); setErrors([]); setApplied(false); return r.proposal; }
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
    setProposal(null); setDecisionError(""); setApplied(true);
  }, [ctx, proposal, record, replaceValues]);

  const reject = useCallback(() => {
    if (!proposal) return;
    record(proposal, "rejected");
    setProposal(null); setDecisionError("");
  }, [proposal, record]);

  const dismissApplied = useCallback(() => setApplied(false), []);

  return { proposal, errors, decisionError, history: log, applied, dismissApplied, propose, accept, reject };
}

export type AssistantState = ReturnType<typeof useStudioAssistant>;
