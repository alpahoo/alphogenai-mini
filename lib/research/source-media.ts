/**
 * Research Source Media — pure, deterministic helpers (no network).
 *
 * Normalizes the raw `media_candidates` returned by the extraction gateway into
 * typed, de-duplicated, icon-filtered candidates ready to persist as
 * `research_source_media` rows. No download happens here — these are metadata
 * only (candidate URLs). Rights default to 'unverified' (user must confirm on
 * selection). No provider names, no private media.
 */

export type MediaKind =
  | 'og_image'
  | 'twitter_image'
  | 'inline_image'
  | 'page_screenshot'
  | 'video_thumbnail'
  | 'logo'
  | 'doc_capture';

export type RightsStatus = 'unverified' | 'user_confirmed';

export interface RawMediaCandidate {
  url?: unknown;
  kind?: unknown;
  width?: unknown;
  height?: unknown;
  mime?: unknown;
}

export interface NormalizedMediaCandidate {
  source_url: string;
  kind: MediaKind;
  width: number | null;
  height: number | null;
  mime: string | null;
  rights_status: RightsStatus; // always 'unverified' from collection
  selected: boolean; // always false from collection
  risk_note: string;
}

const KINDS: MediaKind[] = [
  'og_image',
  'twitter_image',
  'inline_image',
  'page_screenshot',
  'video_thumbnail',
  'logo',
  'doc_capture',
];

const MIN_DIMENSION = 200; // px: drop images known to be smaller (icons/spacers)
const MAX_CANDIDATES = 12;
const RIGHTS_NOTE = 'Third-party media — verify usage rights before publishing.';

// Hero/primary kinds rank first; inline images last.
const KIND_PRIORITY: Record<MediaKind, number> = {
  og_image: 0,
  twitter_image: 1,
  page_screenshot: 2,
  video_thumbnail: 3,
  doc_capture: 4,
  logo: 5,
  inline_image: 6,
};

const ICON_HINTS = [
  'favicon',
  'sprite',
  'spacer',
  'pixel',
  '1x1',
  'blank',
  'icon-',
  '/icons/',
  'apple-touch-icon',
];

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Normalize a free-form kind string to the controlled vocabulary. */
export function classifyMediaKind(value: unknown): MediaKind {
  const v = str(value).toLowerCase().replace(/[\s-]+/g, '_');
  return (KINDS as string[]).includes(v) ? (v as MediaKind) : 'inline_image';
}

/** Heuristic: likely an icon/spacer/decorative asset (not a usable reference). */
export function isLikelyIcon(url: string, width: number | null, height: number | null): boolean {
  const lower = url.toLowerCase();
  if (lower.startsWith('data:')) return true;
  if (ICON_HINTS.some((h) => lower.includes(h))) return true;
  // If both dimensions are known and small, treat as icon/spacer.
  if (width !== null && height !== null && width < MIN_DIMENSION && height < MIN_DIMENSION) {
    return true;
  }
  return false;
}

/** Derive a stable thumbnail URL from a YouTube source URL, else null. */
export function deriveVideoThumbnail(sourceUrl: string): string | null {
  let id = '';
  try {
    const u = new URL(sourceUrl);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      id = u.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host.endsWith('youtube.com')) {
      if (u.pathname === '/watch') {
        id = u.searchParams.get('v') || '';
      } else {
        const parts = u.pathname.split('/').filter(Boolean); // shorts/<id>, embed/<id>
        if (parts[0] === 'shorts' || parts[0] === 'embed') id = parts[1] || '';
      }
    }
  } catch {
    return null;
  }
  if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return null;
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/**
 * Normalize raw gateway media candidates: validate URLs, classify kind, drop
 * icons/spacers, dedupe by URL, rank, and cap. Output is metadata only.
 */
export function normalizeMediaCandidates(raw: unknown): NormalizedMediaCandidate[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: NormalizedMediaCandidate[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const c = item as RawMediaCandidate;

    const url = str(c.url);
    if (!isHttpUrl(url)) continue;

    const width = num(c.width);
    const height = num(c.height);
    if (isLikelyIcon(url, width, height)) continue;

    if (seen.has(url)) continue;
    seen.add(url);

    out.push({
      source_url: url,
      kind: classifyMediaKind(c.kind),
      width,
      height,
      mime: str(c.mime) || null,
      rights_status: 'unverified',
      selected: false,
      risk_note: RIGHTS_NOTE,
    });
  }

  out.sort((a, b) => {
    const pk = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    if (pk !== 0) return pk;
    const areaA = (a.width ?? 0) * (a.height ?? 0);
    const areaB = (b.width ?? 0) * (b.height ?? 0);
    return areaB - areaA;
  });

  return out.slice(0, MAX_CANDIDATES);
}
