/**
 * Test Provider Connection API
 * POST /api/ai/providers/[id]/test - 测试 Provider 连接是否可用
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { db } from '@/lib/db';
import { aiProviders } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '@/lib/encryption';
import OpenAI from 'openai';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/ai-presets';

// ============================================
// POST /api/ai/providers/[id]/test
// ============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 获取 provider
    const provider = await db.query.aiProviders.findFirst({
      where: eq(aiProviders.id, id),
    });

    if (!provider) {
      return Errors.notFound('Provider');
    }

    // 解密 API Key
    let apiKey: string;
    try {
      apiKey = decrypt(provider.apiKey);
    } catch (err) {
      return Errors.internal('Failed to decrypt API key');
    }

    // 解析 models
    const models = JSON.parse(provider.models);
    const modelToTest = provider.defaultModel || models[0];

    // 创建 OpenAI 客户端
    const openai = new OpenAI({
      apiKey,
      baseURL: provider.baseUrl || undefined,
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

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      return success(
        {
          success: false,
          model: modelToTest,
          error: 'No response from AI',
        },
        200
      );
    }

    return success({
      success: true,
      model: modelToTest,
      response: response.substring(0, 200), // 截断过长响应
    });
  } catch (err: any) {
    console.error('Error testing provider:', err);

    // OpenAI API 错误
    if (err.status || err.code) {
      return success(
        {
          success: false,
          error: err.message || 'API request failed',
        },
        200
      );
    }

    return Errors.internal('Failed to test provider connection');
  }
}
