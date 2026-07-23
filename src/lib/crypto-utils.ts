/**
 * 加密相关工具函数
 */

import { timingSafeEqual } from 'node:crypto';

/**
 * 时间安全的字符串比较。
 * 长度不等直接返回 false（不泄露长度信息）；长度相等时用 timingSafeEqual。
 * 用于 token / 密钥比较，避免计时侧信道。
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
