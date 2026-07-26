/**
 * Prometheus metrics
 *
 * /api/metrics 输出 prom-client 默认 + 自定义业务指标。访问需 METRICS_TOKEN。
 *
 * 指标清单：
 *   apimock_mock_requests_total{project,method,status}   counter
 *   apimock_mock_request_duration_ms_bucket{...}         histogram (P50/P95/P99)
 *   apimock_ai_generate_total{provider,outcome}          counter (outcome: provider/fallback/budget)
 *   apimock_ai_cost_tokens_total{provider}               counter
 *   apimock_prune_deleted_total                          counter
 *   apimock_rate_limit_rejected_total{kind}              counter (mock / ai)
 *   apimock_rate_limit_error_total{kind}                 counter (KV error fail-open: mock / ai / login)
 *   apimock_ai_budget_remaining{axis}                    gauge (tokens / requests)
 *
 * 不暴露用户输入内容、provider 名称、project slug 之外的标识符。METRICS_TOKEN
 * 默认拒绝，避免业务 label 暴露。
 */

import { Counter, Histogram, Gauge, register, collectDefaultMetrics } from 'prom-client';

export { register };

collectDefaultMetrics();

export const mockRequestsTotal = new Counter({
  name: 'apimock_mock_requests_total',
  help: 'Total mock requests handled',
  // 注意：不带 project label。project 是用户 slug，长期会无限增长导致
  // Prometheus 基数爆炸。需要项目维度时改查 DB。
  labelNames: ['method', 'status'],
});

export const mockRequestDuration = new Histogram({
  name: 'apimock_mock_request_duration_ms',
  help: 'Mock request duration in ms',
  labelNames: ['method'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
});

export const aiGenerateTotal = new Counter({
  name: 'apimock_ai_generate_total',
  help: 'AI generate calls by outcome',
  labelNames: ['provider', 'outcome'],
});

export const aiCostTokensTotal = new Counter({
  name: 'apimock_ai_cost_tokens_total',
  help: 'Total tokens consumed by AI providers',
  labelNames: ['provider'],
});

export const pruneDeletedTotal = new Counter({
  name: 'apimock_prune_deleted_total',
  help: 'Total request records pruned by retention',
});

export const rateLimitRejectedTotal = new Counter({
  name: 'apimock_rate_limit_rejected_total',
  help: 'Requests rejected by rate limiter',
  labelNames: ['kind'],
});

/**
 * KV 后端故障导致 fail-open 放行的次数。
 * 触发条件:rateLimit() 内 kv.incr 抛错(Redis 网络分区 / Memory 罕见抛错)。
 * fail-open = 放行 + 记录此指标 + logger.error,避免静默失效。
 */
export const rateLimitErrorTotal = new Counter({
  name: 'apimock_rate_limit_error_total',
  help: 'Rate limit checks that failed open due to KV backend error',
  labelNames: ['kind'],
});

export const aiBudgetRemaining = new Gauge({
  name: 'apimock_ai_budget_remaining',
  help: 'AI daily budget remaining (tokens / requests)',
  labelNames: ['axis'],
});

export async function metricsOutput(): Promise<string> {
  return register.metrics();
}
