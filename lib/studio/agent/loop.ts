/**
 * C2b: the server-side tool loop of the Studio assistant.
 *
 * The model may only call the three C2a tools (`get_config`, `describe_param`, `propose_patch`), executed
 * here by `runTool` against the server-built context. A successful `propose_patch` is returned to the
 * browser as a patch; the browser re-validates it with the C2a engine against the CURRENT form and shows
 * the existing proposal card. Nothing in this loop can generate, submit or dispatch.
 *
 * Budgets are enforced before every model call (worst case: estimated input + max output at the
 * provider's prices) and after it (actual usage). The loop stops cleanly when a limit is reached.
 */
import { ASSISTANT_LIMITS, costUsd, estimateTokens, type AssistantLimits } from "./limits";
import type { AssistantProvider, LoopMessage, ToolCall, ToolResultMessage } from "./provider";
import type { ChatTurn } from "./conversation";
import type { PatchError, RawPatch, StudioContext } from "./patch";
import { runTool, toolDefinitions } from "./tools";

export type StopCause = "answered" | "tool_rounds" | "budget" | "input_too_large" | "max_tokens" | "refusal" | "timeout" | "provider_error";

export interface AssistantUsage {
  modelCalls: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AssistantResult {
  reply: string;
  /** Last valid proposal of this answer, to be re-validated by the browser (C2a) before display. */
  proposal: { patch: RawPatch; rationale: string | null } | null;
  /** Refusals of the last proposal attempt when no valid proposal was produced. */
  refused: PatchError[];
  stop: StopCause;
  usage: AssistantUsage;
}

const FALLBACK: Record<Exclude<StopCause, "answered">, string> = {
  tool_rounds: "I stopped before finishing: this request needed too many steps. Try a more specific question.",
  budget: "I stopped to stay within the assistant's spending limit for one message.",
  input_too_large: "The conversation is too long for the assistant. Start a new conversation.",
  max_tokens: "My answer was cut at the length limit.",
  refusal: "I can't help with that request.",
  timeout: "The assistant took too long to answer. Try again.",
  provider_error: "The assistant is unavailable right now.",
};

function messageChars(system: string, messages: LoopMessage[], toolsJson: string): number {
  let n = system.length + toolsJson.length;
  for (const m of messages) {
    if (m.role === "tool") n += m.results.reduce((s, r) => s + r.content.length, 0);
    else n += m.text.length + (m.role === "assistant" && m.toolCalls ? JSON.stringify(m.toolCalls).length : 0);
  }
  return n;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function runAssistant(opts: {
  provider: AssistantProvider;
  context: StudioContext;
  turns: ChatTurn[];
  system: string;
  limits?: AssistantLimits;
  /** Remaining daily allowance for this admin (best effort, from the rate limiter). */
  remainingUsd?: number;
  signal?: AbortSignal;
}): Promise<AssistantResult> {
  const limits = opts.limits ?? ASSISTANT_LIMITS;
  const { provider, context } = opts;
  const tools = toolDefinitions(context);
  const toolsJson = JSON.stringify(tools);
  const cap = Math.min(limits.maxUsdPerRequest, opts.remainingUsd ?? Infinity);
  const usage: AssistantUsage = { modelCalls: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const messages: LoopMessage[] = opts.turns.map(t => t.role === "user" ? { role: "user", text: t.content } : { role: "assistant", text: t.content });

  let proposal: AssistantResult["proposal"] = null;
  let refused: PatchError[] = [];
  let lastText = "";
  const finish = (stop: StopCause, text?: string): AssistantResult => ({
    reply: clip((text ?? lastText).trim()
      || (stop === "answered" ? (proposal ? "I prepared a proposal: review it below." : "I have no answer to that.") : FALLBACK[stop]), limits.maxReplyChars),
    proposal, refused: proposal ? [] : refused, stop, usage,
  });

  const timeout = AbortSignal.timeout(limits.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  for (let round = 0; round <= limits.maxToolRounds; round++) {
    const inputTokens = estimateTokens(messageChars(opts.system, messages, toolsJson));
    if (inputTokens > limits.maxInputTokens) return finish("input_too_large", "");
    const worstCase = costUsd(provider.pricing, inputTokens, limits.maxOutputTokens);
    if (usage.costUsd + worstCase > cap) return finish("budget", lastText ? undefined : "");

    let turn;
    try {
      turn = await provider.complete({ system: opts.system, messages, tools, maxOutputTokens: limits.maxOutputTokens, signal });
    } catch {
      return finish(signal.aborted ? "timeout" : "provider_error", "");
    }
    usage.modelCalls++;
    usage.inputTokens += turn.usage.inputTokens;
    usage.outputTokens += turn.usage.outputTokens;
    usage.costUsd += costUsd(provider.pricing, turn.usage.inputTokens, turn.usage.outputTokens);
    if (turn.text.trim()) lastText = turn.text;

    if (turn.stop === "refusal") return finish("refusal", "");
    if (turn.stop === "max_tokens") return finish("max_tokens");
    if (turn.stop !== "tool_use" || turn.toolCalls.length === 0) return finish("answered");
    if (round === limits.maxToolRounds) return finish("tool_rounds");

    const calls: ToolCall[] = turn.toolCalls.slice(0, limits.maxToolCallsPerTurn);
    const results: ToolResultMessage[] = calls.map(call => {
      usage.toolCalls++;
      const r = runTool(context, call.name, call.input);
      if (r.ok && r.tool === "propose_patch") {
        proposal = { patch: r.proposal.patch, rationale: r.proposal.rationale };
        refused = [];
        return { id: call.id, isError: false, content: clip(JSON.stringify({ shown_to_user: true, changes: r.proposal.changes, workflow: r.proposal.preview.variant }), limits.maxToolResultChars) };
      }
      if (!r.ok && call.name === "propose_patch") refused = r.errors as PatchError[];
      return { id: call.id, isError: !r.ok, content: clip(JSON.stringify(r), limits.maxToolResultChars) };
    });
    // Calls over the per-turn limit are answered too, so the model is not left waiting on them.
    for (const call of turn.toolCalls.slice(limits.maxToolCallsPerTurn)) {
      results.push({ id: call.id, isError: true, content: JSON.stringify({ ok: false, errors: [{ code: "too_many_calls", message: "Too many tool calls in one step" }] }) });
    }
    messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls });
    messages.push({ role: "tool", results });
  }
  return finish("tool_rounds");
}
