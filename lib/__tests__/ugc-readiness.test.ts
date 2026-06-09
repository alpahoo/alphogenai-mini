import { describe, expect, it } from "vitest";
import { computeUGCReadiness, type UGCReadinessInput } from "@/lib/ugc-readiness";

const FORBIDDEN_RE = /byteplus|atlascloud|evolink|bailian|kie\.?ai|heygen/i;

function input(overrides: Partial<UGCReadinessInput> = {}): UGCReadinessInput {
  return {
    hasProductReference: true,
    hasOutfitReference: false,
    angle: "product_demo",
    creator: "none",
    ...overrides,
  };
}

describe("computeUGCReadiness", () => {
  it("marks product-first UGC as ready", () => {
    const readiness = computeUGCReadiness(input());

    expect(readiness.status).toBe("ready");
    expect(readiness.tone).toBe("good");
    expect(readiness.label).toBe("Ready");
  });

  it("flags missing product references", () => {
    const readiness = computeUGCReadiness(input({ hasProductReference: false }));

    expect(readiness.status).toBe("missing_product");
    expect(readiness.tone).toBe("risky");
    expect(readiness.detail).toContain("product image");
  });

  it("distinguishes style-only plans from product UGC", () => {
    const readiness = computeUGCReadiness(input({
      hasProductReference: false,
      hasOutfitReference: true,
    }));

    expect(readiness.status).toBe("style_only");
    expect(readiness.label).toBe("Style-only");
  });

  it("flags selected creator identities that are not available", () => {
    const face = computeUGCReadiness(input({ creator: "verified_face", hasVerifiedFace: false }));
    const look = computeUGCReadiness(input({ creator: "saved_look", hasSavedLook: false }));
    const avatar = computeUGCReadiness(input({ creator: "avatar", hasAvatar: false }));

    expect(face.status).toBe("needs_verified_identity");
    expect(look.status).toBe("needs_verified_identity");
    expect(avatar.status).toBe("needs_verified_identity");
  });

  it("uses best-effort copy for outfit or try-on workflows", () => {
    const outfit = computeUGCReadiness(input({ hasOutfitReference: true }));
    const tryOn = computeUGCReadiness(input({ angle: "try_on" }));

    expect(outfit.status).toBe("best_effort");
    expect(tryOn.status).toBe("best_effort");
    expect(outfit.detail).toContain("exact try-on is not guaranteed");
  });

  it("keeps public readiness copy provider-neutral", () => {
    const variants = [
      input(),
      input({ hasProductReference: false }),
      input({ hasProductReference: false, hasOutfitReference: true }),
      input({ creator: "verified_face", hasVerifiedFace: false }),
      input({ angle: "try_on", hasOutfitReference: true }),
    ];

    for (const variant of variants) {
      const readiness = computeUGCReadiness(variant);
      const publicText = [
        readiness.status,
        readiness.label,
        readiness.detail,
        readiness.tone,
        ...readiness.checks.flatMap((check) => [check.label, String(check.ok)]),
      ].join("\n");
      expect(FORBIDDEN_RE.test(publicText), publicText).toBe(false);
    }
  });
});
