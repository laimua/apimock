# ApiMock 多模型配置功能规格书

## 概述

为 AI 生成 Mock 数据功能添加多模型支持，允许用户配置多个 AI Provider，支持预设模型快速添加和自定义模型配置。

## 需求确认

- ✅ 预设模型：OpenAI、Claude、DeepSeek、智谱 GLM、通义千问、Moonshot Kimi
- ✅ API Key：AES-256 加密存储
- ✅ 模型选择：全局默认 + 临时切换
- ✅ 自定义 System Prompt 支持

---

## 1. 数据库 Schema

### 1.1 新增表：ai_providers

```sql
CREATE TABLE ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                    -- 显示名称
  provider TEXT NOT NULL,                -- 类型：openai | anthropic | openai-compatible
  base_url TEXT,                         -- API 地址
  api_key TEXT NOT NULL,                 -- 加密的 API Key
  models TEXT NOT NULL,                  -- JSON 数组：["gpt-4o", "gpt-4o-mini"]
  default_model TEXT,                    -- 默认模型
  system_prompt TEXT,                    -- 自定义 System Prompt（可选）
  is_active INTEGER DEFAULT 1,           -- 是否启用
  is_default INTEGER DEFAULT 0,          -- 是否为全局默认
  created_at INTEGER,                    -- 创建时间戳
  updated_at INTEGER                     -- 更新时间戳
);
```

### 1.2 Drizzle Schema

文件：`src/lib/schema.ts`

```typescript
export const aiProviders = sqliteTable('ai_providers', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  baseUrl: text('base_url'),
  apiKey: text('api_key').notNull(),
  models: text('models').notNull(), // JSON string
  defaultModel: text('default_model'),
  systemPrompt: text('system_prompt'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
```

---

## 2. 预设模型配置

文件：`src/lib/ai-presets.ts`

```typescript
export interface PresetProvider {
  name: string;
  provider: 'openai' | 'anthropic' | 'openai-compatible';
  baseUrl?: string;
  models: string[];
  defaultModel: string;
  description?: string;
}

export const PRESET_PROVIDERS: PresetProvider[] = [
  {
    name: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o-mini',
    description: 'OpenAI GPT 系列模型',
  },
  {
    name: 'Claude (Anthropic)',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    defaultModel: 'claude-3-5-haiku-20241022',
    description: 'Anthropic Claude 3.5 系列',
  },
  {
    name: 'DeepSeek',
    provider: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder'],
    defaultModel: 'deepseek-chat',
    description: 'DeepSeek 深度求索',
  },
  {
    name: '智谱 GLM',
    provider: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4'],
    defaultModel: 'glm-4-flash',
    description: '智谱清言 GLM 系列',
  },
  {
    name: '通义千问',
    provider: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
    defaultModel: 'qwen-turbo',
    description: '阿里云通义千问',
  },
  {
    name: 'Moonshot Kimi',
    provider: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    defaultModel: 'moonshot-v1-8k',
    description: 'Moonshot AI Kimi',
  },
];
```

---

## 3. 加密工具

文件：`src/lib/encryption.ts`

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32bytes!';

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.scryptSync(KEY, 'salt', 32);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

---

## 4. API 路由

### 4.1 GET /api/ai/providers

获取所有已配置的 Provider

```typescript
// 返回格式
{
  "code": 0,
  "data": [
    {
      "id": "abc123",
      "name": "OpenAI",
      "provider": "openai",
      "models": ["gpt-4o", "gpt-4o-mini"],
      "defaultModel": "gpt-4o-mini",
      "isDefault": true,
      "isActive": true
      // 注意：不返回 apiKey
    }
  ]
}
```

### 4.2 POST /api/ai/providers

添加新 Provider

```typescript
// 请求体
{
  "name": "OpenAI",
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-xxx",
  "models": ["gpt-4o", "gpt-4o-mini"],
  "defaultModel": "gpt-4o-mini",
  "systemPrompt": "自定义提示词（可选）"
}
```

### 4.3 PATCH /api/ai/providers/[id]

更新 Provider（部分更新）

### 4.4 DELETE /api/ai/providers/[id]

删除 Provider

### 4.5 POST /api/ai/providers/[id]/test

测试连接是否可用

```typescript
// 返回
{
  "code": 0,
  "data": {
    "success": true,
    "model": "gpt-4o-mini",
    "response": "Hello! How can I help you?"
  }
}
```

### 4.6 POST /api/ai/providers/[id]/default

设置为默认 Provider

---

## 5. 前端页面结构

### 5.1 页面路由

- `/settings/ai` - AI 模型配置页面

### 5.2 组件结构

```
src/app/settings/ai/page.tsx              # 主页面
src/components/settings/
├── AiSettingsPage.tsx                    # 配置页面主组件
├── ProviderList.tsx                      # 已配置列表
├── PresetProviders.tsx                   # 预设快速添加
├── AddProviderDialog.tsx                 # 添加/编辑弹窗
├── TestConnectionButton.tsx              # 测试连接
└── SystemPromptEditor.tsx                # System Prompt 编辑器
```

### 5.3 页面布局

```
┌─────────────────────────────────────────────────┐
│  AI 模型配置                                      │
├─────────────────────────────────────────────────┤
│  当前默认模型                                     │
│  ┌───────────────────────────────────────────┐  │
│  │ OpenAI (gpt-4o-mini)              [更改]  │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  快速添加预设模型                                 │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│  │OpenAI│ │Claude│ │DeepSeek│ │GLM│ │更多...│  │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘       │
│                                                  │
│  已配置模型                                       │
│  ┌───────────────────────────────────────────┐  │
│  │ OpenAI                                     │  │
│  │ gpt-4o-mini  [默认]  [测试] [编辑] [删除]  │  │
│  ├───────────────────────────────────────────┤  │
│  │ DeepSeek                                   │  │
│  │ deepseek-chat  [测试] [编辑] [删除]        │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  [+ 添加自定义模型]                               │
└─────────────────────────────────────────────────┘
```

---

## 6. AI 生成功能改造

### 6.1 AiGenerateDialog 改造

添加模型选择下拉框：

```tsx
// 新增 props
interface AiGenerateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (data: unknown) => void;
  defaultProviderId?: string;  // 可选：指定默认 Provider
}

// 新增 state
const [selectedProviderId, setSelectedProviderId] = useState<string>('');
const [providers, setProviders] = useState<Provider[]>([]);

// 请求时发送 providerId
const res = await fetch('/api/ai/generate', {
  method: 'POST',
  body: JSON.stringify({ 
    prompt, 
    count, 
    providerId: selectedProviderId || undefined 
  }),
});
```

### 6.2 /api/ai/generate 改造

```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt, count, providerId } = body;

  // 1. 获取 Provider
  let provider;
  if (providerId) {
    provider = await db.query.aiProviders.findFirst({
      where: eq(aiProviders.id, providerId)
    });
  } else {
    provider = await db.query.aiProviders.findFirst({
      where: eq(aiProviders.isDefault, true)
    });
  }

  // 2. 如果没有配置，降级到环境变量或模拟数据
  if (!provider) {
    return fallbackGenerate(prompt, count);
  }

  // 3. 解密 API Key
  const apiKey = decrypt(provider.apiKey);

  // 4. 调用 API
  const openai = new OpenAI({
    apiKey,
    baseURL: provider.baseUrl || undefined,
  });

  const systemPrompt = provider.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  const completion = await openai.chat.completions.create({
    model: provider.defaultModel || provider.models[0],
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请生成 ${count} 条数据：\n${prompt}` },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  // 5. 解析返回
  // ...
}
```

---

## 7. 实施步骤

### Phase 1: 数据库与工具（0.5 天）
- [ ] 添加 `ai_providers` 表到 schema.ts
- [ ] 创建数据库迁移
- [ ] 实现 encryption.ts 加密工具
- [ ] 创建 ai-presets.ts 预设配置

### Phase 2: 后端 API（1 天）
- [ ] GET /api/ai/providers
- [ ] POST /api/ai/providers
- [ ] PATCH /api/ai/providers/[id]
- [ ] DELETE /api/ai/providers/[id]
- [ ] POST /api/ai/providers/[id]/test
- [ ] POST /api/ai/providers/[id]/default

### Phase 3: 前端配置页面（1.5 天）
- [ ] 创建 /settings/ai 路由
- [ ] ProviderList 组件
- [ ] PresetProviders 组件
- [ ] AddProviderDialog 组件
- [ ] TestConnectionButton 组件
- [ ] SystemPromptEditor 组件

### Phase 4: AI 生成改造（0.5 天）
- [ ] 改造 /api/ai/generate 支持多 Provider
- [ ] 改造 AiGenerateDialog 添加模型选择
- [ ] 添加全局默认 + 临时切换逻辑

### Phase 5: 测试与文档（0.5 天）
- [ ] E2E 测试用例
- [ ] 更新 README 文档

---

## 8. 注意事项

### 8.1 安全
- API Key 加密存储，前端不暴露
- 测试连接添加频率限制
- 删除 Provider 需要二次确认

### 8.2 用户体验
- 预设模型点击后只需输入 API Key
- 支持快速切换默认模型
- 测试连接显示加载状态和结果

### 8.3 兼容性
- 保留环境变量配置方式作为降级
- 所有 Provider 使用 OpenAI SDK（兼容模式）

---

## 9. 默认 System Prompt

保留现有的 Mock 数据生成 System Prompt：

```
你是 Mock 数据生成专家。根据用户描述生成结构化、语义正确的 JSON Mock 数据。

字段类型映射：
- id/ID → 递增整数
- 姓名/名字 → 中文姓名
- 邮箱/email → {name}{n}@example.com
...
```

允许用户自定义覆盖。
