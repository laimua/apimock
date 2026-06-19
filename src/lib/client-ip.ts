/**
 * 提取真实客户端 IP（防伪造）
 *
 * 攻击场景：恶意客户端发 `X-Forwarded-For: <fake-ip>` 绕过限流。
 *
 * 防护：
 *   1. 优先 `X-Real-IP`（Railway/Cloudflare 等 trusted proxy 注入，不可伪造）
 *   2. `X-Forwarded-For` 取链尾 IP（最接近 trusted proxy 的 hop，由 proxy 追加，攻击者无法污染）
 *
 * 注意：X-Forwarded-For 链头的 IP 可被客户端伪造，必须忽略。
 */

export function getClientIp(headers: Headers): string | null {
  // 1. X-Real-IP（trusted proxy 注入）
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  // 2. X-Forwarded-For 链尾
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  return null;
}
