/**
 * C2b browser helpers: build the assistant request and read its answer. Pure, so the browser side can be
 * tested without React or a network. The browser never trusts the server's proposal as-is: the hook passes
 * it to the C2a engine (`assistant.propose`), which validates it against the CURRENT form.
 */
import type { ChatTurn } from "./conversation";
import type { PatchError, RawPatch } from "./patch";
import type { ParamValues } from "../manifest";

export interface AssistantReadiness {
  enabled: boolean;
  reason?: string;
  limits?: { max_messages: number; max_message_chars: number; max_requests_per_hour: number; max_usd_per_request: number };
}

export interface AssistantAnswer {
  reply: string;
  proposal: { patch: RawPatch; rationale: string | null } | null;
  refused: PatchError[];
  stop: string;
  usage: { model_calls: number; tool_calls: number; input_tokens: number; output_tokens: number; estimated_usd: number } | null;
}

export function buildAssistantBody(input: {
  template: string; values: ParamValues; referencePath: string | null; turns: ChatTurn[];
}): string {
  return JSON.stringify({
    template: input.template,
    values: input.values,
    has_reference: !!input.referencePath,
    ...(input.referencePath ? { reference_id: input.referencePath } : {}),
    messages: input.turns.map(t => ({ role: t.role, content: t.content })),
  });
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Read a server answer defensively: anything malformed becomes "no proposal". */
export function parseAssistantAnswer(data: unknown): AssistantAnswer | null {
  if (!isObject(data) || typeof data.reply !== "string") return null;
  let proposal: AssistantAnswer["proposal"] = null;
  if (isObject(data.proposal) && isObject(data.proposal.patch)) {
    proposal = {
      patch: data.proposal.patch as RawPatch,
      rationale: typeof data.proposal.rationale === "string" ? data.proposal.rationale : null,
    };
  }
  const refused = Array.isArray(data.refused)
    ? data.refused.filter((e): e is PatchError => isObject(e) && typeof e.code === "string" && typeof e.message === "string")
    : [];
  const u = isObject(data.usage) ? data.usage : null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    reply: data.reply,
    proposal,
    refused,
    stop: typeof data.stop === "string" ? data.stop : "answered",
    usage: u ? { model_calls: num(u.model_calls), tool_calls: num(u.tool_calls), input_tokens: num(u.input_tokens), output_tokens: num(u.output_tokens), estimated_usd: num(u.estimated_usd) } : null,
  };
}
