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
  imageUrls: string[];
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

function productJsonLdImages(html: string) {
  const images: string[] = [];
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  const visit = (value: unknown, inProduct = false): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, inProduct));
      return;
    }
    const record = value as Record<string, unknown>;
    const rawType = record["@type"];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    const isProduct =
      inProduct
      || types.some((type) => typeof type === "string" && type.toLowerCase() === "product");
    if (isProduct) {
      const rawImages = Array.isArray(record.image) ? record.image : [record.image];
      rawImages.forEach((image) => {
        if (typeof image === "string") images.push(decodeHtml(image));
        else if (image && typeof image === "object") {
          const imageUrl = (image as Record<string, unknown>).url;
          if (typeof imageUrl === "string") images.push(decodeHtml(imageUrl));
        }
      });
    }
    Object.values(record).forEach((child) => visit(child, isProduct));
  };

  for (const match of scripts) {
    try {
      visit(JSON.parse(match[1]));
    } catch {
      // Malformed analytics or JSON-LD blocks do not make the page unusable.
    }
  }
  return images;
}

function productHtmlImages(html: string) {
  const images: string[] = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src =
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]
      || tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1];
    if (!src || src.startsWith("data:")) continue;
    const lower = `${src} ${tag}`.toLowerCase();
    if (/(logo|icon|sprite|avatar|tracking|pixel)/.test(lower)) continue;
    const width = Number(tag.match(/\bwidth=["']?(\d+)/i)?.[1] ?? 0);
    const height = Number(tag.match(/\bheight=["']?(\d+)/i)?.[1] ?? 0);
    const hasUsefulAlt = /\balt=["'][^"']{4,}["']/i.test(tag);
    if ((width >= 300 && height >= 300) || hasUsefulAlt) images.push(decodeHtml(src));
  }
  return images;
}

function resolveProductImages(candidates: string[], baseUrl: string, limit = 4) {
  const resolved: string[] = [];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate, baseUrl);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      const value = url.toString();
      if (!resolved.includes(value)) resolved.push(value);
      if (resolved.length >= limit) break;
    } catch {
      // Ignore invalid image candidates.
    }
  }
  return resolved;
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
    const imageUrls = resolveProductImages(
      [
        metaContent(html, "og:image"),
        metaContent(html, "og:image:secure_url"),
        metaContent(html, "twitter:image"),
        ...productJsonLdImages(html),
        ...productHtmlImages(html),
      ].filter(Boolean),
      response.url || url,
    );
    return {
      title: title.slice(0, 160),
      description: description.slice(0, 500),
      imageUrl: imageUrls[0] ?? null,
      imageUrls,
      hostname: parsed.hostname.replace(/^www\./, ""),
    };
  } catch {
    return {
      title: fallbackTitle,
      description: "",
      imageUrl: null,
      imageUrls: [],
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
