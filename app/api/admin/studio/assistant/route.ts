import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { privateHeaders } from "@/lib/comfy/admin";
import { ASSISTANT_LIMITS } from "@/lib/studio/agent/limits";
import { getAssistantProvider } from "@/lib/studio/agent/provider";
import { parseAssistantRequest, systemPrompt } from "@/lib/studio/agent/conversation";
import { runAssistant } from "@/lib/studio/agent/loop";
import { assistantRateLimiter } from "@/lib/studio/agent/rate-limit";

export const dynamic = "force-dynamic";

const PUBLIC_LIMITS = {
  max_messages: ASSISTANT_LIMITS.maxMessages,
  max_message_chars: ASSISTANT_LIMITS.maxMessageChars,
  max_requests_per_hour: ASSISTANT_LIMITS.maxRequestsPerHour,
  max_usd_per_request: ASSISTANT_LIMITS.maxUsdPerRequest,
};

const REASONS = {
  disabled: "The assistant is turned off.",
  no_provider: "No language model is approved for the assistant yet.",
  no_pricing: "The language model has no verified pricing, so spending cannot be capped.",
} as const;

/** Readiness for the Studio panel. Admin only; reveals no provider name, key or price. */
export async function GET() {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const status = getAssistantProvider();
  return NextResponse.json(
    status.enabled ? { enabled: true, limits: PUBLIC_LIMITS } : { enabled: false, reason: REASONS[status.reason], limits: PUBLIC_LIMITS },
    { headers: privateHeaders },
  );
}

/**
 * One assistant answer. The model may only read settings and propose a patch through the C2a tools.
 * Nothing here generates, submits, dispatches or writes to the database.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const status = getAssistantProvider();
  if (!status.enabled) return NextResponse.json({ error: REASONS[status.reason] }, { status: 503, headers: privateHeaders });

  const parsed = parseAssistantRequest(await req.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status, headers: privateHeaders });

  const slot = assistantRateLimiter.acquire(auth.user.id);
  if (!slot.ok) {
    return NextResponse.json(
      { error: slot.reason === "rate" ? "Too many assistant requests. Try again later." : "The assistant's daily spending limit is reached." },
      { status: 429, headers: privateHeaders },
    );
  }

  const { context, turns } = parsed.request;
  const result = await runAssistant({
    provider: status.provider, context, turns, system: systemPrompt(context.manifest),
    remainingUsd: slot.remainingUsd, signal: req.signal,
  });
  assistantRateLimiter.record(auth.user.id, result.usage.costUsd);

  // Structured log: no prompt, reply or values, only counters.
  console.info(JSON.stringify({
    event: "studio_assistant", user: auth.user.id, template: context.manifest.slug, provider: status.provider.id,
    stop: result.stop, calls: result.usage.modelCalls, tools: result.usage.toolCalls,
    input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens, usd: Number(result.usage.costUsd.toFixed(6)),
    proposal: !!result.proposal,
  }));

  return NextResponse.json({
    reply: result.reply,
    proposal: result.proposal,
    refused: result.refused,
    stop: result.stop,
    usage: {
      model_calls: result.usage.modelCalls, tool_calls: result.usage.toolCalls,
      input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens,
      estimated_usd: Number(result.usage.costUsd.toFixed(6)),
    },
  }, { headers: privateHeaders });
}
