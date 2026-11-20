/**
 * C2b: the LLM provider seam. The tool loop (`loop.ts`) only talks to this interface, so the provider can
 * be chosen (and priced, and approved) separately from the Studio code.
 *
 * The Groq/Qwen adapter is registered but disabled by default. Without the explicit owner enable flag
 * AND a dedicated server-only key, `getAssistantProvider()` returns disabled and no prompt leaves the server.
 */
import type { ToolDefinition } from "./tools";
import { validPricing, type ProviderPricing } from "./limits";
import { groqQwenProvider } from "./groq";

/** Provider-neutral conversation used inside one request. */
export type LoopMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls?: ToolCall[] }
  | { role: "tool"; results: ToolResultMessage[] };

export interface ToolCall { id: string; name: string; input: unknown }
export interface ToolResultMessage { id: string; content: string; isError: boolean }

export type StopReason = "end" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface ProviderTurn {
  text: string;
  toolCalls: ToolCall[];
  stop: StopReason;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ProviderRequest {
  system: string;
  messages: LoopMessage[];
  tools: ToolDefinition[];
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface AssistantProvider {
  /** Internal id, logged server-side only (never shown to non-admin users). */
  id: string;
  model: string;
  pricing: ProviderPricing;
  complete(request: ProviderRequest): Promise<ProviderTurn>;
}

type Env = Record<string, string | undefined>;
type AdapterFactory = (env: Env) => AssistantProvider | null;

/** Single approved adapter, still fail-closed until the server enable flag and dedicated key are present. */
export const ADAPTERS: Record<string, AdapterFactory> = {
  groq: env => env.GROQ_API_KEY?.trim() ? groqQwenProvider(env.GROQ_API_KEY) : null,
};

export type ProviderStatus =
  | { enabled: true; provider: AssistantProvider }
  | { enabled: false; reason: "disabled" | "no_provider" | "no_pricing" };

/** The assistant is off unless explicitly enabled AND an approved adapter with prices is configured. */
export function getAssistantProvider(env: Env = process.env, adapters: Record<string, AdapterFactory> = ADAPTERS): ProviderStatus {
  if (env.STUDIO_ASSISTANT_ENABLED !== "true") return { enabled: false, reason: "disabled" };
  const factory = adapters[env.STUDIO_ASSISTANT_PROVIDER ?? ""];
  const provider = factory ? factory(env) : null;
  if (!provider) return { enabled: false, reason: "no_provider" };
  if (!validPricing(provider.pricing)) return { enabled: false, reason: "no_pricing" };
  return { enabled: true, provider };
}
