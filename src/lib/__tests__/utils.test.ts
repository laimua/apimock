/**
 * utils.ts unit tests
 */

import { describe, it, expect } from 'vitest';
import { cn, formatDate, copyToClipboard } from '../utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('handles empty inputs', () => {
    expect(cn()).toBe('');
  });

  it('handles conditional classes (falsy filtered)', () => {
    expect(cn('base', false, null, undefined, 'tail')).toBe('base tail');
  });
});

describe('formatDate', () => {
  it('returns formatted string', () => {
    const result = formatDate('2026-06-14T10:30:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes year/month/day', () => {
    const result = formatDate('2026-06-14T10:30:00Z');
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/06/);
    expect(result).toMatch(/14/);
  });

  it('handles ISO string from API', () => {
    const iso = new Date().toISOString();
    expect(() => formatDate(iso)).not.toThrow();
  });
});

describe('copyToClipboard', () => {
  it('returns boolean (success/fail)', async () => {
    // happy-dom may or may not have clipboard; just verify it returns boolean
    const result = await copyToClipboard('test');
    expect(typeof result).toBe('boolean');
  });

  it('does not throw on missing clipboard', async () => {
    const original = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    const result = await copyToClipboard('test');
    expect(result).toBe(false);
    Object.defineProperty(navigator, 'clipboard', {
      value: original,
      configurable: true,
    });
  });
});
