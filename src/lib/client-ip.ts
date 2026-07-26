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
 *
 * P2-28: `TRUST_PROXY` 开关控制是否信任代理头。
 *   - `TRUST_PROXY=true`(默认):信任 X-Real-IP/XFF,适用于 PaaS(Railway/Fly/Render)
 *     或反代覆写头的部署。
 *   - `TRUST_PROXY=false`:不信任任何代理头,所有请求 IP 视为 unknown(下游限流
 *     全归同一桶)。用于直连部署(无反代覆写),防客户端伪造 IP 轮换绕限流。
 */

// P2-28: 函数内读 env(非模块级 const),以便测试能动态切换;
// 热路径开销可接受(每次请求一次字符串比较)。默认信任(PaaS 部署)。
function trustProxy(): boolean {
  return process.env.TRUST_PROXY !== 'false';
}

export function getClientIp(headers: Headers): string | null {
  // P2-28: 直连部署(TRUST_PROXY=false)忽略所有代理头,防伪造
  if (!trustProxy()) return null;

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
