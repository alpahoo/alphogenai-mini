/**
 * Research discovery adapter
 * Queries SearXNG for candidate sources, normalizes results
 */

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  engine: string;
  category?: string;
}

export interface NormalizedSource {
  url: string;
  title: string;
  source_type: 'official' | 'media' | 'forum' | 'youtube' | 'github' | 'docs' | 'product' | 'unknown';
  credibility_score: number;
}

/**
 * Classify source type by simple heuristics
 */
export function classifySourceType(
  url: string,
  category?: string,
): NormalizedSource['source_type'] {
  const urlLower = url.toLowerCase();

  if (urlLower.includes('github.com') || urlLower.includes('gitlab.com')) {
    return 'github';
  }

  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return 'youtube';
  }

  if (urlLower.includes('reddit.com')) {
    return 'forum';
  }

  if (category === 'news') {
    return 'media';
  }

  if (urlLower.includes('/docs') || urlLower.includes('/documentation')) {
    return 'docs';
  }

  if (category === 'official') {
    return 'official';
  }

  return 'unknown';
}

/**
 * Normalize SearXNG result to research_source shape
 */
export function normalizeSearxngResult(result: SearchResult): NormalizedSource {
  return {
    url: result.url,
    title: result.title,
    source_type: classifySourceType(result.url, result.category),
    credibility_score: 0.5, // V1: default, no computation
  };
}

/**
 * Deduplicate sources by URL (per job context)
 * Returns unique sources only
 */
export function deduplicateByUrl(sources: NormalizedSource[]): NormalizedSource[] {
  const seen = new Set<string>();
  const unique: NormalizedSource[] = [];

  for (const source of sources) {
    if (!seen.has(source.url)) {
      seen.add(source.url);
      unique.push(source);
    }
  }

  return unique;
}

/**
 * Query SearXNG via gateway
 * Timeout controlled, returns raw results
 */
export async function querySearxng(
  topic: string,
  inputUrl: string | null,
  timeoutMs: number = 30000,
): Promise<SearchResult[]> {
  const gatewayUrl = process.env.RESEARCH_SEARXNG_GATEWAY_URL;
  const serviceToken = process.env.RESEARCH_SEARXNG_SERVICE_TOKEN;

  if (!gatewayUrl || !serviceToken) {
    throw new Error('SearXNG gateway not configured');
  }

  // Build query
  const query = inputUrl ? `${topic} site:${new URL(inputUrl).hostname}` : topic;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${gatewayUrl}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({
        q: query,
        engines: ['google', 'duckduckgo', 'bing'],
        pageno: 1,
        format: 'json',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`SearXNG gateway error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.results)) {
      throw new Error('Invalid SearXNG response: missing results array');
    }

    // Limit to 50 results per spec
    return data.results.slice(0, 50);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`SearXNG query timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Discover sources for a research job
 * Queries SearXNG, normalizes, dedupes, returns candidates
 */
export async function discoverSources(
  topic: string,
  inputUrl: string | null,
  timeoutMs?: number,
): Promise<NormalizedSource[]> {
  const rawResults = await querySearxng(topic, inputUrl, timeoutMs);

  if (rawResults.length === 0) {
    return [];
  }

  const normalized = rawResults.map(normalizeSearxngResult);
  const deduped = deduplicateByUrl(normalized);

  return deduped;
}
