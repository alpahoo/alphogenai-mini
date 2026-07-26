import { callEvoLinkLLM } from "@/lib/evolink-client";

export const NATIVE_PRODUCT_AD_ENGINE = "native_product_ad";
export const NATIVE_PRODUCT_AD_SECONDS = 8;
export const NATIVE_PRODUCT_AD_MAX_WORDS = 17;

export type NativeProductAdFormat = "portrait" | "square" | "landscape";
export type NativeProductAdLanguage = "french" | "english";
export type NativeProductAdStyle = "Discovery" | "Storytime";

export interface ProductPageBrief {
  title: string;
  description: string;
  imageUrl: string | null;
  hostname: string;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

export function normalizeNativeProductAdScript(
  raw: string,
  language: NativeProductAdLanguage,
) {
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^(script|voiceover|copy)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, NATIVE_PRODUCT_AD_MAX_WORDS);
  if (!words.length) {
    return language === "french"
      ? "Découvrez ce produit et rendez votre quotidien plus simple dès aujourd'hui."
      : "Discover this product and make your everyday routine simpler today.";
  }
  let result = words.join(" ");
  if (!/[.!?]$/.test(result)) result += ".";
  return result;
}

export async function readProductPageBrief(url: string): Promise<ProductPageBrief> {
  const parsed = new URL(url);
  const fallbackTitle = parsed.hostname.replace(/^www\./, "").split(".")[0] || "Product";
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AlphoGenProductPreview/1.0; +https://www.alphogen.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`page ${response.status}`);
    const html = (await response.text()).slice(0, 1_500_000);
    const title =
      metaContent(html, "og:title")
      || decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
      || fallbackTitle;
    const description =
      metaContent(html, "og:description")
      || metaContent(html, "description")
      || "";
    const rawImage = metaContent(html, "og:image") || metaContent(html, "twitter:image");
    let imageUrl: string | null = null;
    if (rawImage) {
      try {
        imageUrl = new URL(rawImage, response.url || url).toString();
      } catch {
        imageUrl = null;
      }
    }
    return {
      title: title.slice(0, 160),
      description: description.slice(0, 500),
      imageUrl,
      hostname: parsed.hostname.replace(/^www\./, ""),
    };
  } catch {
    return {
      title: fallbackTitle,
      description: "",
      imageUrl: null,
      hostname: parsed.hostname.replace(/^www\./, ""),
    };
  }
}

export async function writeNativeProductAdScript(input: {
  brief: ProductPageBrief;
  language: NativeProductAdLanguage;
  style: NativeProductAdStyle;
}) {
  const fallback =
    input.language === "french"
      ? `Découvrez ${input.brief.title}, pensé pour simplifier votre quotidien.`
      : `Meet ${input.brief.title}, designed to make your everyday routine simpler.`;
  try {
    const language = input.language === "french" ? "French from France" : "natural English";
    const result = await callEvoLinkLLM(
      [
        "Write one spoken product-ad line.",
        `Use ${language}.`,
        `Maximum ${NATIVE_PRODUCT_AD_MAX_WORDS} words.`,
        "Use only the supplied facts. No prices, statistics, or claims unless supplied.",
        "Return only the spoken sentence, without labels or quotation marks.",
      ].join(" "),
      [
        `Style: ${input.style}.`,
        `Product: ${input.brief.title}.`,
        input.brief.description ? `Description: ${input.brief.description}.` : "",
      ].filter(Boolean).join("\n"),
    );
    return normalizeNativeProductAdScript(result, input.language);
  } catch {
    return normalizeNativeProductAdScript(fallback, input.language);
  }
}
