import { describe, expect, it } from "vitest";
import {
  NATIVE_PRESENTER_RETENTION_CONSENT_VERSION,
  canStartNativePresenterNormalization,
  nativePresenterNormalizedPath,
  wantsNativePresenterBase,
} from "@/lib/video-presenter-native";

describe("native video presenter retention", () => {
  it("does not retain footage by default", () => {
    expect(wantsNativePresenterBase({})).toEqual({
      requested: false,
      error: null,
    });
  });

  it("requires a distinct retention confirmation", () => {
    expect(wantsNativePresenterBase({
      retainForNative: true,
      nativeRetentionConsent: false,
    })).toEqual({
      requested: true,
      error: expect.stringMatching(/separate retention permission/i),
    });
  });

  it("accepts explicit native retention consent", () => {
    expect(wantsNativePresenterBase({
      retainForNative: true,
      nativeRetentionConsent: true,
    })).toEqual({
      requested: true,
      error: null,
    });
    expect(NATIVE_PRESENTER_RETENTION_CONSENT_VERSION).toMatch(/^v1-/);
  });

  it("only starts normalization from uploaded or failed", () => {
    expect(canStartNativePresenterNormalization("uploaded")).toBe(true);
    expect(canStartNativePresenterNormalization("failed")).toBe(true);
    expect(canStartNativePresenterNormalization("normalizing")).toBe(false);
    expect(canStartNativePresenterNormalization("ready")).toBe(false);
  });

  it("builds a deterministic private normalized path", () => {
    expect(nativePresenterNormalizedPath("user-1", "base-1"))
      .toBe("user-1/base-1/normalized-v1.mp4");
  });
});
