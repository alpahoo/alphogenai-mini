/**
 * Test double for the C2b tool loop: replays scripted turns, records every request, never touches the
 * network. Used by the unit and route tests so no LLM is ever called in CI.
 */
import type { AssistantProvider, ProviderRequest, ProviderTurn, ToolCall } from "./provider";

export type ScriptStep = Partial<ProviderTurn> | ((req: ProviderRequest) => Partial<ProviderTurn> | Promise<Partial<ProviderTurn>>) | Error;

export function scriptedProvider(steps: ScriptStep[], pricing = { inputPerMTok: 1, outputPerMTok: 5 }) {
  const requests: ProviderRequest[] = [];
  let i = 0;
  const provider: AssistantProvider = {
    id: "fake", model: "fake-model", pricing,
    async complete(req) {
      // Snapshot: the loop keeps appending to the same array.
      requests.push({ ...req, messages: structuredClone(req.messages) });
      const step = steps[i++];
      if (step === undefined) throw new Error("script exhausted");
      if (step instanceof Error) throw step;
      const t = typeof step === "function" ? await step(req) : step;
      const toolCalls = t.toolCalls ?? [];
      return {
        text: t.text ?? "",
        toolCalls,
        stop: t.stop ?? (toolCalls.length ? "tool_use" : "end"),
        usage: t.usage ?? { inputTokens: 1000, outputTokens: 100 },
      };
    },
  };
  return { provider, requests, calls: () => i };
}

let n = 0;
export const call = (name: string, input: unknown): ToolCall => ({ id: `call-${++n}`, name, input });
