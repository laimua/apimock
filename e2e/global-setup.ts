/**
 * Playwright global setup:登录种 cookie,供所有 E2E 测试共享
 *
 * G1 鉴权上线后,管理面需要 MANAGE_TOKEN 登录。E2E 在 CI 设
 * MANAGE_TOKEN=e2e-test-token,这里 POST /api/auth/login 拿 cookie
 * 存到 storageState 文件,所有测试通过 config 的 storageState 加载。
 */
import { request, expect, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const TOKEN = process.env.MANAGE_TOKEN;
const STATE_FILE = 'e2e/.auth/state.json';

export default async function globalSetup(config: FullConfig) {
  // 未配置 token(本地无鉴权场景):跳过登录,测试按无鉴权跑
  if (!TOKEN) {
    console.log('[global-setup] No MANAGE_TOKEN, skipping auth');
    return;
  }

  const { baseURL } = config.projects[0].use;
  const apiContext = await request.newContext({ baseURL });

  const resp = await apiContext.post('/api/auth/login', {
    data: { token: TOKEN },
  });
  expect(resp.ok(), `global-setup login failed: ${resp.status()}`).toBeTruthy();

  // 导出 cookie 到 storageState 文件
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  await apiContext.storageState({ path: STATE_FILE });
  console.log(`[global-setup] Logged in, state saved to ${STATE_FILE}`);
  await apiContext.dispose();
}

