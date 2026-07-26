import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// 格式化日期
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 复制文本到剪贴板
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 安全解析端点 tags 字段。
 *
 * DB 中 tags 约定为 JSON 字符串数组(如 `["foo","bar"]`),但历史数据/外部导入
 * 可能写入任意字符串。本函数防御性解析:解析失败或非数组一律返回 []。
 *
 * 用于公开分享页、端点编辑页等渲染入口,避免脏数据导致 JSON.parse 抛错白屏。
 */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    return [];
  }
}

/**
 * 将逗号分隔的输入字符串归一化为 tag 数组:trim、去空、去重。
 * 用于标签输入框 blur/submit 时把临时字符串落盘为标准数组。
 */
export function splitTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(',')) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * 从统一错误响应对象里读取 message。形状契约见 docs/API-ERROR-SHAPE.md:
 * `{ success: false, error: { code, message, details? } }`。
 * 无需兼容字符串 error 形态(后端已清理)。兜底返回 fallback。
 */
export function readErrorMessage(
  json: { error?: { code?: string; message?: string } } | undefined | null,
  fallback = '操作失败',
): string {
  return json?.error?.message ?? fallback;
}

/**
 * 切换 Content-Type 时决定新的响应体。
 *
 * 旧实现无条件替换为 DEFAULT_RESPONSES[newType],会清空用户已编写的响应体。
 * 新规则:仅当当前 body 为空,或等于"当前 content-type 的默认模板"时才替换;
 * 否则保留原文(用户已经写了内容,不要静默清空)。
 *
 * @param currentBody 当前响应体
 * @param currentContentType 当前 content-type(用于判断当前 body 是否为模板)
 * @param newContentType 即将切到的 content-type
 * @param defaultResponses 各 content-type 的默认模板字典
 */
export function resolveBodyOnContentTypeChange(
  currentBody: string,
  currentContentType: string,
  newContentType: string,
  defaultResponses: Record<string, string>,
): string {
  const currentDefault = defaultResponses[currentContentType] ?? '';
  // body 为空 或 等于当前类型的默认模板 → 视为"用户未自定义",可安全替换
  if (currentBody.trim() === '' || currentBody === currentDefault) {
    return defaultResponses[newContentType] ?? '';
  }
  // 用户已写内容,保留
  return currentBody;
}

/**
 * 构造带 query 参数的完整 URL。
 *
 * P2-49:原实现 `queryParams ? \`${url}?${qs}\` : url` 中 queryParams 初始为
 * `{}`(truthy),导致无参数时 fullUrl 恒带尾部 `?`。本函数以"是否有非空键"为
 * 判定标准,空对象 / null / undefined 一律不带 `?`。
 *
 * @param baseUrl 不含 query 的基础 URL(可含 path)
 * @param queryParams query 参数对象;值为空串的键仍保留(空串也是合法值)
 */
export function buildFullUrl(
  baseUrl: string,
  queryParams?: Record<string, string> | null,
): string {
  if (!queryParams) return baseUrl;
  const keys = Object.keys(queryParams);
  if (keys.length === 0) return baseUrl;
  const qs = new URLSearchParams(queryParams).toString();
  return qs.length > 0 ? `${baseUrl}?${qs}` : baseUrl;
}


