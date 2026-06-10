import { describe, it, expect } from 'vitest';
import { classifySourceType, deduplicateByUrl, normalizeSearxngResult } from '@/lib/research/discovery';

/**
 * Unit tests for discovery adapter
 * Route-level tests covered via integration testing
 */

describe('Discovery Adapter', () => {
  describe('classifySourceType', () => {
    it('should classify github URLs', () => {
      expect(classifySourceType('https://github.com/anthropics/claude')).toBe('github');
      expect(classifySourceType('https://gitlab.com/repo')).toBe('github');
    });

    it('should classify youtube URLs', () => {
      expect(classifySourceType('https://youtube.com/watch?v=123')).toBe('youtube');
      expect(classifySourceType('https://youtu.be/abc')).toBe('youtube');
    });

    it('should classify reddit as forum', () => {
      expect(classifySourceType('https://reddit.com/r/programming')).toBe('forum');
    });

    it('should classify by category', () => {
      expect(classifySourceType('https://news.example.com/article', 'news')).toBe('media');
      expect(classifySourceType('https://docs.example.com/guide', undefined)).toBe('docs');
    });

    it('should classify official by category', () => {
      expect(classifySourceType('https://example.com/announcement', 'official')).toBe('official');
    });

    it('should default to unknown', () => {
      expect(classifySourceType('https://random-site.com')).toBe('unknown');
    });
  });

  describe('normalizeSearxngResult', () => {
    it('should normalize a SearXNG result', () => {
      const result = {
        title: 'Test Article',
        url: 'https://github.com/repo',
        content: 'Some content',
        engine: 'google',
        category: undefined,
      };

      const normalized = normalizeSearxngResult(result);

      expect(normalized.url).toBe('https://github.com/repo');
      expect(normalized.title).toBe('Test Article');
      expect(normalized.source_type).toBe('github');
      expect(normalized.credibility_score).toBe(0.5);
    });
  });

  describe('deduplicateByUrl', () => {
    it('should remove duplicate URLs', () => {
      const sources = [
        {
          url: 'https://example.com/1',
          title: 'Article 1',
          source_type: 'media' as const,
          credibility_score: 0.5,
        },
        {
          url: 'https://example.com/1',
          title: 'Article 1 (duplicate)',
          source_type: 'media' as const,
          credibility_score: 0.6,
        },
        {
          url: 'https://github.com/repo',
          title: 'Repo',
          source_type: 'github' as const,
          credibility_score: 0.5,
        },
      ];

      const deduped = deduplicateByUrl(sources);

      expect(deduped).toHaveLength(2);
      expect(deduped[0].url).toBe('https://example.com/1');
      expect(deduped[1].url).toBe('https://github.com/repo');
    });

    it('should preserve order', () => {
      const sources = [
        {
          url: 'https://z.com',
          title: 'Z',
          source_type: 'unknown' as const,
          credibility_score: 0.5,
        },
        {
          url: 'https://a.com',
          title: 'A',
          source_type: 'unknown' as const,
          credibility_score: 0.5,
        },
      ];

      const deduped = deduplicateByUrl(sources);

      expect(deduped[0].url).toBe('https://z.com');
      expect(deduped[1].url).toBe('https://a.com');
    });

    it('should handle empty list', () => {
      expect(deduplicateByUrl([])).toHaveLength(0);
    });
  });
});
