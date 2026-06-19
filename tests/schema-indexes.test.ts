/**
 * Schema indexes verification
 * Ensures requests/responses tables have required indexes for query performance
 */

import { describe, it, expect } from 'vitest';
import { setupTestDb } from './setup';

type IndexRow = { name: string };

async function listIndexes(tableName: string): Promise<string[]> {
  const db = await setupTestDb(`indexes-test-${Math.random()}`);
  const rows = (await db.all(`PRAGMA index_list('${tableName}')`)) as IndexRow[];
  return rows.map((r) => r.name);
}

describe('schema indexes', () => {
  it('requests table has endpoint_id index', async () => {
    const names = await listIndexes('requests');
    expect(names).toContain('requests_endpoint_idx');
  });

  it('requests table has created_at index', async () => {
    const names = await listIndexes('requests');
    expect(names).toContain('requests_created_idx');
  });

  it('responses table has endpoint_id index', async () => {
    const names = await listIndexes('responses');
    expect(names).toContain('responses_endpoint_idx');
  });
});
