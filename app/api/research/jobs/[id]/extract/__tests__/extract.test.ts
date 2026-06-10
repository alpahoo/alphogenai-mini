import { describe, it, expect } from 'vitest';
import { truncateMarkdown, mapErrorToStatus, normalizeExtraction } from '@/lib/research/extraction';

/**
 * Unit tests for extraction adapter
 * Route-level tests covered via integration testing
 */

describe('Extraction Adapter', () => {
  describe('truncateMarkdown', () => {
    it('should not truncate short markdown', () => {
      const markdown = '# Title\n\nShort content here.';
      const result = truncateMarkdown(markdown);
      expect(result).toBe(markdown);
    });

    it('should truncate markdown to 50 KB max', () => {
      // Generate 60 KB of content
      const longContent = 'x'.repeat(60 * 1024);
      const markdown = `# Title\n\n${longContent}`;

      const result = truncateMarkdown(markdown);
      const bytes = new TextEncoder().encode(result);

      expect(bytes.length).toBeLessThanOrEqual(50 * 1024);
    });

    it('should preserve complete lines when truncating', () => {
      const markdown = '# Title\n\nLine 1\nLine 2\nLine 3\nLine 4\n' + 'x'.repeat(50 * 1024);
      const result = truncateMarkdown(markdown);

      // Should preserve original structure (contains expected lines)
      expect(result).toContain('# Title');
      expect(result).toContain('Line 1');
      const bytes = new TextEncoder().encode(result);
      expect(bytes.length).toBeLessThanOrEqual(50 * 1024);
    });

    it('should handle edge case of single line exceeding limit', () => {
      const longLine = 'x'.repeat(60 * 1024);
      const result = truncateMarkdown(longLine);

      expect(result.length > 0).toBe(true);
      const bytes = new TextEncoder().encode(result);
      expect(bytes.length).toBeLessThanOrEqual(50 * 1024);
    });
  });

  describe('mapErrorToStatus', () => {
    it('should map timeout errors', () => {
      expect(mapErrorToStatus('timeout after 15000ms')).toBe('timeout');
      expect(mapErrorToStatus('Timeout occurred')).toBe('timeout');
    });

    it('should map blocked errors', () => {
      expect(mapErrorToStatus('HTTP 403 Forbidden')).toBe('blocked');
      expect(mapErrorToStatus('429 Too Many Requests')).toBe('blocked');
      expect(mapErrorToStatus('Access blocked')).toBe('blocked');
    });

    it('should map parsing errors', () => {
      expect(mapErrorToStatus('No content found')).toBe('parsing_error');
      expect(mapErrorToStatus('Parsing failed')).toBe('parsing_error');
    });

    it('should default to error', () => {
      expect(mapErrorToStatus('Unknown error')).toBe('error');
      expect(mapErrorToStatus('Something went wrong')).toBe('error');
    });
  });

  describe('normalizeExtraction', () => {
    it('should normalize successful extraction', () => {
      const result = {
        success: true,
        markdown: '# Article\n\nContent here.',
        char_count: 27,
        extraction_time_ms: 3200,
        error: null,
      };

      const normalized = normalizeExtraction(result);

      expect(normalized.extraction_status).toBe('success');
      expect(normalized.extracted_markdown).toBe('# Article\n\nContent here.');
      expect(normalized.extraction_error).toBeNull();
      expect(normalized.extraction_time_ms).toBe(3200);
    });

    it('should normalize timeout failure', () => {
      const result = {
        success: false,
        markdown: null,
        char_count: 0,
        extraction_time_ms: 15050,
        error: 'timeout after 15000ms',
      };

      const normalized = normalizeExtraction(result);

      expect(normalized.extraction_status).toBe('timeout');
      expect(normalized.extracted_markdown).toBeNull();
      expect(normalized.extraction_error).toBe('timeout after 15000ms');
    });

    it('should normalize blocked failure', () => {
      const result = {
        success: false,
        markdown: null,
        char_count: 0,
        extraction_time_ms: 2100,
        error: 'HTTP 403 Forbidden',
      };

      const normalized = normalizeExtraction(result);

      expect(normalized.extraction_status).toBe('blocked');
      expect(normalized.extracted_markdown).toBeNull();
    });

    it('should normalize parsing error', () => {
      const result = {
        success: false,
        markdown: null,
        char_count: 0,
        extraction_time_ms: 5000,
        error: 'No content found on page',
      };

      const normalized = normalizeExtraction(result);

      expect(normalized.extraction_status).toBe('parsing_error');
      expect(normalized.extracted_markdown).toBeNull();
    });

    it('should truncate large markdown during normalization', () => {
      const longMarkdown = '# Article\n\n' + 'x'.repeat(60 * 1024);
      const result = {
        success: true,
        markdown: longMarkdown,
        char_count: longMarkdown.length,
        extraction_time_ms: 4500,
        error: null,
      };

      const normalized = normalizeExtraction(result);

      expect(normalized.extraction_status).toBe('success');
      const bytes = new TextEncoder().encode(normalized.extracted_markdown!);
      expect(bytes.length).toBeLessThanOrEqual(50 * 1024);
    });
  });
});
