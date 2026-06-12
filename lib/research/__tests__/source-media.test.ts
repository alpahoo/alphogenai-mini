import { describe, it, expect } from 'vitest';
import {
  classifyMediaKind,
  isLikelyIcon,
  deriveVideoThumbnail,
  normalizeMediaCandidates,
} from '@/lib/research/source-media';

describe('classifyMediaKind', () => {
  it('keeps valid kinds and normalizes spacing/hyphens/case', () => {
    expect(classifyMediaKind('og_image')).toBe('og_image');
    expect(classifyMediaKind('Twitter-Image')).toBe('twitter_image');
    expect(classifyMediaKind('page screenshot')).toBe('page_screenshot');
    expect(classifyMediaKind('video_thumbnail')).toBe('video_thumbnail');
  });
  it('defaults unknown/missing to inline_image', () => {
    expect(classifyMediaKind('banner')).toBe('inline_image');
    expect(classifyMediaKind(undefined)).toBe('inline_image');
    expect(classifyMediaKind(123)).toBe('inline_image');
  });
});

describe('isLikelyIcon', () => {
  it('flags data URIs, icon hints, and tiny images', () => {
    expect(isLikelyIcon('data:image/png;base64,xxx', null, null)).toBe(true);
    expect(isLikelyIcon('https://x.com/favicon.ico', null, null)).toBe(true);
    expect(isLikelyIcon('https://x.com/sprite.png', null, null)).toBe(true);
    expect(isLikelyIcon('https://x.com/apple-touch-icon.png', null, null)).toBe(true);
    expect(isLikelyIcon('https://x.com/small.png', 32, 32)).toBe(true);
  });
  it('does not flag large hero images', () => {
    expect(isLikelyIcon('https://x.com/hero.jpg', 1200, 630)).toBe(false);
    expect(isLikelyIcon('https://x.com/photo.jpg', null, null)).toBe(false);
  });
});

describe('deriveVideoThumbnail', () => {
  it('derives thumbnails for youtube variants', () => {
    expect(deriveVideoThumbnail('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
    expect(deriveVideoThumbnail('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
    expect(deriveVideoThumbnail('https://www.youtube.com/shorts/abc123XYZ')).toBe(
      'https://img.youtube.com/vi/abc123XYZ/hqdefault.jpg',
    );
    expect(deriveVideoThumbnail('https://www.youtube.com/embed/abc123XYZ')).toBe(
      'https://img.youtube.com/vi/abc123XYZ/hqdefault.jpg',
    );
  });
  it('returns null for non-youtube or invalid', () => {
    expect(deriveVideoThumbnail('https://vimeo.com/12345')).toBeNull();
    expect(deriveVideoThumbnail('https://www.youtube.com/watch?v=')).toBeNull();
    expect(deriveVideoThumbnail('not a url')).toBeNull();
  });
});

describe('normalizeMediaCandidates', () => {
  it('returns [] for non-array input', () => {
    expect(normalizeMediaCandidates(null)).toEqual([]);
    expect(normalizeMediaCandidates('x')).toEqual([]);
  });

  it('validates URLs, applies rights defaults, drops non-http', () => {
    const out = normalizeMediaCandidates([
      { url: 'https://x.com/a.jpg', kind: 'og_image', width: 1200, height: 630 },
      { url: 'ftp://x.com/b.jpg', kind: 'inline_image' },
      { url: 'not-a-url' },
      { foo: 'bar' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source_url: 'https://x.com/a.jpg',
      kind: 'og_image',
      rights_status: 'unverified',
      selected: false,
    });
    expect(out[0].risk_note).toMatch(/usage rights/i);
  });

  it('filters icons and dedupes by url', () => {
    const out = normalizeMediaCandidates([
      { url: 'https://x.com/favicon.ico', kind: 'inline_image' },
      { url: 'https://x.com/hero.jpg', kind: 'inline_image', width: 800, height: 600 },
      { url: 'https://x.com/hero.jpg', kind: 'inline_image', width: 800, height: 600 },
      { url: 'https://x.com/tiny.png', width: 16, height: 16 },
    ]);
    expect(out.map((c) => c.source_url)).toEqual(['https://x.com/hero.jpg']);
  });

  it('ranks hero kinds first, then by area', () => {
    const out = normalizeMediaCandidates([
      { url: 'https://x.com/inline-big.jpg', kind: 'inline_image', width: 1000, height: 1000 },
      { url: 'https://x.com/og.jpg', kind: 'og_image', width: 600, height: 400 },
      { url: 'https://x.com/inline-small.jpg', kind: 'inline_image', width: 400, height: 400 },
    ]);
    expect(out[0].kind).toBe('og_image');
    // within inline, bigger area first
    const inlineUrls = out.filter((c) => c.kind === 'inline_image').map((c) => c.source_url);
    expect(inlineUrls).toEqual(['https://x.com/inline-big.jpg', 'https://x.com/inline-small.jpg']);
  });

  it('caps the number of candidates', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      url: `https://x.com/img-${i}.jpg`,
      kind: 'inline_image',
      width: 500,
      height: 500,
    }));
    const out = normalizeMediaCandidates(many);
    expect(out.length).toBeLessThanOrEqual(12);
  });

  it('is deterministic and leaks no provider names', () => {
    const input = [{ url: 'https://x.com/a.jpg', kind: 'og_image', width: 1200, height: 630 }];
    const a = JSON.stringify(normalizeMediaCandidates(input));
    const b = JSON.stringify(normalizeMediaCandidates(input));
    expect(a).toBe(b);
    for (const name of ['groq', 'openai api', 'litellm', 'jina', 'anthropic', 'claude']) {
      expect(a.toLowerCase()).not.toContain(name);
    }
  });
});
