/**
 * Mock 模板库配置
 * 提供常用响应模板供一键应用
 */

export interface MockTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  content: unknown;
}

export type TemplateCategory =
  | 'user'      // 用户相关
  | 'product'   // 商品相关
  | 'pagination' // 分页数据
  | 'error'     // 错误响应
  | 'success'   // 通用成功
  | 'list';     // 列表数据

export const TEMPLATE_CATEGORIES: Record<TemplateCategory, { name: string; description: string }> = {
  user: { name: '用户相关', description: '用户信息、登录等用户相关模板' },
  product: { name: '商品相关', description: '商品信息、商品列表等模板' },
  pagination: { name: '分页数据', description: '通用分页响应格式' },
  error: { name: '错误响应', description: '常见错误响应格式' },
  success: { name: '通用成功', description: '标准成功响应格式' },
  list: { name: '列表数据', description: '通用列表数据格式' },
};

/**
 * 所有 Mock 模板
 */
export const MOCK_TEMPLATES: MockTemplate[] = [
  // ==================== 用户相关 ====================
  {
    id: 'user-info',
    name: '用户信息',
    description: '单个用户的详细信息',
    category: 'user',
    content: {
      code: 200,
      message: 'success',
      data: {
        id: 1001,
        username: 'john_doe',
        email: 'john@example.com',
        nickname: 'John',
        avatar: 'https://api.example.com/avatars/1001.png',
        role: 'user',
        status: 'active',
        createdAt: '2024-01-15T08:30:00Z',
        updatedAt: '2024-03-08T14:20:00Z',
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          bio: 'Software developer and open source enthusiast',
          location: 'San Francisco, CA',
          website: 'https://johndoe.com',
        },
        settings: {
          language: 'en-US',
          timezone: 'America/Los_Angeles',
          notifications: {
            email: true,
            push: false,
            sms: true,
          },
        },
      },
    },
  },
  {
    id: 'user-list',
    name: '用户列表',
    description: '用户列表数据（带分页）',
    category: 'user',
    content: {
      code: 200,
      message: 'success',
      data: {
        items: [
          {
            id: 1001,
            username: 'john_doe',
            email: 'john@example.com',
            nickname: 'John',
            avatar: 'https://api.example.com/avatars/1001.png',
            role: 'admin',
            status: 'active',
            createdAt: '2024-01-15T08:30:00Z',
          },
          {
            id: 1002,
            username: 'jane_smith',
            email: 'jane@example.com',
            nickname: 'Jane',
            avatar: 'https://api.example.com/avatars/1002.png',
            role: 'user',
            status: 'active',
            createdAt: '2024-02-20T10:15:00Z',
          },
          {
            id: 1003,
            username: 'bob_wilson',
            email: 'bob@example.com',
            nickname: 'Bob',
            avatar: 'https://api.example.com/avatars/1003.png',
            role: 'user',
            status: 'inactive',
            createdAt: '2024-03-01T16:45:00Z',
          },
        ],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 156,
          totalPages: 8,
        },
      },
    },
  },
  {
    id: 'login-success',
    name: '登录成功',
    description: '用户登录成功响应',
    category: 'user',
    content: {
      code: 200,
      message: 'Login successful',
      data: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
        refreshToken: 'refresh_token_here',
        expiresIn: 7200,
        user: {
          id: 1001,
          username: 'john_doe',
          email: 'john@example.com',
          nickname: 'John',
          avatar: 'https://api.example.com/avatars/1001.png',
          role: 'admin',
        },
      },
    },
  },
  {
    id: 'login-failed',
    name: '登录失败',
    description: '用户名或密码错误',
    category: 'user',
    content: {
      code: 401,
      message: 'Authentication failed',
      data: null,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      },
    },
  },
  {
    id: 'register-success',
    name: '注册成功',
    description: '用户注册成功响应',
    category: 'user',
    content: {
      code: 201,
      message: 'Registration successful',
      data: {
        user: {
          id: 1004,
          username: 'new_user',
          email: 'newuser@example.com',
          nickname: 'New User',
          avatar: 'https://api.example.com/avatars/default.png',
          role: 'user',
          status: 'active',
          createdAt: '2024-03-08T10:00:00Z',
        },
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new_token',
        expiresIn: 7200,
      },
    },
  },

  // ==================== 商品相关 ====================
  {
    id: 'product-info',
    name: '商品信息',
    description: '单个商品的详细信息',
    category: 'product',
    content: {
      code: 200,
      message: 'success',
      data: {
        id: 'PROD-001',
        name: 'Wireless Bluetooth Headphones',
        description: 'Premium noise-cancelling wireless headphones with 30-hour battery life',
        price: 149.99,
        originalPrice: 199.99,
        currency: 'USD',
        discount: 25,
        stock: 150,
        sku: 'WBH-BLK-001',
        images: [
          'https://api.example.com/products/prod-001-1.jpg',
          'https://api.example.com/products/prod-001-2.jpg',
          'https://api.example.com/products/prod-001-3.jpg',
        ],
        category: {
          id: 'CAT-001',
          name: 'Audio',
          slug: 'audio',
        },
        brand: {
          id: 'BRAND-001',
          name: 'SoundPro',
        },
        attributes: [
          { name: 'Color', value: 'Black' },
          { name: 'Connectivity', value: 'Bluetooth 5.2' },
          { name: 'Battery Life', value: '30 hours' },
        ],
        ratings: {
          average: 4.5,
          count: 342,
        },
        reviews: 342,
        createdAt: '2024-01-10T00:00:00Z',
        updatedAt: '2024-03-05T00:00:00Z',
      },
    },
  },
  {
    id: 'product-list',
    name: '商品列表',
    description: '商品列表数据（带筛选和分页）',
    category: 'product',
    content: {
      code: 200,
      message: 'success',
      data: {
        items: [
          {
            id: 'PROD-001',
            name: 'Wireless Bluetooth Headphones',
            price: 149.99,
            originalPrice: 199.99,
            currency: 'USD',
            discount: 25,
            stock: 150,
            image: 'https://api.example.com/products/prod-001-thumb.jpg',
            category: 'Audio',
            rating: 4.5,
          },
          {
            id: 'PROD-002',
            name: 'USB-C Charging Cable',
            price: 12.99,
            originalPrice: null,
            currency: 'USD',
            discount: 0,
            stock: 500,
            image: 'https://api.example.com/products/prod-002-thumb.jpg',
            category: 'Accessories',
            rating: 4.2,
          },
          {
            id: 'PROD-003',
            name: 'Laptop Stand Aluminum',
            price: 49.99,
            originalPrice: 69.99,
            currency: 'USD',
            discount: 29,
            stock: 75,
            image: 'https://api.example.com/products/prod-003-thumb.jpg',
            category: 'Accessories',
            rating: 4.7,
          },
        ],
        filters: {
          category: 'all',
          minPrice: 0,
          maxPrice: 1000,
          sortBy: 'popular',
        },
        pagination: {
          page: 1,
          pageSize: 20,
          total: 256,
          totalPages: 13,
        },
      },
    },
  },

  // ==================== 分页数据 ====================
  {
    id: 'pagination-empty',
    name: '空分页',
    description: '无数据的分页响应',
    category: 'pagination',
    content: {
      code: 200,
      message: 'success',
      data: {
        items: [],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        },
      },
    },
  },
  {
    id: 'pagination-single',
    name: '单页数据',
    description: '只有一页的分页响应',
    category: 'pagination',
    content: {
      code: 200,
      message: 'success',
      data: {
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
          { id: 3, name: 'Item 3' },
        ],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 3,
          totalPages: 1,
        },
      },
    },
  },
  {
    id: 'pagination-multi',
    name: '多页数据',
    description: '多页数据的分页响应',
    category: 'pagination',
    content: {
      code: 200,
      message: 'success',
      data: {
        items: Array.from({ length: 20 }, (_, i) => ({
          id: i + 1,
          name: `Item ${i + 1}`,
        })),
        pagination: {
          page: 1,
          pageSize: 20,
          total: 157,
          totalPages: 8,
        },
      },
    },
  },
  {
    id: 'pagination-cursor',
    name: '游标分页',
    description: '基于游标的分页响应',
    category: 'pagination',
    content: {
      code: 200,
      message: 'success',
      data: {
        items: [
          { id: 'cursor_abc', name: 'Item 1' },
          { id: 'cursor_def', name: 'Item 2' },
          { id: 'cursor_ghi', name: 'Item 3' },
        ],
        pagination: {
          nextCursor: 'cursor_ghi',
          hasMore: true,
          limit: 3,
        },
      },
    },
  },

  // ==================== 错误响应 ====================
  {
    id: 'error-400',
    name: '400 请求错误',
    description: '错误的请求参数',
    category: 'error',
    content: {
      code: 400,
      message: 'Bad Request',
      data: null,
      error: {
        code: 'INVALID_PARAMETER',
        message: 'The request contains invalid parameters',
        details: [
          {
            field: 'email',
            message: 'Email format is invalid',
          },
          {
            field: 'age',
            message: 'Age must be a positive integer',
          },
        ],
      },
    },
  },
  {
    id: 'error-401',
    name: '401 未授权',
    description: '未认证的访问请求',
    category: 'error',
    content: {
      code: 401,
      message: 'Unauthorized',
      data: null,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication is required to access this resource',
      },
    },
  },
  {
    id: 'error-403',
    name: '403 禁止访问',
    description: '无权限访问资源',
    category: 'error',
    content: {
      code: 403,
      message: 'Forbidden',
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this resource',
      },
    },
  },
  {
    id: 'error-404',
    name: '404 未找到',
    description: '资源不存在',
    category: 'error',
    content: {
      code: 404,
      message: 'Not Found',
      data: null,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource does not exist',
      },
    },
  },
  {
    id: 'error-409',
    name: '409 冲突',
    description: '资源冲突（如重复创建）',
    category: 'error',
    content: {
      code: 409,
      message: 'Conflict',
      data: null,
      error: {
        code: 'RESOURCE_CONFLICT',
        message: 'A resource with this identifier already exists',
        details: {
          field: 'email',
          value: 'existing@example.com',
        },
      },
    },
  },
  {
    id: 'error-422',
    name: '422 验证失败',
    description: '请求体验证失败',
    category: 'error',
    content: {
      code: 422,
      message: 'Validation Failed',
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request body contains validation errors',
        details: [
          {
            field: 'password',
            message: 'Password must be at least 8 characters long',
          },
          {
            field: 'confirmPassword',
            message: 'Passwords do not match',
          },
        ],
      },
    },
  },
  {
    id: 'error-429',
    name: '429 请求过多',
    description: '超过请求频率限制',
    category: 'error',
    content: {
      code: 429,
      message: 'Too Many Requests',
      data: null,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'You have exceeded the rate limit',
        details: {
          limit: 100,
          remaining: 0,
          resetAt: '2024-03-08T15:00:00Z',
        },
      },
    },
  },
  {
    id: 'error-500',
    name: '500 服务器错误',
    description: '服务器内部错误',
    category: 'error',
    content: {
      code: 500,
      message: 'Internal Server Error',
      data: null,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again later.',
      },
    },
  },
  {
    id: 'error-503',
    name: '503 服务不可用',
    description: '服务暂时不可用',
    category: 'error',
    content: {
      code: 503,
      message: 'Service Unavailable',
      data: null,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is temporarily unavailable. Please try again later.',
        details: {
          retryAfter: 60, // seconds
        },
      },
    },
  },

  // ==================== 通用成功 ====================
  {
    id: 'success-simple',
    name: '简单成功',
    description: '最简单的成功响应',
    category: 'success',
    content: {
      code: 200,
      message: 'success',
      data: null,
    },
  },
  {
    id: 'success-with-data',
    name: '成功带数据',
    description: '带返回数据的成功响应',
    category: 'success',
    content: {
      code: 200,
      message: 'Operation completed successfully',
      data: {
        id: 123,
        name: 'Example Item',
        status: 'completed',
        createdAt: '2024-03-08T10:00:00Z',
      },
    },
  },
  {
    id: 'success-created',
    name: '创建成功',
    description: '资源创建成功响应（201）',
    category: 'success',
    content: {
      code: 201,
      message: 'Resource created successfully',
      data: {
        id: 456,
        location: '/api/resources/456',
        createdAt: '2024-03-08T10:00:00Z',
      },
    },
  },
  {
    id: 'success-updated',
    name: '更新成功',
    description: '资源更新成功响应',
    category: 'success',
    content: {
      code: 200,
      message: 'Resource updated successfully',
      data: {
        id: 456,
        updatedAt: '2024-03-08T10:30:00Z',
        changes: {
          fields: ['name', 'status'],
          previousValues: {
            name: 'Old Name',
            status: 'pending',
          },
          newValues: {
            name: 'New Name',
            status: 'completed',
          },
        },
      },
    },
  },
  {
    id: 'success-deleted',
    name: '删除成功',
    description: '资源删除成功响应',
    category: 'success',
    content: {
      code: 200,
      message: 'Resource deleted successfully',
      data: {
        id: 456,
        deletedAt: '2024-03-08T11:00:00Z',
      },
    },
  },
  {
    id: 'success-batch',
    name: '批量操作成功',
    description: '批量操作成功响应',
    category: 'success',
    content: {
      code: 200,
      message: 'Batch operation completed',
      data: {
        total: 10,
        succeeded: 8,
        failed: 2,
        results: [
          { id: 1, status: 'success' },
          { id: 2, status: 'success' },
          { id: 3, status: 'failed', error: 'Invalid data' },
        ],
      },
    },
  },

  // ==================== 列表数据 ====================
  {
    id: 'list-simple',
    name: '简单列表',
    description: '不带分页的简单列表',
    category: 'list',
    content: {
      code: 200,
      message: 'success',
      data: [
        { id: 1, name: 'Item 1', value: 'A' },
        { id: 2, name: 'Item 2', value: 'B' },
        { id: 3, name: 'Item 3', value: 'C' },
        { id: 4, name: 'Item 4', value: 'D' },
        { id: 5, name: 'Item 5', value: 'E' },
      ],
    },
  },
  {
    id: 'list-tree',
    name: '树形列表',
    description: '树形结构的数据列表',
    category: 'list',
    content: {
      code: 200,
      message: 'success',
      data: [
        {
          id: 1,
          name: 'Parent 1',
          children: [
            { id: 11, name: 'Child 1-1' },
            { id: 12, name: 'Child 1-2' },
          ],
        },
        {
          id: 2,
          name: 'Parent 2',
          children: [
            {
              id: 21,
              name: 'Child 2-1',
              children: [
                { id: 211, name: 'Child 2-1-1' },
                { id: 212, name: 'Child 2-1-2' },
              ],
            },
            { id: 22, name: 'Child 2-2' },
          ],
        },
        {
          id: 3,
          name: 'Parent 3',
          children: [],
        },
      ],
    },
  },
  {
    id: 'list-grouped',
    name: '分组列表',
    description: '按字段分组的列表数据',
    category: 'list',
    content: {
      code: 200,
      message: 'success',
      data: {
        groups: [
          {
            key: 'active',
            label: 'Active',
            count: 5,
            items: [
              { id: 1, name: 'Task 1', status: 'active' },
              { id: 2, name: 'Task 2', status: 'active' },
            ],
          },
          {
            key: 'completed',
            label: 'Completed',
            count: 3,
            items: [
              { id: 3, name: 'Task 3', status: 'completed' },
            ],
          },
        ],
      },
    },
  },
];

/**
 * 根据分类获取模板
 */
export function getTemplatesByCategory(category: TemplateCategory): MockTemplate[] {
  return MOCK_TEMPLATES.filter((t) => t.category === category);
}

/**
 * 根据 ID 获取模板
 */
export function getTemplateById(id: string): MockTemplate | undefined {
  return MOCK_TEMPLATES.find((t) => t.id === id);
}

/**
 * 将模板内容转换为格式化的 JSON 字符串
 */
export function formatTemplateContent(template: MockTemplate): string {
  return JSON.stringify(template.content, null, 2);
}
