/**
 * demo-seed unit tests
 * Verifies seed logic + env guards
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { shouldAutoSeed, DEMO_PROJECT_SLUG, DEMO_ENDPOINTS } from '../demo-seed';

describe('DEMO_PROJECT_SLUG', () => {
  it('is "demo-project"', () => {
    expect(DEMO_PROJECT_SLUG).toBe('demo-project');
  });
});

describe('DEMO_ENDPOINTS', () => {
  it('contains /users, /users/:id, /orders', () => {
    const paths = DEMO_ENDPOINTS.map(e => e.path);
    expect(paths).toContain('/users');
    expect(paths).toContain('/users/:id');
    expect(paths).toContain('/orders');
  });

  it('all endpoints are GET method', () => {
    for (const ep of DEMO_ENDPOINTS) {
      expect(ep.method).toBe('GET');
    }
  });
});

describe('shouldAutoSeed', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns false when NODE_ENV is "test"', () => {
    process.env.NODE_ENV = 'test';
    expect(shouldAutoSeed(0)).toBe(false);
  });

  it('returns false when SKIP_SEED is "true"', () => {
    process.env.NODE_ENV = 'production';
    process.env.SKIP_SEED = 'true';
    expect(shouldAutoSeed(0)).toBe(false);
  });

  it('returns false when projects table is not empty', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SKIP_SEED;
    expect(shouldAutoSeed(5)).toBe(false);
  });

  it('returns true when NODE_ENV=production + no SKIP_SEED + empty projects', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SKIP_SEED;
    expect(shouldAutoSeed(0)).toBe(true);
  });

  it('returns true when NODE_ENV=development + empty projects', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SKIP_SEED;
    expect(shouldAutoSeed(0)).toBe(true);
  });
});
