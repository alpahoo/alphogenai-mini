/**
 * Podcast dialogue LLM call (network only).
 *
 * Uses the same Research LiteLLM gateway (OpenAI-compatible) as the rest of the
 * app — provider/model stay hidden behind the gateway. NOT a direct Anthropic
 * call. Kept separate from the pure helpers so tests can mock the network.
 */

import {
  type DialogueSegment,
  type SpeakerRole,
  type ValidationResult,
  buildPodcastDialoguePrompt,
  parsePodcastDialogueResponse,
  normalizePodcastSegments,
  validatePodcastSegments,
  parseAndValidateDialogue,
  turnsForDuration,
  LONGFORM_TURN_THRESHOLD,
} from "./dialogue";

export interface DialogueLLMResult {
  content: string;
  tokensUsed: number | null;
  modelUsed: string | null;
  error?: string;
}

export async function callLLMForPodcastDialogue(
  prompt: string,
  timeoutMs: number = 30000,
  maxTokens: number = 2000,
): Promise<DialogueLLMResult> {
  const gatewayUrl = process.env.RESEARCH_LLM_GATEWAY_URL;
  const serviceToken = process.env.RESEARCH_LLM_SERVICE_TOKEN;
  const model = process.env.RESEARCH_LLM_MODEL || "research-basic";

  if (!gatewayUrl || !serviceToken) {
    return { content: "", tokensUsed: null, modelUsed: null, error: "LLM gateway not configured" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content:
              "You are a podcast dialogue writer. Produce a natural two-person (host/guest) conversation. " +
              "Return ONLY a valid JSON object. Do not include markdown, code blocks, or any text outside the JSON.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorMsg =
        response.status === 429
          ? "Rate limited by LLM provider"
          : response.status >= 500
            ? "LLM provider error"
            : `LLM request failed: ${response.status}`;
      return { content: "", tokensUsed: null, modelUsed: null, error: errorMsg };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
      model?: string;
    };

    const content = data.choices?.[0]?.message?.content || "";
    return { content, tokensUsed: data.usage?.total_tokens || null, modelUsed: data.model || model };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { content: "", tokensUsed: null, modelUsed: null, error: `LLM request timed out after ${timeoutMs}ms` };
    }
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return { content: "", tokensUsed: null, modelUsed: null, error: errMsg };
  } finally {
    clearTimeout(timeoutId);
  }
}

const nextRoleAfter = (s?: DialogueSegment): SpeakerRole =>
  !s || s.speaker_role === "guest" ? "host" : "guest";

/**
 * Generate a full podcast dialogue, scaling to the target duration.
 *
 * - Short targets (≤ ~120s): a single LLM call (6–10 turns) — unchanged path.
 * - Long targets (5–10 min): generate in CHUNKS of ~10 turns, each continuing the
 *   prior turns, until the duration-derived turn target is reached. Each call
 *   stays small (so no token truncation), then the full set is validated. If
 *   alternation breaks across a chunk seam, a strict-alternation repair is tried.
 *
 * Returns the same ValidationResult shape as parseAndValidateDialogue.
 */
export async function generatePodcastDialogue(opts: {
  topic: string;
  language?: string;
  hostName?: string;
  guestName?: string;
  targetDurationSeconds?: number | null;
  style?: string | null;
  sourceUrl?: string | null;
  /** Soft wall-clock budget (ms) for the chunked loop so we return before the
   *  serverless function is killed. Once exceeded AND we have ≥min turns, stop. */
  softBudgetMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}): Promise<ValidationResult> {
  const tt = turnsForDuration(opts.targetDurationSeconds);
  const now = opts.now ?? (() => Date.now());
  const softBudgetMs = opts.softBudgetMs ?? 45000;
  const startedAt = now();
  const base = {
    topic: opts.topic,
    language: opts.language,
    hostName: opts.hostName,
    guestName: opts.guestName,
    targetDurationSeconds: opts.targetDurationSeconds,
    style: opts.style,
    sourceUrl: opts.sourceUrl,
  };

  // Short-form: one call (existing behaviour).
  if (tt.target < LONGFORM_TURN_THRESHOLD) {
    const prompt = buildPodcastDialoguePrompt({ ...base, turns: { min: tt.min, max: tt.max } });
    const llm = await callLLMForPodcastDialogue(prompt);
    if (llm.error) return { ok: false, error: llm.error };
    return parseAndValidateDialogue(llm.content, { topic: opts.topic, bounds: { min: tt.min, max: tt.max } });
  }

  // Long-form: chunked continuation. Larger chunks = fewer round-trips.
  const CHUNK = 12;
  const all: DialogueSegment[] = [];
  let safety = 0;
  while (all.length < tt.target && safety < 6) {
    safety++;
    // Stop early if we've spent the time budget and already have a usable length.
    if (all.length >= tt.min && now() - startedAt > softBudgetMs) break;
    const remaining = tt.target - all.length;
    const want = Math.min(CHUNK, Math.max(4, remaining));
    const turns = { min: Math.max(4, want - 2), max: want + 2 };
    const isFinal = all.length + want >= tt.target;
    const prompt =
      all.length === 0
        ? buildPodcastDialoguePrompt({ ...base, turns })
        : buildPodcastDialoguePrompt({
            ...base,
            turns,
            continuation: { priorTurns: all, isFinal, nextRole: nextRoleAfter(all[all.length - 1]) },
          });
    const llm = await callLLMForPodcastDialogue(prompt, 20000);
    if (llm.error) {
      if (all.length >= tt.min) break; // enough already — stop cleanly
      return { ok: false, error: llm.error };
    }
    const raw = parsePodcastDialogueResponse(llm.content);
    const norm = raw ? normalizePodcastSegments(raw, { topic: opts.topic }) : [];
    if (norm.length === 0) {
      if (all.length >= tt.min) break;
      continue; // retry within the safety budget
    }
    all.push(...norm);
  }

  if (all.length < tt.min) {
    return { ok: false, error: "Could not generate enough dialogue for this length. Try again or a shorter duration." };
  }

  const segs = all.slice(0, tt.max);
  const bounds = { min: tt.min, max: tt.max };
  const v = validatePodcastSegments(segs, bounds);
  if (v.ok) return v;

  // Repair: enforce strict host/guest alternation (guarantees no >2 run and both
  // speak), then re-validate. The turns stay a back-and-forth conversation.
  const repaired = segs.map((s, i) => ({ ...s, speaker_role: (i % 2 === 0 ? "host" : "guest") as SpeakerRole }));
  return validatePodcastSegments(repaired, bounds);
}
