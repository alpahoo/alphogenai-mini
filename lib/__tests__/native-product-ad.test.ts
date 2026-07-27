import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NATIVE_PRODUCT_AD_MAX_WORDS,
  normalizeNativeProductAdScript,
  readProductPageBrief,
} from "@/lib/native-product-ad";
import {
  DEFAULT_NATIVE_PRODUCT_AD_VOICE,
  isNativeProductAdVoice,
} from "@/lib/native-product-ad-voices";

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("collects and deduplicates useful product media in priority order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          `
            <meta property="og:title" content="Power Product">
            <meta property="og:image" content="/hero.jpg">
            <meta name="twitter:image" content="/hero.jpg">
            <script type="application/ld+json">
              {"@type":"Product","image":["/detail-1.jpg",{"url":"/detail-2.jpg"}]}
            </script>
            <img src="/logo.svg" alt="Company logo" width="500" height="500">
            <img src="/lifestyle.jpg" alt="Product in use" width="900" height="900">
          `,
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        ),
      ),
    );

    const brief = await readProductPageBrief("https://shop.example/products/demo");

    expect(brief.imageUrls).toEqual([
      "https://shop.example/hero.jpg",
      "https://shop.example/detail-1.jpg",
      "https://shop.example/detail-2.jpg",
      "https://shop.example/lifestyle.jpg",
    ]);
    expect(brief.imageUrl).toBe(brief.imageUrls[0]);
  });

  it("keeps the native voice allow-list explicit", () => {
    expect(DEFAULT_NATIVE_PRODUCT_AD_VOICE).toBe("antoni");
    expect(isNativeProductAdVoice("bella")).toBe(true);
    expect(isNativeProductAdVoice("provider-secret-voice")).toBe(false);
  });
});
