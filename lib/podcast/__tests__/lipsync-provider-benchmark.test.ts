import { describe, expect, it } from "vitest";
import {
  compareLipsyncProviders,
  HEYGEN_BASELINE_BENCHMARK,
  LATENTSYNC_A10_BENCHMARK,
  MUSETALK_A10_BENCHMARK,
  PODCAST_LIPSYNC_BENCHMARK_MATRIX,
  projectedLipsyncCostUsd,
  scoreLipsyncProvider,
  type LipsyncProviderBenchmarkInput,
} from "../lipsync-provider-benchmark";

const strongCandidate: LipsyncProviderBenchmarkInput = {
  id: "candidate",
  label: "Candidate",
  mouthSync: 4.5,
  identityStability: 4.5,
  visualQuality: 4,
  costUsdPerSecond: 0.02,
  latencySecondsPerOutputSecond: 12,
  apiFit: 4,
  cacheFit: 4,
  consentFit: 4,
  integrationEffort: 2,
  evidence: {
    metricsSource: "measured",
    technicalPass: true,
    visualReview: "passed",
    sampleCount: 4,
    humanReviewedSampleCount: 4,
  },
};

describe("scoreLipsyncProvider", () => {
  it("keeps the proven baseline as a high-confidence production candidate", () => {
    const score = scoreLipsyncProvider(HEYGEN_BASELINE_BENCHMARK);
    expect(score.id).toBe("heygen");
    expect(score.verdict).toBe("production_candidate");
    expect(score.confidence).toBe("high");
    expect(score.dimensions.quality).toBeGreaterThanOrEqual(80);
  });

  it("rewards a provider with similar quality and lower cost/latency", () => {
    const baseline = scoreLipsyncProvider(HEYGEN_BASELINE_BENCHMARK);
    const candidate = scoreLipsyncProvider(strongCandidate);
    expect(candidate.score).toBeGreaterThan(baseline.score);
    expect(candidate.verdict).toBe("production_candidate");
    expect(candidate.strengths).toContain("meaningfully cheaper than the current baseline");
  });

  it("rejects providers without a real server API fit", () => {
    const score = scoreLipsyncProvider({ ...strongCandidate, id: "ui-only", apiFit: 1 });
    expect(score.verdict).toBe("reject");
    expect(score.risks).toContain("operational fit is not production-ready");
  });

  it("rejects providers with poor consent or likeness fit", () => {
    expect(scoreLipsyncProvider({ ...strongCandidate, id: "policy-risk", consentFit: 1 }).verdict).toBe("reject");
  });

  it("rejects weak mouth-sync even if pricing is attractive", () => {
    expect(scoreLipsyncProvider({
      ...strongCandidate,
      id: "cheap-but-bad",
      mouthSync: 2,
      costUsdPerSecond: 0.005,
    }).verdict).toBe("reject");
  });

  it("penalizes high integration effort", () => {
    const easy = scoreLipsyncProvider({ ...strongCandidate, integrationEffort: 1 });
    const hard = scoreLipsyncProvider({ ...strongCandidate, integrationEffort: 5 });
    expect(easy.score).toBeGreaterThan(hard.score);
    expect(hard.risks).toContain("integration effort is high");
  });

  it("keeps very expensive providers out of production even with good quality", () => {
    const score = scoreLipsyncProvider({ ...strongCandidate, id: "expensive", costUsdPerSecond: 0.2 });
    expect(score.verdict).toBe("reject");
    expect(score.risks).toContain("cost is high for long-form podcasts");
  });

  it("keeps a strong single-sample result on the watchlist", () => {
    const score = scoreLipsyncProvider({
      ...strongCandidate,
      evidence: { ...strongCandidate.evidence!, sampleCount: 1 },
    });
    expect(score.confidence).toBe("medium");
    expect(score.verdict).toBe("watchlist");
  });

  it("never promotes an unverified manual score to production", () => {
    const score = scoreLipsyncProvider({ ...strongCandidate, evidence: undefined });
    expect(score.confidence).toBe("low");
    expect(score.verdict).toBe("watchlist");
  });

  it("requires three moving human reviews even after multiple technical passes", () => {
    const score = scoreLipsyncProvider({
      ...strongCandidate,
      evidence: {
        ...strongCandidate.evidence!,
        sampleCount: 4,
        humanReviewedSampleCount: 1,
      },
    });
    expect(score.confidence).toBe("medium");
    expect(score.verdict).toBe("watchlist");
  });
});

describe("compareLipsyncProviders", () => {
  it("sorts providers by descending score", () => {
    const weak: LipsyncProviderBenchmarkInput = {
      id: "weak",
      label: "Weak",
      mouthSync: 3,
      identityStability: 3,
      visualQuality: 3,
      costUsdPerSecond: 0.1,
      latencySecondsPerOutputSecond: 50,
      apiFit: 3,
      cacheFit: 3,
      consentFit: 3,
      integrationEffort: 4,
      evidence: {
        metricsSource: "measured",
        technicalPass: true,
        visualReview: "passed",
        sampleCount: 3,
      },
    };

    const results = compareLipsyncProviders([weak, HEYGEN_BASELINE_BENCHMARK, strongCandidate]);
    expect(results.map((result) => result.id)).toEqual(["candidate", "heygen", "weak"]);
  });
});

describe("measured provider matrix", () => {
  it("keeps the baseline in production and LatentSync on the watchlist", () => {
    const results = compareLipsyncProviders(PODCAST_LIPSYNC_BENCHMARK_MATRIX);
    expect(results.find((row) => row.id === HEYGEN_BASELINE_BENCHMARK.id)).toMatchObject({
      verdict: "production_candidate",
      confidence: "high",
    });
    expect(results.find((row) => row.id === LATENTSYNC_A10_BENCHMARK.id)).toMatchObject({
      verdict: "watchlist",
      confidence: "high",
    });
    expect(results.find((row) => row.id === MUSETALK_A10_BENCHMARK.id)).toMatchObject({
      verdict: "reject",
      confidence: "low",
    });
  });

  it("captures LatentSync's measured cost advantage without hiding its latency", () => {
    expect(LATENTSYNC_A10_BENCHMARK.costUsdPerSecond).toBeLessThan(HEYGEN_BASELINE_BENCHMARK.costUsdPerSecond / 2);
    expect(LATENTSYNC_A10_BENCHMARK.latencySecondsPerOutputSecond).toBeGreaterThan(
      HEYGEN_BASELINE_BENCHMARK.latencySecondsPerOutputSecond,
    );
  });

  it("projects comparable costs for 10 and 45 minute active-speaker output", () => {
    expect(projectedLipsyncCostUsd(HEYGEN_BASELINE_BENCHMARK, 600)).toBe(24);
    expect(projectedLipsyncCostUsd(HEYGEN_BASELINE_BENCHMARK, 2700)).toBe(108);
    expect(projectedLipsyncCostUsd(LATENTSYNC_A10_BENCHMARK, 600)).toBeCloseTo(7.33, 1);
  });
});
