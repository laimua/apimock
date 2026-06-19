/**
 * Body size limit constants and helper
 * Used by mock service route to reject oversized payloads
 */

export const MAX_BODY_BYTES = 1_000_000; // 1MB

export function isBodyTooLarge(byteLength: number): boolean {
  return byteLength > MAX_BODY_BYTES;
}

/**
 * 计算 UTF-8 字符串的字节长度
 * text.length 是 UTF-16 code unit 数，中文/emoji 实际字节更多
 */
export function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}
