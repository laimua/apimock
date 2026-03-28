/**
 * AI Provider 预设配置
 */

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

/**
 * 获取默认 System Prompt
 */
export const DEFAULT_SYSTEM_PROMPT = `你是 Mock 数据生成专家。根据用户描述生成结构化、语义正确的 JSON Mock 数据。

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
