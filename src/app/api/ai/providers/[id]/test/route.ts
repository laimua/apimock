/**
 * Test Provider Connection API
 * POST /api/ai/providers/[id]/test - 测试 Provider 连接是否可用
 */

import { NextRequest, NextResponse } from 'next/server';
import { success, Errors, error } from '@/lib/api';
import { db } from '@/lib/db';
import { aiProviders } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '@/lib/encryption';
import { validateUrlSafe } from '@/lib/ssrf';
import OpenAI from 'openai';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/ai-presets';
import { rateLimit } from '@/lib/rate-limit';
import { checkAiBudget, recordAiUsage } from '@/lib/ai-budget';
import { rateLimitRejectedTotal, aiCostTokensTotal } from '@/lib/metrics';
import { getClientIp } from '@/lib/client-ip';

// AI test 限流：5 req/min/IP（比 generate 更严，单次探测即可）
const AI_TEST_RATE_LIMIT = 5;

// ============================================
// POST /api/ai/providers/[id]/test
// ============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 限流：5 req/min/IP（防滥用 + 控成本）
    const ip = getClientIp(request.headers) ?? 'unknown';
    const rl = await rateLimit(`ai-test:${ip}`, AI_TEST_RATE_LIMIT, 60, 'ai-test');
    if (!rl.allowed) {
      rateLimitRejectedTotal.inc({ kind: 'ai-test' });
      return NextResponse.json(
        { success: false, error: 'Too Many Requests. AI test limit: 5/min/IP.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(AI_TEST_RATE_LIMIT),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
          },
        }
      );
    }

    const { id } = await params;

    // 获取 provider
    const provider = await db.query.aiProviders.findFirst({
      where: eq(aiProviders.id, id),
    });

    if (!provider) {
      return Errors.notFound('Provider');
    }

    // 日预算硬上限：超额直接拒绝，给出友好提示
    const budget = await checkAiBudget();
    if (!budget.allowed) {
      return Errors.badRequest(`AI daily budget exhausted (${budget.reason}). Please try again later.`);
    }

    // 解密 API Key
    let apiKey: string;
    try {
      apiKey = decrypt(provider.apiKey);
    } catch {
      return Errors.internal('Failed to decrypt API key');
    }

    // 解析 models(A18:safe parse,坏数据返空数组而非 500)
    let models: string[] = [];
    try { models = JSON.parse(provider.models); } catch { /* 坏数据返空 */ }
    const modelToTest = provider.defaultModel || models[0];

    // SSRF 校验
    if (provider.baseUrl) {
      const check = await validateUrlSafe(provider.baseUrl);
      if (!check.safe) {
        return Errors.badRequest(`Base URL rejected: ${check.reason}`);
      }
    }

    // 创建 OpenAI 客户端
    const openai = new OpenAI({
      apiKey,
      baseURL: provider.baseUrl || undefined,
      timeout: 30_000,
    });

    // 发送测试请求
    const systemPrompt = provider.systemPrompt || DEFAULT_SYSTEM_PROMPT;

    const completion = await openai.chat.completions.create({
      model: modelToTest,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Hello! Please respond with a simple greeting.' },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    // 上报 token 消耗给预算模块（兼容接口可能缺失 usage）
    const response = completion.choices[0]?.message?.content;
    const used = completion.usage?.total_tokens ?? Math.ceil((response ?? '').length / 4);
    await recordAiUsage(used);
    // 观测性：与 generate route 对齐，上报 token 消耗到 Prometheus（ai-test 维度）
    aiCostTokensTotal.inc({ provider: `ai-test:${provider.provider}` }, used);

    if (!response) {
      return Errors.badRequest('Provider returned no response content');
    }

    return success({
      success: true,
      model: modelToTest,
      response: response.substring(0, 200), // 截断过长响应
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    // OpenAI API 错误：透传上游状态码（如 401/429/超时），并带上 status，避免坍缩为同一句
    if (err && typeof err === 'object' && 'status' in err) {
      const status = (err as { status?: number }).status;
      const body = `Provider API request failed: ${msg}`;
      if (typeof status === 'number') {
        return error('PROVIDER_ERROR', body, status);
      }
      return Errors.internal(body);
    }

    // 无响应 / 超时 / 其他：统一 500，附原始信息便于排查
    return Errors.internal(`Failed to test provider connection: ${msg}`);
  }
}
