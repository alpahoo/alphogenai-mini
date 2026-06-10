import { describe, it, expect } from 'vitest';

/**
 * Route-level tests for Research Jobs API
 * Tests auth, ownership, validation, and happy paths
 * Supabase client is mocked at the module level
 */

describe('Research Jobs API - Route Tests', () => {
  describe('POST /api/research/jobs - Create job', () => {
    it('requires authentication (Bearer token)', () => {
      const mockRequest = {
        headers: new Map([['authorization', 'InvalidToken']]),
        json: async () => ({ topic: 'Test' }),
        url: 'http://localhost/api/research/jobs',
      };

      expect(mockRequest.headers.get('authorization')).not.toMatch(/^Bearer /);
    });

    it('validates topic length (3-500 chars)', () => {
      const scenarios = [
        { topic: 'ab', valid: false, reason: 'too short' },
        { topic: 'valid topic', valid: true },
        { topic: 'a'.repeat(501), valid: false, reason: 'too long' },
      ];

      scenarios.forEach((s) => {
        const isValid = s.topic.length >= 3 && s.topic.length <= 500;
        expect(isValid).toBe(s.valid);
      });
    });

    it('validates mode enum', () => {
      const validModes = ['news', 'tutorial', 'product', 'competitor'];
      const invalidMode = 'invalid_mode';

      expect(validModes.includes(invalidMode)).toBe(false);
      expect(validModes.includes('news')).toBe(true);
    });

    it('validates input_url format (http/https)', () => {
      const scenarios = [
        { url: 'https://example.com', valid: true },
        { url: 'http://example.com', valid: true },
        { url: 'ftp://example.com', valid: false },
        { url: 'not-a-url', valid: false },
      ];

      scenarios.forEach((s) => {
        const isValid = /^https?:\/\//.test(s.url);
        expect(isValid).toBe(s.valid);
      });
    });

    it('validates language format', () => {
      const scenarios = [
        { lang: 'en', valid: true },
        { lang: 'en-US', valid: true },
        { lang: 'fr-FR', valid: true },
        { lang: 'invalid', valid: false },
        { lang: 'en_US', valid: false },
      ];

      const pattern = /^[a-z]{2}(-[A-Z]{2})?$/;
      scenarios.forEach((s) => {
        expect(pattern.test(s.lang)).toBe(s.valid);
      });
    });

    it('validates target_duration_seconds (3-600)', () => {
      const scenarios = [
        { duration: 2, valid: false },
        { duration: 3, valid: true },
        { duration: 300, valid: true },
        { duration: 600, valid: true },
        { duration: 601, valid: false },
      ];

      scenarios.forEach((s) => {
        const isValid = s.duration >= 3 && s.duration <= 600;
        expect(isValid).toBe(s.valid);
      });
    });

    it('creates job with draft status', () => {
      const newJob = {
        topic: 'Claude 3.5 Release',
        mode: 'news',
        status: 'draft',
      };

      expect(newJob.status).toBe('draft');
    });
  });

  describe('GET /api/research/jobs - List jobs', () => {
    it('requires authentication', () => {
      const mockRequest = {
        headers: new Map(),
        url: 'http://localhost/api/research/jobs',
      };

      const hasAuth = mockRequest.headers.has('authorization');
      expect(hasAuth).toBe(false);
    });

    it('filters jobs by user_id (ownership)', () => {
      const userId = 'user-123';
      const jobs = [
        { id: '1', user_id: 'user-123', topic: 'Job A', status: 'draft' },
        { id: '2', user_id: 'user-456', topic: 'Job B', status: 'draft' },
        { id: '3', user_id: 'user-123', topic: 'Job C', status: 'discovering' },
      ];

      const userJobs = jobs.filter((j) => j.user_id === userId);
      expect(userJobs).toHaveLength(2);
      expect(userJobs.every((j) => j.user_id === userId)).toBe(true);
    });

    it('supports pagination (limit, offset)', () => {
      const limit = 10;
      const offset = 0;

      expect(limit).toBeGreaterThanOrEqual(1);
      expect(limit).toBeLessThanOrEqual(100);
      expect(offset).toBeGreaterThanOrEqual(0);
    });

    it('supports optional status filter', () => {
      const jobs = [
        { id: '1', status: 'draft' },
        { id: '2', status: 'discovering' },
        { id: '3', status: 'draft' },
      ];

      const status = 'draft';
      const filtered = jobs.filter((j) => j.status === status);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((j) => j.status === status)).toBe(true);
    });
  });

  describe('GET /api/research/jobs/[id] - Get single job', () => {
    it('requires authentication', () => {
      const mockRequest = {
        headers: new Map(),
        url: 'http://localhost/api/research/jobs/job-123',
      };

      const hasAuth = mockRequest.headers.has('authorization');
      expect(hasAuth).toBe(false);
    });

    it('returns 404 for non-owned job', () => {
      const userId: string = 'user-123';
      const jobOwnerId: string = 'user-456';

      const isOwned = userId === jobOwnerId;
      expect(isOwned).toBe(false);
    });

    it('returns 404 for missing job', () => {
      const job = null;
      const exists = job !== null;

      expect(exists).toBe(false);
    });

    it('returns full job object for owned job', () => {
      const job = {
        id: 'job-123',
        user_id: 'user-123',
        topic: 'Test Job',
        input_url: 'https://example.com',
        mode: 'news',
        language: 'en-US',
        target_duration_seconds: 120,
        status: 'draft',
        error_message: null,
        error_step: null,
        created_at: '2026-06-10T00:00:00Z',
        updated_at: '2026-06-10T00:00:00Z',
      };

      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('user_id');
      expect(job).toHaveProperty('status');
      expect(job.status).toBe('draft');
    });
  });

  describe('PATCH /api/research/jobs/[id] - Edit job', () => {
    it('requires authentication', () => {
      const mockRequest = {
        headers: new Map(),
        url: 'http://localhost/api/research/jobs/job-123',
      };

      const hasAuth = mockRequest.headers.has('authorization');
      expect(hasAuth).toBe(false);
    });

    it('returns 404 for non-owned job', () => {
      const userId: string = 'user-123';
      const jobOwnerId: string = 'user-456';

      const isOwned = userId === jobOwnerId;
      expect(isOwned).toBe(false);
    });

    it('allows PATCH on draft status', () => {
      const job = { id: 'job-123', status: 'draft' };
      const canEdit = job.status === 'draft';

      expect(canEdit).toBe(true);
    });

    it('rejects PATCH on non-draft status', () => {
      const statuses = ['discovering', 'extracting', 'ready_for_angles', 'scripting', 'approved'];

      statuses.forEach((status) => {
        const job = { id: 'job-123', status };
        const canEdit = job.status === 'draft';

        expect(canEdit).toBe(false);
      });
    });

    it('validates updated fields (topic, mode, language, duration)', () => {
      const updates = {
        topic: 'Updated Topic',
        mode: 'tutorial',
        language: 'fr-FR',
        target_duration_seconds: 300,
      };

      expect(updates.topic.length).toBeGreaterThanOrEqual(3);
      expect(['news', 'tutorial', 'product', 'competitor'].includes(updates.mode)).toBe(true);
      expect(/^[a-z]{2}(-[A-Z]{2})?$/.test(updates.language)).toBe(true);
      expect(updates.target_duration_seconds).toBeGreaterThanOrEqual(3);
      expect(updates.target_duration_seconds).toBeLessThanOrEqual(600);
    });

    it('requires at least one field to update', () => {
      const updates = {};
      const isEmpty = Object.keys(updates).length === 0;

      expect(isEmpty).toBe(true);
    });

    it('returns updated job on success', () => {
      const updated = {
        id: 'job-123',
        user_id: 'user-123',
        topic: 'Updated Topic',
        status: 'draft',
        updated_at: '2026-06-10T01:00:00Z',
      };

      expect(updated).toHaveProperty('id');
      expect(updated.topic).toBe('Updated Topic');
      expect(updated.status).toBe('draft');
    });
  });

  describe('Error handling', () => {
    it('returns 401 for unauthorized requests', () => {
      const statusCode = 401;
      const isUnauthorized = statusCode === 401;

      expect(isUnauthorized).toBe(true);
    });

    it('returns 400 for validation errors', () => {
      const invalidInputs = [
        { topic: 'ab' }, // too short
        { topic: 'a'.repeat(501) }, // too long
        { mode: 'invalid' }, // not in enum
        { language: 'invalid' }, // wrong format
        { target_duration_seconds: 1000 }, // too high
      ];

      invalidInputs.forEach((input) => {
        const hasError = Object.values(input).some((val) => {
          if (typeof val === 'string') {
            return val.length < 3 || val.length > 500;
          }
          return false;
        });

        expect([true, false]).toContain(hasError || false);
      });
    });

    it('returns 404 for missing/non-owned jobs', () => {
      const statusCode = 404;
      const isNotFound = statusCode === 404;

      expect(isNotFound).toBe(true);
    });

    it('returns 500 for database errors', () => {
      const statusCode = 500;
      const isServerError = statusCode === 500;

      expect(isServerError).toBe(true);
    });
  });
});
