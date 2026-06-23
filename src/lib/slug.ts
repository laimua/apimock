/**
 * Slug 公共模块：前后端共用，避免正则/保留字漂移。
 *
 * 用法：
 * - 前端：import { generateSlug, validateSlugFormat, isReservedSlug }
 * - 后端：import { SLUG_REGEX, RESERVED_SLUGS, MAX_SLUG_LENGTH, generateSlug, isReservedSlug }
 */

export const SLUG_REGEX = /^[a-z0-9-]+$/;

export const MAX_SLUG_LENGTH = 100;

/**
 * 保留字：与 Next.js 顶层应用路由段冲突的 slug 必须拒绝。
 * slug 正则 `^[a-z0-9-]+$` 已天然排除带下划线的 `_next` 等。
 */
export const RESERVED_SLUGS = ['api', 'projects', 'share', 'settings', 'demo-project'];

/**
 * 从项目名生成 slug：小写化 + 非 [a-z0-9] 替换为连字符 + 去首尾连字符。
 * 纯中文/CJK 输入会产出空字符串，调用方需自行处理。
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug);
}

/** 形态校验，返回 true/false */
export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug) && slug.length > 0 && slug.length <= MAX_SLUG_LENGTH;
}

/** 形态校验，返回错误消息（无错返回 undefined）。供前端表单 onBlur 使用。 */
export function validateSlugFormat(slug: string): string | undefined {
  if (!slug.trim()) return 'Slug 不能为空';
  if (!SLUG_REGEX.test(slug)) return 'Slug 只能包含小写字母、数字和连字符';
  if (slug.length > MAX_SLUG_LENGTH) return `Slug 不能超过 ${MAX_SLUG_LENGTH} 字符`;
  return undefined;
}
