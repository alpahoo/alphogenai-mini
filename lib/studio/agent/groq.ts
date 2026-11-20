/**
 * GroqCloud's OpenAI-compatible Chat Completions adapter for the admin Studio assistant.
 * No external SDK dependency: native fetch keeps the existing lockfile intact.
 * Fixed model, fixed endpoint, no user-controlled URLs, no logging of keys/content.
 * The assistant can ONLY use toolDefinitions from C2a; generation is not exposed.
 */
import type { AssistantProvider, ProviderRequest, ProviderTurn, ToolCall } from "./provider";

export const GROQ_QWEN_MODEL = "qwen/qwen3.8-27b";
export const GROQ_QWEN_PRICING = { inputPerMTok: 0.8, outputPerMTok: 4 } as const;
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

interface GroqToolCall {
  id?: unknown;
  type?: unknown;
  function?: { name?: unknown; arguments?: unknown };
}
interface GroqChoice {
  message?: { content?: unknown; tool_calls?: unknown; refusal?: unknown };
  finish_reason?: unknown;
}
interface GroqResponse {
  choices?: GroqChoice[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function validInt(x: unknown): number {
  return typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : 0;
}

function parseArgs(raw: unknown): unknown {
  if (typeof raw !== "string" || raw.length > 12000) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Convert internal tool conversation into the exact wire protocol expected by Groq. */
export function groqMessages(request: ProviderRequest): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [{ role: "system", content: request.system }];
  for (const item of request.messages) {
    if (item.role === "user") { messages.push({ role: "user", content: item.text }); continue; }
    if (item.role === "assistant") {
      messages.push({
        role: "assistant",
        content: item.text || null,
        ...(item.toolCalls?.length ? {
          tool_calls: item.toolCalls.map(call => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.input) },
          })),
        } : {}),
      });
      continue;
    }
    for (const result of item.results) {
      messages.push({ role: "tool", tool_call_id: result.id, content: result.content });
    }
  }
  return messages;
}

/** Defensive response parsing: only usable strings and bounded structured tools survive. */
export function parseGroqCompletion(raw: unknown): ProviderTurn {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Groq response");
  const body = raw as GroqResponse;
  const choice = body.choices?.[0];
  if (!choice || !choice.message) throw new Error("Missing Groq choice");
  const content = choice.message.content;
  const toolCalls: ToolCall[] = [];
  if (Array.isArray(choice.message.tool_calls)) {
    if (choice.message.tool_calls.length > 16) throw new Error("Excessive Groq tool calls");
    for (const rawCall of choice.message.tool_calls as GroqToolCall[]) {
      if (typeof rawCall.id !== "string" || rawCall.id.length > 256 ||
          typeof rawCall.function?.name !== "string" || rawCall.function.name.length > 128) {
        throw new Error("Malformed Groq tool call");
      }
      toolCalls.push({
        id: rawCall.id, name: rawCall.function.name,
        input: parseArgs(rawCall.function.arguments),
      });
    }
  }
  const finish = choice.finish_reason;
  const stop: ProviderTurn["stop"] =
    choice.message.refusal ? "refusal" :
    finish === "tool_calls" ? "tool_use" :
    finish === "length" ? "max_tokens" :
    finish === "content_filter" ? "refusal" :
    finish === "stop" ? "end" : "other";
  if (stop === "tool_use" && toolCalls.length === 0) throw new Error("Missing tool calls");
  return {
    text: typeof content === "string" ? content : "",
    toolCalls, stop,
    usage: {
      inputTokens: validInt(body.usage?.prompt_tokens),
      outputTokens: validInt(body.usage?.completion_tokens),
    },
  };
}

export function groqQwenProvider(apiKey: string, requestFetch: typeof fetch = fetch): AssistantProvider {
  if (!apiKey.trim()) throw new Error("Missing Groq API key");
  return {
    id: "groq-qwen", model: GROQ_QWEN_MODEL, pricing: GROQ_QWEN_PRICING,
    async complete(req) {
      const response = await requestFetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_QWEN_MODEL,
          messages: groqMessages(req),
          tools: req.tools.map(t => ({
            type: "function", function: {
              name: t.name, description: t.description, parameters: t.input_schema,
            },
          })),
          tool_choice: "auto",
          parallel_tool_calls: false,
          stream: false,
          max_completion_tokens: req.maxOutputTokens,
          reasoning_format: "hidden",
          reasoning_effort: "none",
        }),
        signal: req.signal,
        cache: "no-store",
      });
      // Never include Groq's error bodies or headers in exceptions/logging.
      if (!response.ok) throw new Error(response.status === 429 ? "Groq rate limited" : "Groq unavailable");
      const result: unknown = await response.json();
      return parseGroqCompletion(result);
    },
  };
}
