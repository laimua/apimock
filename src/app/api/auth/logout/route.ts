/**
 * 登出路由
 * POST /api/auth/logout — 清除会话 cookie
 *
 * 注:HMAC cookie 是 stateless,/logout 只清浏览器本地 cookie。
 * 偷到的 cookie 在别处仍有效到过期(1 天)。要即时吊销需服务端列表(v2)。
 */

import { success } from '@/lib/api';
import { COOKIE_NAME } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return success({ ok: true });
}
