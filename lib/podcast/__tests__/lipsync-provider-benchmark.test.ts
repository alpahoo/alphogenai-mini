import { describe, expect, it } from "vitest";
import {
  compareLipsyncProviders,
  HEYGEN_BASELINE_BENCHMARK,
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
};

describe("scoreLipsyncProvider", () => {
  it("scores the HeyGen baseline as a non-zero watchlist/production reference", () => {
    const score = scoreLipsyncProvider(HEYGEN_BASELINE_BENCHMARK);
    expect(score.id).toBe("heygen");
    expect(score.score).toBeGreaterThan(50);
    expect(score.verdict).not.toBe("reject");
    expect(score.dimensions.quality).toBeGreaterThanOrEqual(70);
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
    const score = scoreLipsyncProvider({ ...strongCandidate, id: "policy-risk", consentFit: 1 });
    expect(score.verdict).toBe("reject");
  });

  it("rejects weak mouth-sync even if pricing is attractive", () => {
    const score = scoreLipsyncProvider({
      ...strongCandidate,
      id: "cheap-but-bad",
      mouthSync: 2,
      costUsdPerSecond: 0.005,
    });
    expect(score.verdict).toBe("reject");
  });

  it("penalizes high integration effort", () => {
    const easy = scoreLipsyncProvider({ ...strongCandidate, integrationEffort: 1 });
    const hard = scoreLipsyncProvider({ ...strongCandidate, integrationEffort: 5 });
    expect(easy.score).toBeGreaterThan(hard.score);
    expect(hard.risks).toContain("integration effort is high");
  });

  it("keeps very expensive providers out of production even with good quality", () => {
    const score = scoreLipsyncProvider({
      ...strongCandidate,
      id: "expensive",
      costUsdPerSecond: 0.2,
    });
    expect(score.verdict).toBe("reject");
    expect(score.risks).toContain("cost is high for long-form podcasts");
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
    };

    const results = compareLipsyncProviders([weak, HEYGEN_BASELINE_BENCHMARK, strongCandidate]);
    expect(results.map((r) => r.id)).toEqual(["candidate", "heygen", "weak"]);
  });
});
