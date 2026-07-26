import { describe, expect, it } from "vitest";

import {
  NATIVE_PRODUCT_AD_MAX_WORDS,
  normalizeNativeProductAdScript,
} from "@/lib/native-product-ad";

describe("native product ad", () => {
  it("normalizes an LLM response and caps spoken words", () => {
    const value = normalizeNativeProductAdScript(
      `"Script: This is a deliberately long product sentence that should never exceed the native animation duration budget today"`,
      "english",
    );
    expect(value.split(/\s+/)).toHaveLength(NATIVE_PRODUCT_AD_MAX_WORDS);
    expect(value).toMatch(/\.$/);
    expect(value).not.toContain("Script:");
  });

  it("returns a localized fallback for empty output", () => {
    expect(normalizeNativeProductAdScript("", "french")).toContain("Découvrez");
    expect(normalizeNativeProductAdScript("", "english")).toContain("Discover");
  });
});
