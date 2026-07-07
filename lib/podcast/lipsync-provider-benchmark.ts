export type LipsyncProviderVerdict = "production_candidate" | "watchlist" | "reject";

export interface LipsyncProviderBenchmarkInput {
  id: string;
  label: string;
  /** 1..5: mouth sync quality on AlphoGen TTS. */
  mouthSync: number;
  /** 1..5: keeps the same face/identity across the clip. */
  identityStability: number;
  /** 1..5: lack of glitches, warping, blur, or frame artifacts. */
  visualQuality: number;
  /** Measured provider spend per output second, not marketing pricing. */
  costUsdPerSecond: number;
  /** End-to-end generation time divided by output duration. Lower is better. */
  latencySecondsPerOutputSecond: number;
  /** 1..5: server API, async polling/webhooks, reliable output URL. */
  apiFit: number;
  /** 1..5: same inputs can be cached/reused without paying again. */
  cacheFit: number;
  /** 1..5: consent/likeness policy fit for catalog + uploaded personas. */
  consentFit: number;
  /** 1..5: effort to integrate and operate. Lower is better. */
  integrationEffort: number;
}

export interface LipsyncProviderBenchmarkScore {
  id: string;
  label: string;
  score: number;
  verdict: LipsyncProviderVerdict;
  dimensions: {
    quality: number;
    cost: number;
    latency: number;
    operations: number;
    integration: number;
  };
  strengths: string[];
  risks: string[];
}

export const HEYGEN_BASELINE_BENCHMARK: LipsyncProviderBenchmarkInput = {
  id: "heygen",
  label: "HeyGen baseline",
  mouthSync: 4,
  identityStability: 4,
  visualQuality: 4,
  costUsdPerSecond: 0.04,
  latencySecondsPerOutputSecond: 28,
  apiFit: 4,
  cacheFit: 4,
  consentFit: 4,
  integrationEffort: 2,
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function oneToFive(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(1, Math.min(5, value));
}

function oneToFiveScore(value: number): number {
  return ((oneToFive(value) - 1) / 4) * 100;
}

function costScore(costUsdPerSecond: number): number {
  if (!Number.isFinite(costUsdPerSecond) || costUsdPerSecond < 0) return 0;
  if (costUsdPerSecond <= 0.02) return 100;
  if (costUsdPerSecond >= 0.12) return 0;
  return ((0.12 - costUsdPerSecond) / 0.1) * 100;
}

function latencyScore(latencySecondsPerOutputSecond: number): number {
  if (!Number.isFinite(latencySecondsPerOutputSecond) || latencySecondsPerOutputSecond <= 0) return 0;
  if (latencySecondsPerOutputSecond <= 10) return 100;
  if (latencySecondsPerOutputSecond >= 60) return 0;
  return ((60 - latencySecondsPerOutputSecond) / 50) * 100;
}

function verdictFor(input: LipsyncProviderBenchmarkInput, score: number): LipsyncProviderVerdict {
  if (
    input.apiFit < 2 ||
    input.cacheFit < 2 ||
    input.consentFit < 2 ||
    input.mouthSync < 3 ||
    input.identityStability < 3 ||
    input.costUsdPerSecond > 0.16
  ) {
    return "reject";
  }
  if (score >= 75) return "production_candidate";
  return "watchlist";
}

export function scoreLipsyncProvider(
  input: LipsyncProviderBenchmarkInput,
): LipsyncProviderBenchmarkScore {
  const quality = clampScore(
    oneToFiveScore(input.mouthSync) * 0.45 +
      oneToFiveScore(input.identityStability) * 0.35 +
      oneToFiveScore(input.visualQuality) * 0.2,
  );
  const cost = clampScore(costScore(input.costUsdPerSecond));
  const latency = clampScore(latencyScore(input.latencySecondsPerOutputSecond));
  const operations = clampScore(
    oneToFiveScore(input.apiFit) * 0.4 +
      oneToFiveScore(input.cacheFit) * 0.3 +
      oneToFiveScore(input.consentFit) * 0.3,
  );
  const integration = clampScore(100 - oneToFiveScore(input.integrationEffort));

  const score = Math.round(
    quality * 0.35 + cost * 0.2 + latency * 0.15 + operations * 0.2 + integration * 0.1,
  );

  const strengths: string[] = [];
  const risks: string[] = [];

  if (quality >= 75) strengths.push("strong visual and sync quality");
  else risks.push("quality still needs proof");

  if (cost >= 75) strengths.push("meaningfully cheaper than the current baseline");
  else if (cost <= 35) risks.push("cost is high for long-form podcasts");

  if (latency >= 70) strengths.push("fast enough for interactive workflows");
  else if (latency <= 35) risks.push("generation latency may frustrate users");

  if (operations >= 75) strengths.push("good API, cache, and consent fit");
  else risks.push("operational fit is not production-ready");

  if (integration >= 75) strengths.push("low integration effort");
  else if (integration <= 35) risks.push("integration effort is high");

  return {
    id: input.id,
    label: input.label,
    score,
    verdict: verdictFor(input, score),
    dimensions: {
      quality: Math.round(quality),
      cost: Math.round(cost),
      latency: Math.round(latency),
      operations: Math.round(operations),
      integration: Math.round(integration),
    },
    strengths,
    risks,
  };
}

export function compareLipsyncProviders(
  inputs: LipsyncProviderBenchmarkInput[],
): LipsyncProviderBenchmarkScore[] {
  return [...inputs]
    .map(scoreLipsyncProvider)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}
