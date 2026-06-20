/**
 * AI 日预算兜底
 *
 * PRD 头号风险：AI 成本失控。恶意脚本轮换 IP 就能绕过 per-IP 限流。
 * 本模块按"每日全局 token + 调用次数"双轴硬上限，到顶降级到本地 mock 模板。
 *
 * 后端：KV 抽象。无 REDIS_URL 走 Memory（单实例精确），有 REDIS_URL 走 Redis
 * （多副本一致）。两者签名一致，调用方零感知。
 *
 * 配置：
 *   AI_DAILY_TOKEN_LIMIT    默认 1_000_000
 *   AI_DAILY_REQUEST_LIMIT  默认 1000
 */

import { logger } from './logger';
import { aiBudgetRemaining } from './metrics';
import { getKv } from './kv-store';

const DEFAULT_TOKEN_LIMIT = 1_000_000;
const DEFAULT_REQUEST_LIMIT = 1000;
const SECONDS_PER_DAY = 24 * 60 * 60;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function getTokenLimit(): number {
  const v = Number(process.env.AI_DAILY_TOKEN_LIMIT);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TOKEN_LIMIT;
}

function getRequestLimit(): number {
  const v = Number(process.env.AI_DAILY_REQUEST_LIMIT);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_REQUEST_LIMIT;
}

function reqKey(): string {
  return `ai:budget:req:${todayStr()}`;
}

function tokKey(): string {
  return `ai:budget:tok:${todayStr()}`;
}

export interface BudgetCheck {
  allowed: boolean;
  reason?: 'request_limit' | 'token_limit';
  remaining?: { requests: number; tokens: number };
}

export async function checkAiBudget(): Promise<BudgetCheck> {
  const kv = await getKv();
  const reqLimit = getRequestLimit();
  const tokLimit = getTokenLimit();

  const [reqStr, tokStr] = await Promise.all([kv.get(reqKey()), kv.get(tokKey())]);
  const requests = Number(reqStr ?? 0);
  const tokens = Number(tokStr ?? 0);

  if (requests >= reqLimit) {
    return { allowed: false, reason: 'request_limit', remaining: { requests: 0, tokens: Math.max(0, tokLimit - tokens) } };
  }
  if (tokens >= tokLimit) {
    return { allowed: false, reason: 'token_limit', remaining: { requests: Math.max(0, reqLimit - requests), tokens: 0 } };
  }
  return {
    allowed: true,
    remaining: { requests: reqLimit - requests, tokens: tokLimit - tokens },
  };
}

/**
 * AI 调用后上报消耗。tokens 可以是估算值（prompt+completion）。
 */
export async function recordAiUsage(tokens: number): Promise<void> {
  const kv = await getKv();
  const safeTokens = Math.max(0, Math.floor(tokens));
  const [reqCount, tokCount] = await Promise.all([
    kv.incr(reqKey(), 1, SECONDS_PER_DAY),
    kv.incr(tokKey(), safeTokens, SECONDS_PER_DAY),
  ]);
  aiBudgetRemaining.set({ axis: 'requests' }, Math.max(0, getRequestLimit() - reqCount));
  aiBudgetRemaining.set({ axis: 'tokens' }, Math.max(0, getTokenLimit() - tokCount));
  logger.debug(
    { date: todayStr(), requests: reqCount, tokens: tokCount, reqLimit: getRequestLimit(), tokLimit: getTokenLimit() },
    'AI budget usage'
  );
}

export async function getBudgetStatus(): Promise<{ date: string; requests: number; tokens: number; limits: { tokens: number; requests: number } }> {
  const kv = await getKv();
  const [reqStr, tokStr] = await Promise.all([kv.get(reqKey()), kv.get(tokKey())]);
  return {
    date: todayStr(),
    requests: Number(reqStr ?? 0),
    tokens: Number(tokStr ?? 0),
    limits: { tokens: getTokenLimit(), requests: getRequestLimit() },
  };
}

/** 测试用：清空当前日预算 */
export async function _resetBudgetForTest(): Promise<void> {
  const kv = await getKv();
  await kv.del(reqKey());
  await kv.del(tokKey());
}
