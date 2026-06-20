/**
 * AI 日预算兜底
 *
 * PRD 头号风险：AI 成本失控。恶意脚本轮换 IP 就能绕过 per-IP 限流。
 * 本模块按"每日全局 token + 调用次数"双轴硬上限，到顶降级到本地 mock 模板。
 *
 * 单实例内存计数（多副本下各自计数，限流会 N 倍宽松——已知取舍，多副本需
 * 换 Redis 见 kv-store 抽象）。
 *
 * 配置：
 *   AI_DAILY_TOKEN_LIMIT    默认 1_000_000
 *   AI_DAILY_REQUEST_LIMIT  默认 1000
 */

import { logger } from './logger';

const DEFAULT_TOKEN_LIMIT = 1_000_000;
const DEFAULT_REQUEST_LIMIT = 1000;

type Budget = { date: string; tokens: number; requests: number };

let today: Budget = { date: todayStr(), tokens: 0, requests: 0 };

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

function rolloverIfNeeded(): void {
  const d = todayStr();
  if (today.date !== d) {
    today = { date: d, tokens: 0, requests: 0 };
  }
}

export interface BudgetCheck {
  allowed: boolean;
  reason?: 'request_limit' | 'token_limit';
  remaining?: { requests: number; tokens: number };
}

export function checkAiBudget(): BudgetCheck {
  rolloverIfNeeded();
  const reqLimit = getRequestLimit();
  const tokLimit = getTokenLimit();

  if (today.requests >= reqLimit) {
    return { allowed: false, reason: 'request_limit', remaining: { requests: 0, tokens: Math.max(0, tokLimit - today.tokens) } };
  }
  if (today.tokens >= tokLimit) {
    return { allowed: false, reason: 'token_limit', remaining: { requests: Math.max(0, reqLimit - today.requests), tokens: 0 } };
  }
  return {
    allowed: true,
    remaining: { requests: reqLimit - today.requests, tokens: tokLimit - today.tokens },
  };
}

/**
 * AI 调用后上报消耗。tokens 可以是估算值（prompt+completion）。
 */
export function recordAiUsage(tokens: number): void {
  rolloverIfNeeded();
  today.requests += 1;
  today.tokens += Math.max(0, Math.floor(tokens));
  logger.debug(
    { date: today.date, requests: today.requests, tokens: today.tokens, reqLimit: getRequestLimit(), tokLimit: getTokenLimit() },
    'AI budget usage'
  );
}

export function getBudgetStatus(): Budget & { limits: { tokens: number; requests: number } } {
  rolloverIfNeeded();
  return { ...today, limits: { tokens: getTokenLimit(), requests: getRequestLimit() } };
}

/** 测试用：重置当前日预算 */
export function _resetBudgetForTest(): void {
  today = { date: todayStr(), tokens: 0, requests: 0 };
}
