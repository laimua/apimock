/**
 * AI 生成 Mock 数据 API
 * POST /api/ai/generate - 根据用户描述生成 JSON Mock 数据
 */

import { NextRequest } from 'next/server';
import { success, Errors, validate } from '@/lib/api';
import { z } from 'zod';
import OpenAI from 'openai';
import { db } from '@/lib/db';
import { aiProviders } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '@/lib/encryption';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/ai-presets';

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
// 工具函数：生成模拟数据（当没有 API Key 时）
// ============================================
function generateMockData(prompt: string, count: number) {
  // 根据关键词推断数据类型
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes('用户') || lowerPrompt.includes('user')) {
    return {
      code: 0,
      message: 'success',
      data: {
        list: Array.from({ length: count }, (_, i) => ({
          id: i + 1,
          name: ['张伟', '李娜', '王芳', '刘洋', '陈静'][i % 5],
          email: `user${i + 1}@example.com`,
          phone: `138${String(i).padStart(8, '0')}`,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 1}`,
          status: ['active', 'inactive'][i % 2],
          createdAt: new Date(Date.now() - i * 86400000).toISOString(),
        })),
        total: count,
      },
    };
  }

  if (lowerPrompt.includes('商品') || lowerPrompt.includes('产品') || lowerPrompt.includes('product')) {
    return {
      code: 0,
      message: 'success',
      data: {
        list: Array.from({ length: count }, (_, i) => ({
          id: i + 1,
          name: `商品 ${i + 1}`,
          price: (Math.random() * 1000 + 10).toFixed(2),
          stock: Math.floor(Math.random() * 100),
          status: ['on_sale', 'out_of_stock'][i % 2],
          createdAt: new Date(Date.now() - i * 86400000).toISOString(),
        })),
        total: count,
      },
    };
  }

  if (lowerPrompt.includes('订单') || lowerPrompt.includes('order')) {
    return {
      code: 0,
      message: 'success',
      data: {
        list: Array.from({ length: count }, (_, i) => ({
          id: i + 1,
          orderNo: `ORD${Date.now() - i * 1000}${i}`,
          amount: (Math.random() * 5000 + 50).toFixed(2),
          status: ['pending', 'paid', 'shipped', 'completed'][i % 4],
          createdAt: new Date(Date.now() - i * 3600000).toISOString(),
        })),
        total: count,
      },
    };
  }

  // 默认通用数据
  return {
    code: 0,
    message: 'success',
    data: {
      list: Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
        description: `Description ${i + 1}`,
        createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      })),
      total: count,
    },
  };
}

// ============================================
// 使用配置的 Provider 生成数据
// ============================================
async function generateWithProvider(prompt: string, count: number, provider: any) {
  // 解密 API Key
  const apiKey = decrypt(provider.apiKey);

  // 解析 models
  const models = JSON.parse(provider.models);
  const modelToUse = provider.defaultModel || models[0];

  // 创建 OpenAI 客户端
  const openai = new OpenAI({
    apiKey,
    baseURL: provider.baseUrl || undefined,
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

  return success(result);
}

// ============================================
// POST /api/ai/generate
// ============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, count, providerId } = validate(GenerateSchema, body);

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
      return success(mockData);
    }

    // 使用环境变量配置的 OpenAI
    const openai = new OpenAI({ apiKey });

    const userPrompt = `请生成 ${count} 条数据：\n${prompt}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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

    return success(result);
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      return Errors.validation(err.issues);
    }

    // OpenAI API 错误
    if (err.status) {
      return Errors.internal(`AI API 错误: ${err.message}`);
    }

    return Errors.internal(err.message);
  }
}
