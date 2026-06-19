/**
 * Body size guard integration test
 * Verifies route returns 413 when body exceeds 1MB
 *
 * Boundary case (exactly 1MB allowed) is covered by src/lib/__tests__/body-size-limit.test.ts
 * This test only covers the integration: large body -> 413 response
 */

import { describe, it, expect } from 'vitest';
import { POST } from '@/app/[project]/[...path]/route';
import { NextRequest } from 'next/server';
import { MAX_BODY_BYTES } from '@/lib/body-size-limit';

function makeRequest(body: string, project = 'demo-project', path = 'users'): NextRequest {
  return new NextRequest(`http://localhost/${project}/${path}`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });
}

describe('body size guard (integration)', () => {
  it('returns 413 when body exceeds 1MB', async () => {
    const largeBody = 'x'.repeat(MAX_BODY_BYTES + 1);
    const req = makeRequest(largeBody);
    const ctx = { params: Promise.resolve({ project: 'demo-project', path: ['users'] }) };
    const res = await POST(req, ctx);
    expect(res.status).toBe(413);
  });
});

