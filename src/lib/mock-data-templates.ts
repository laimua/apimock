/**
 * Mock data templates (fallback when no AI provider configured)
 *
 * Used by:
 *   - src/app/api/ai/generate/route.ts (AI generate fallback)
 *   - scripts/seed-demo.ts (seed demo-project)
 *
 * DRY: extracted from route.ts to avoid scripts/ importing Next.js route module
 */

export interface MockDataItem {
  id: number;
  [key: string]: unknown;
}

export interface MockDataResponse {
  code: number;
  message: string;
  data: {
    list: MockDataItem[];
    total: number;
  };
}

/**
 * 根据 prompt 关键词生成模拟数据
 * @param prompt 自然语言描述
 * @param count 数据条数
 */
export function generateMockData(prompt: string, count: number): MockDataResponse {
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
