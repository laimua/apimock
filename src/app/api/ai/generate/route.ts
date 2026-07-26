/**
 * AI 生成 Mock 数据 API
 * POST /api/ai/generate - 根据用户描述生成 JSON Mock 数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { success, error, Errors, validate, ValidationError } from '@/lib/api';
import { z } from 'zod';
import OpenAI from 'openai';
import { db } from '@/lib/db';
import { aiProviders } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '@/lib/encryption';
import { validateUrlSafe } from '@/lib/ssrf';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/ai-presets';
import { rateLimit } from '@/lib/rate-limit';
import { generateMockData } from '@/lib/mock-data-templates';
import { checkAiBudget, recordAiUsage } from '@/lib/ai-budget';
import { aiGenerateTotal, aiCostTokensTotal, rateLimitRejectedTotal } from '@/lib/metrics';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/client-ip';

// AI generate 限流：10 req/min/IP（成本控制）
const AI_RATE_LIMIT = 10;

// ============================================
// Schema
// ============================================
const GenerateSchema = z.object({
  prompt: z.string().min(1).max(2000),
  count: z.number().min(1).max(100).optional().default(10),
  providerId: z.string().optional(),
});

// ============================================
// Prompt 模板
// ============================================
const SYSTEM_PROMPT = `你是 Mock 数据生成专家。根据用户描述生成结构化、语义正确的 JSON Mock 数据。

字段类型映射：
- id/ID → 递增整数
- 姓名/名字 → 中文姓名（张伟/李娜/王芳/刘洋/陈静/杨强/赵敏/孙杰/周婷/吴磊）
- 邮箱/email → {name}{n}@example.com
- 电话/手机 → 138xxxx0000 格式
- 头像/avatar → https://api.dicebear.com/7.x/avataaars/svg?seed={id}
- 时间/日期 → ISO 8601 格式
- 价格/金额 → 两位小数
- 状态 → active/inactive/pending/completed/cancelled
- URL → https://example.com/{resource}/{id}

输出结构：
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [...],
    "total": 数量
  }
}

约束：
- 只输出合法 JSON，无注释
- 确保 data.list 是数组
- 确保 total 与 list 长度一致`;

// ============================================
// 工具函数：解析 AI 返回的 JSON
// ============================================
function parseAIResponse(content: string): unknown {
  // 尝试直接解析
  try {
    return JSON.parse(content);
  } catch {
    // 尝试提取 JSON 代码块
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // 忽略
      }
    }
    // 尝试提取最外层的 {}
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        // 忽略
      }
    }
  }
  throw new Error('无法解析 AI 返回的 JSON');
}

// ============================================
// 使用配置的 Provider 生成数据
// ============================================
async function generateWithProvider(prompt: string, count: number, provider: typeof aiProviders.$inferSelect) {
  // 解密 API Key
  const apiKey = decrypt(provider.apiKey);

  // 解析 models(A18:safe parse,坏数据返空数组而非 500)
  let models: string[] = [];
  try { models = JSON.parse(provider.models); } catch { /* 坏数据返空 */ }
  const modelToUse = provider.defaultModel || models[0];

  // SSRF 校验
  if (provider.baseUrl) {
    const check = await validateUrlSafe(provider.baseUrl);
    if (!check.safe) {
      throw new Error(`Base URL rejected: ${check.reason}`);
    }
  }

  // 创建 OpenAI 客户端
  const openai = new OpenAI({
    apiKey,
    baseURL: provider.baseUrl || undefined,
    timeout: 30_000,
  });

  // 使用 Provider 的 System Prompt 或默认 Prompt
  const systemPrompt = provider.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  const userPrompt = `请生成 ${count} 条数据：\n${prompt}`;

  const completion = await openai.chat.completions.create({
    model: modelToUse,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('AI 未返回任何内容');
  }

  // 解析并验证返回的 JSON
  const result = parseAIResponse(content);

  // 验证基本结构
  if (typeof result !== 'object' || result === null) {
    throw new Error('AI 返回的不是有效对象');
  }

  // 上报 token 消耗给预算模块（completion.usage 可能在某些兼容接口缺失）。
  // fallback 时同时估算 prompt+completion，避免低估日预算消耗（A4）。
  const used =
    completion.usage?.total_tokens ??
    Math.ceil((userPrompt.length + systemPrompt.length + content.length) / 4);
  await recordAiUsage(used);
  aiGenerateTotal.inc({ provider: provider.provider, outcome: 'provider' });
  aiCostTokensTotal.inc({ provider: provider.provider }, used);

  return success(result);
}

// ============================================
// POST /api/ai/generate
// ============================================
export async function POST(request: NextRequest) {
  try {
    // 限流：10 req/min/IP
    const ip = getClientIp(request.headers) ?? 'unknown';
    const rl = await rateLimit(`ai:${ip}`, AI_RATE_LIMIT, 60, 'ai');
    if (!rl.allowed) {
      rateLimitRejectedTotal.inc({ kind: 'ai' });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too Many Requests. AI generate limit: 10/min/IP.',
          },
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(AI_RATE_LIMIT),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
          },
        }
      );
    }

    const body = await request.json();
    const { prompt, count, providerId } = validate(GenerateSchema, body);

    // 日预算硬上限（PRD 头号风险：AI 成本失控）。超额直接降级到本地模板。
    const budget = await checkAiBudget();
    if (!budget.allowed) {
      logger.warn({ reason: budget.reason, remaining: budget.remaining }, 'AI budget exhausted, falling back to mock template');
      aiGenerateTotal.inc({ provider: 'none', outcome: 'budget' });
      const mockData = generateMockData(prompt, count);
      return success(mockData);
    }

    // 1. 尝试使用配置的 Provider
    if (providerId) {
      const provider = await db.query.aiProviders.findFirst({
        where: eq(aiProviders.id, providerId),
      });

      if (provider && provider.isActive === 1) {
        try {
          return await generateWithProvider(prompt, count, provider);
        } catch (err) {
          console.error('Error with provider:', err);
          // 失败后继续尝试降级方案
        }
      }
    }

    // 2. 尝试使用默认 Provider
    const defaultProvider = await db.query.aiProviders.findFirst({
      where: eq(aiProviders.isDefault, 1),
    });

    if (defaultProvider && defaultProvider.isActive === 1) {
      try {
        return await generateWithProvider(prompt, count, defaultProvider);
      } catch (err) {
        console.error('Error with default provider:', err);
      }
    }

    // 3. 降级到环境变量或模拟数据
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      const mockData = generateMockData(prompt, count);
      aiGenerateTotal.inc({ provider: 'none', outcome: 'fallback' });
      return success(mockData);
    }

    // 使用环境变量配置的 OpenAI（模型名走环境变量，默认 gpt-4o-mini）
    const openai = new OpenAI({ apiKey, timeout: 30_000 });
    const fallbackModel = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini';

    const userPrompt = `请生成 ${count} 条数据：\n${prompt}`;

    const completion = await openai.chat.completions.create({
      model: fallbackModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI 未返回任何内容');
    }

    // 解析并验证返回的 JSON
    const result = parseAIResponse(content);

    // 验证基本结构
    if (typeof result !== 'object' || result === null) {
      throw new Error('AI 返回的不是有效对象');
    }

    // fallback 时同时估算 prompt+completion，避免低估日预算消耗（A4）
    const used =
      completion.usage?.total_tokens ??
      Math.ceil((userPrompt.length + SYSTEM_PROMPT.length + content.length) / 4);
    await recordAiUsage(used);
    aiGenerateTotal.inc({ provider: 'env-openai', outcome: 'provider' });
    aiCostTokensTotal.inc({ provider: 'env-openai' }, used);

    return success(result);
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      return Errors.validation(err.issues);
    }

    const msg = err instanceof Error ? err.message : String(err);

    // OpenAI API 错误：透传上游状态码（如 4xx），避免坍缩为 500
    if (err && typeof err === 'object' && 'status' in err) {
      const status = (err as { status?: number }).status;
      const body = `AI API error: ${msg}`;
      if (typeof status === 'number') {
        return error('INTERNAL_ERROR', body, status);
      }
      return Errors.internal(body);
    }

    return Errors.internal(msg);
  }
}
