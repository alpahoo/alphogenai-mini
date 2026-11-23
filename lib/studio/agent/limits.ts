/**
 * C2b: hard limits of the Studio assistant. Every value is enforced on the server before or during the
 * tool loop; none can be raised by the browser. Prices come from the provider adapter (USD per million
 * tokens) and are required: without a price the spending caps cannot be enforced, so the route refuses.
 */
export const ASSISTANT_LIMITS = {
  /** Conversation sent by the browser (text turns only). */
  maxMessages: 20,
  maxMessageChars: 2000,
  maxTotalChars: 16000,
  /** Model calls per user message: 1 + tool rounds. */
  maxToolRounds: 4,
  /** Tool calls the model may make in one response. */
  maxToolCallsPerTurn: 4,
  /** Output tokens per model call. */
  maxOutputTokens: 700,
  /** Estimated input tokens per model call (chars / 3, pessimistic). */
  maxInputTokens: 12000,
  /** Tool result text returned to the model. */
  maxToolResultChars: 4000,
  /** Reply text returned to the browser. */
  maxReplyChars: 4000,
  /** Worst-case cost of one user message (all calls), checked BEFORE each call. */
  maxUsdPerRequest: 0.02,
  /** Per admin, per server instance (best effort: the durable cap must also be set at the provider). */
  maxRequestsPerHour: 20,
  maxUsdPerDay: 0.5,
  /** Server-side timeout of the whole loop. */
  timeoutMs: 45_000,
} as const;

export type AssistantLimits = { readonly [K in keyof typeof ASSISTANT_LIMITS]: number };

export interface ProviderPricing {
  /** USD per million input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
}

export function costUsd(pricing: ProviderPricing, inputTokens: number, outputTokens: number): number {
  return (inputTokens * pricing.inputPerMTok + outputTokens * pricing.outputPerMTok) / 1_000_000;
}

/** Pessimistic token estimate used before a call (no tokenizer, no network). */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3);
}

export function validPricing(p: ProviderPricing | null | undefined): p is ProviderPricing {
  return !!p && Number.isFinite(p.inputPerMTok) && Number.isFinite(p.outputPerMTok) && p.inputPerMTok > 0 && p.outputPerMTok > 0;
}
