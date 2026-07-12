export type LipsyncProviderVerdict = "production_candidate" | "watchlist" | "reject";
export type LipsyncBenchmarkConfidence = "high" | "medium" | "low";
export type LipsyncBenchmarkMetricsSource = "measured" | "estimated" | "screened";
export type LipsyncBenchmarkVisualReview = "passed" | "pending" | "failed";

export interface LipsyncProviderBenchmarkEvidence {
  metricsSource: LipsyncBenchmarkMetricsSource;
  technicalPass: boolean;
  visualReview: LipsyncBenchmarkVisualReview;
  sampleCount: number;
  /** Samples reviewed as moving audio/video by a human, not only probed or frame-checked. */
  humanReviewedSampleCount?: number;
  measuredAt?: string;
  note?: string;
}

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
  /** Missing evidence is treated as unverified, never production-ready. */
  evidence?: LipsyncProviderBenchmarkEvidence;
}

export interface LipsyncProviderBenchmarkScore {
  id: string;
  label: string;
  score: number;
  verdict: LipsyncProviderVerdict;
  confidence: LipsyncBenchmarkConfidence;
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
  mouthSync: 4.5,
  identityStability: 4.5,
  visualQuality: 4.5,
  costUsdPerSecond: 0.04,
  latencySecondsPerOutputSecond: 28,
  apiFit: 5,
  cacheFit: 5,
  consentFit: 4,
  integrationEffort: 2,
  evidence: {
    metricsSource: "measured",
    technicalPass: true,
    visualReview: "passed",
    sampleCount: 9,
    humanReviewedSampleCount: 9,
    measuredAt: "2026-07-10",
    note: "Full eight-line podcast QA plus same-input one-clip comparison.",
  },
};

export const MODAL_A10_GPU_USD_PER_SECOND = 0.000306;
export const LATENTSYNC_MEASURED_OUTPUT_SECONDS = 14.56;
export const LATENTSYNC_MEASURED_ELAPSED_SECONDS = 581.32;
export const LATENTSYNC_MEASURED_USD_PER_OUTPUT_SECOND =
  (LATENTSYNC_MEASURED_ELAPSED_SECONDS * MODAL_A10_GPU_USD_PER_SECOND) /
  LATENTSYNC_MEASURED_OUTPUT_SECONDS;

export const LATENTSYNC_A10_BENCHMARK: LipsyncProviderBenchmarkInput = {
  id: "latentsync-modal-a10",
  label: "LatentSync on Modal A10",
  mouthSync: 4,
  identityStability: 4,
  visualQuality: 4,
  costUsdPerSecond: LATENTSYNC_MEASURED_USD_PER_OUTPUT_SECOND,
  latencySecondsPerOutputSecond:
    LATENTSYNC_MEASURED_ELAPSED_SECONDS / LATENTSYNC_MEASURED_OUTPUT_SECONDS,
  apiFit: 2,
  cacheFit: 4,
  consentFit: 4,
  integrationEffort: 5,
  evidence: {
    metricsSource: "measured",
    technicalPass: true,
    visualReview: "passed",
    sampleCount: 4,
    humanReviewedSampleCount: 4,
    measuredAt: "2026-07-12",
    note: "Four technical and moving human-review passes across two personas and varied durations. HeyGen remains slightly ahead on quality.",
  },
};

export const MUSETALK_A10_BENCHMARK: LipsyncProviderBenchmarkInput = {
  id: "musetalk-modal-a10",
  label: "MuseTalk on Modal A10",
  mouthSync: 1,
  identityStability: 1,
  visualQuality: 1,
  costUsdPerSecond: 0,
  latencySecondsPerOutputSecond: 60,
  apiFit: 1,
  cacheFit: 3,
  consentFit: 4,
  integrationEffort: 5,
  evidence: {
    metricsSource: "measured",
    technicalPass: false,
    visualReview: "pending",
    sampleCount: 0,
    humanReviewedSampleCount: 0,
    measuredAt: "2026-07-09",
    note: "Packaging/runtime failure before MP4 output; no visual quality score is available.",
  },
};

export const PODCAST_LIPSYNC_BENCHMARK_MATRIX = [
  HEYGEN_BASELINE_BENCHMARK,
  LATENTSYNC_A10_BENCHMARK,
  MUSETALK_A10_BENCHMARK,
] as const;

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

function confidenceFor(input: LipsyncProviderBenchmarkInput): LipsyncBenchmarkConfidence {
  const evidence = input.evidence;
  if (!evidence?.technicalPass || evidence.visualReview === "failed") return "low";
  if (
    evidence.metricsSource === "measured" &&
    evidence.visualReview === "passed" &&
    evidence.sampleCount >= 3 &&
    (evidence.humanReviewedSampleCount ?? 0) >= 3
  ) return "high";
  if (evidence.metricsSource === "measured" && evidence.visualReview === "passed") return "medium";
  return "low";
}

function verdictFor(
  input: LipsyncProviderBenchmarkInput,
  score: number,
  confidence: LipsyncBenchmarkConfidence,
): LipsyncProviderVerdict {
  if (input.evidence?.technicalPass === false || input.evidence?.visualReview === "failed") return "reject";
  if (
    input.apiFit < 2 ||
    input.cacheFit < 2 ||
    input.consentFit < 2 ||
    input.mouthSync < 3 ||
    input.identityStability < 3 ||
    input.costUsdPerSecond > 0.16
  ) return "reject";
  if (score >= 75 && confidence === "high") return "production_candidate";
  return "watchlist";
}

export function scoreLipsyncProvider(input: LipsyncProviderBenchmarkInput): LipsyncProviderBenchmarkScore {
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
  const confidence = confidenceFor(input);
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
  if (confidence === "low") risks.push("evidence is not sufficient for production routing");
  else if (confidence === "medium") risks.push("more same-input samples are required before production routing");

  return {
    id: input.id,
    label: input.label,
    score,
    verdict: verdictFor(input, score, confidence),
    confidence,
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
  inputs: readonly LipsyncProviderBenchmarkInput[],
): LipsyncProviderBenchmarkScore[] {
  return [...inputs]
    .map(scoreLipsyncProvider)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

export function projectedLipsyncCostUsd(
  input: Pick<LipsyncProviderBenchmarkInput, "costUsdPerSecond">,
  outputSeconds: number,
): number {
  if (!Number.isFinite(outputSeconds) || outputSeconds <= 0) return 0;
  return Math.round(input.costUsdPerSecond * outputSeconds * 100) / 100;
}
