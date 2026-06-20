import { describe, it, expect, beforeEach } from 'vitest';
import { checkAiBudget, recordAiUsage, getBudgetStatus, _resetBudgetForTest } from '../ai-budget';

describe('ai-budget', () => {
  beforeEach(() => {
    process.env.AI_DAILY_TOKEN_LIMIT = '1000';
    process.env.AI_DAILY_REQUEST_LIMIT = '5';
    _resetBudgetForTest();
  });

  it('allows when under limit', () => {
    const r = checkAiBudget();
    expect(r.allowed).toBe(true);
    expect(r.remaining?.requests).toBe(5);
    expect(r.remaining?.tokens).toBe(1000);
  });

  it('blocks when request count exhausted', () => {
    for (let i = 0; i < 5; i++) recordAiUsage(10);
    const r = checkAiBudget();
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('request_limit');
  });

  it('blocks when token count exhausted', () => {
    recordAiUsage(1001);
    const r = checkAiBudget();
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('token_limit');
  });

  it('exposes status with limits', () => {
    recordAiUsage(100);
    const s = getBudgetStatus();
    expect(s.limits.tokens).toBe(1000);
    expect(s.limits.requests).toBe(5);
    expect(s.tokens).toBe(100);
    expect(s.requests).toBe(1);
  });
});
