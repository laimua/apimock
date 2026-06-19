/**
 * Health endpoint test
 */

import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('includes timestamp', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.timestamp).toBeDefined();
  });
});
