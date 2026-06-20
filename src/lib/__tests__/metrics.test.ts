import { describe, it, expect, beforeEach } from 'vitest';
import { mockRequestsTotal, mockRequestDuration, aiGenerateTotal, aiCostTokensTotal, pruneDeletedTotal, rateLimitRejectedTotal, aiBudgetRemaining, metricsOutput, register } from '../metrics';

describe('metrics', () => {
  beforeEach(() => {
    register.resetMetrics();
  });

  it('mockRequestsTotal increments with labels', async () => {
    mockRequestsTotal.inc({ method: 'GET', status: '200' });
    const out = await metricsOutput();
    expect(out).toContain('apimock_mock_requests_total');
    expect(out).toContain('method="GET"');
    expect(out).toContain('status="200"');
  });

  it('mockRequestDuration observes histogram bucket', async () => {
    mockRequestDuration.observe({ method: 'GET' }, 42);
    const out = await metricsOutput();
    expect(out).toContain('apimock_mock_request_duration_ms_bucket');
    expect(out).toContain('le="50"');
  });

  it('aiCostTokensTotal inc with value', async () => {
    aiCostTokensTotal.inc({ provider: 'openai' }, 1234);
    const out = await metricsOutput();
    expect(out).toContain('apimock_ai_cost_tokens_total');
    expect(out).toMatch(/1234/);
  });

  it('aiGenerateTotal covers provider/fallback/budget outcomes', async () => {
    aiGenerateTotal.inc({ provider: 'openai', outcome: 'provider' });
    aiGenerateTotal.inc({ provider: 'none', outcome: 'fallback' });
    aiGenerateTotal.inc({ provider: 'none', outcome: 'budget' });
    const out = await metricsOutput();
    expect(out).toContain('outcome="provider"');
    expect(out).toContain('outcome="fallback"');
    expect(out).toContain('outcome="budget"');
  });

  it('all other metrics present in output', async () => {
    pruneDeletedTotal.inc(5);
    rateLimitRejectedTotal.inc({ kind: 'mock' });
    aiBudgetRemaining.set({ axis: 'requests' }, 100);
    const out = await metricsOutput();
    expect(out).toContain('apimock_prune_deleted_total');
    expect(out).toContain('apimock_rate_limit_rejected_total');
    expect(out).toContain('apimock_ai_budget_remaining');
  });
});
