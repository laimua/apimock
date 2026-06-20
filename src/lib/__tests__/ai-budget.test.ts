import { describe, it, expect, beforeEach } from 'vitest';
import { checkAiBudget, recordAiUsage, getBudgetStatus, _resetBudgetForTest } from '../ai-budget';
import { _setKvForTest } from '../kv-store';
import { createMemoryKv } from '../kv-memory';

describe('ai-budget', () => {
  beforeEach(async () => {
    process.env.AI_DAILY_TOKEN_LIMIT = '1000';
    process.env.AI_DAILY_REQUEST_LIMIT = '5';
    _setKvForTest(createMemoryKv());
    await _resetBudgetForTest();
  });

  it('allows when under limit', async () => {
    const r = await checkAiBudget();
    expect(r.allowed).toBe(true);
    expect(r.remaining?.requests).toBe(5);
    expect(r.remaining?.tokens).toBe(1000);
  });

  it('blocks when request count exhausted', async () => {
    for (let i = 0; i < 5; i++) await recordAiUsage(10);
    const r = await checkAiBudget();
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('request_limit');
  });

  it('blocks when token count exhausted', async () => {
    await recordAiUsage(1001);
    const r = await checkAiBudget();
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('token_limit');
  });

  it('exposes status with limits', async () => {
    await recordAiUsage(100);
    const s = await getBudgetStatus();
    expect(s.limits.tokens).toBe(1000);
    expect(s.limits.requests).toBe(5);
    expect(s.tokens).toBe(100);
    expect(s.requests).toBe(1);
  });
});
