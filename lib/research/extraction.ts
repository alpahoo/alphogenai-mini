/**
 * Research extraction adapter
 * Extracts Markdown content from URLs via Crawl4AI
 */
import { normalizeMediaCandidates, type NormalizedMediaCandidate } from './source-media';

export type ExtractionStatus = 'pending' | 'success' | 'failed' | 'timeout' | 'blocked';

export interface ExtractionResult {
  success: boolean;
  markdown: string | null;
  char_count: number;
  extraction_time_ms: number;
  error: string | null;
  media_candidates?: unknown;
}

export interface NormalizedExtraction {
  extracted_markdown: string | null;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  extraction_time_ms: number;
  media_candidates: NormalizedMediaCandidate[];
}

const MAX_MARKDOWN_BYTES = 50 * 1024; // 50 KB

/**
 * Call Crawl4AI gateway to extract Markdown from URL
 */
export async function callCrawl4AI(
  url: string,
  timeoutMs: number = 15000,
): Promise<ExtractionResult> {
  const gatewayUrl = process.env.RESEARCH_CRAWL4AI_GATEWAY_URL;
  const serviceToken = process.env.RESEARCH_CRAWL4AI_SERVICE_TOKEN;

  if (!gatewayUrl || !serviceToken) {
    throw new Error('Crawl4AI gateway not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startTime = Date.now();
    const response = await fetch(`${gatewayUrl}/api/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({
        url,
        timeout_ms: timeoutMs,
        format: 'markdown',
      }),
      signal: controller.signal,
    });

    const extraction_time_ms = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`Crawl4AI gateway error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as ExtractionResult;
    data.extraction_time_ms = extraction_time_ms;

    return data;
  } catch (err) {
    const extraction_time_ms = timeoutMs;
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        success: false,
        markdown: null,
        char_count: 0,
        extraction_time_ms,
        error: `timeout after ${timeoutMs}ms`,
      };
    }

    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      markdown: null,
      char_count: 0,
      extraction_time_ms,
      error: errMsg,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Map Crawl4AI error message to extraction status
 * Maps parsing_error and error to 'failed' (per T-1101 migration constraints)
 */
export function mapErrorToStatus(errorMessage: string): ExtractionStatus {
  const msg = errorMessage.toLowerCase();

  if (msg.includes('timeout')) {
    return 'timeout';
  }
  if (msg.includes('forbidden') || msg.includes('429') || msg.includes('blocked')) {
    return 'blocked';
  }

  // Map parsing_error and other errors to 'failed'
  return 'failed';
}

/**
 * Normalize Crawl4AI result to research_sources shape
 */
export function normalizeExtraction(result: ExtractionResult): NormalizedExtraction {
  const media_candidates = normalizeMediaCandidates(result.media_candidates);

  if (result.success && result.markdown) {
    const markdown = truncateMarkdown(result.markdown);
    return {
      extracted_markdown: markdown,
      extraction_status: 'success',
      extraction_error: null,
      extraction_time_ms: result.extraction_time_ms,
      media_candidates,
    };
  }

  return {
    extracted_markdown: null,
    extraction_status: mapErrorToStatus(result.error || 'unknown error'),
    extraction_error: result.error,
    extraction_time_ms: result.extraction_time_ms,
    media_candidates,
  };
}

/**
 * Truncate Markdown to max 50 KB
 * Preserves as much content as possible
 */
export function truncateMarkdown(markdown: string): string {
  const bytes = new TextEncoder().encode(markdown);

  if (bytes.length <= MAX_MARKDOWN_BYTES) {
    return markdown;
  }

  // Truncate to max bytes
  const truncated = new TextDecoder().decode(bytes.slice(0, MAX_MARKDOWN_BYTES));

  // Remove incomplete trailing content (last line or partial word)
  const lastNewline = truncated.lastIndexOf('\n');
  if (lastNewline > 0) {
    return truncated.slice(0, lastNewline);
  }

  return truncated;
}

/**
 * Extract content from a single source
 * Returns normalized extraction data
 */
export async function extractSource(
  url: string,
  timeoutMs: number = 15000,
): Promise<NormalizedExtraction> {
  try {
    const result = await callCrawl4AI(url, timeoutMs);
    return normalizeExtraction(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    return {
      extracted_markdown: null,
      extraction_status: 'failed',
      extraction_error: errMsg,
      extraction_time_ms: 0,
      media_candidates: [],
    };
  }
}
