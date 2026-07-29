/**
 * README 截图生成脚本
 *
 * 用 Playwright 启动独立 chromium,登录后截项目详情页 / 端点编辑页 / 移动端视图,
 * 覆盖 README 引用的 screenshot-*.png。
 *
 * 运行前提:dev server 已在 http://localhost:3000 运行(用干净 sqlite 库)。
 *
 * 用法:
 *   DB_TYPE=sqlite SQLITE_PATH=./data/apimock.db pnpm dev   # 先起干净 server
 *   node scripts/screenshot-readme.mjs                       # 另开终端跑截图
 */
import { chromium, request } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TOKEN = process.env.MANAGE_TOKEN || '123123123';
const DEMO_PROJECT_ID = process.env.DEMO_PROJECT_ID || 'brNWNFIMLomemrD8n_tjS';
const DEMO_ENDPOINT_ID = process.env.DEMO_ENDPOINT_ID || 'B9A7ntESvUry1JsenNn62'; // /users
const OUT_DIR = process.env.OUT_DIR || '.';

async function main() {
  console.log('[screenshot] 启动 chromium...');
  const browser = await chromium.launch({ headless: true });

  // 登录拿 cookie
  console.log('[screenshot] 登录获取 session cookie...');
  const apiContext = await request.newContext({ baseURL: BASE });
  const loginResp = await apiContext.post('/api/auth/login', { data: { token: TOKEN } });
  if (!loginResp.ok()) {
    throw new Error(`登录失败: ${loginResp.status()} ${await loginResp.text()}`);
  }
  const state = await apiContext.storageState();
  const cookies = state.cookies;
  await apiContext.dispose();
  console.log(`[screenshot] 登录成功,拿到 ${cookies.length} 个 cookie`);

  // 桌面 + 移动各一个 context
  const desktopCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: { cookies, origins: state.origins },
    deviceScaleFactor: 2, // 高清,README 更清晰
  });
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: { cookies, origins: state.origins },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const desktopPage = await desktopCtx.newPage();
  const mobilePage = await mobileCtx.newPage();

  // ---------- 1. 桌面:项目详情页(端点列表) ----------
  console.log('[screenshot] 1/3 桌面 - 项目详情页...');
  await desktopPage.goto(`${BASE}/projects/${DEMO_PROJECT_ID}`, { waitUntil: 'networkidle' });
  await desktopPage.waitForTimeout(1500); // 等端点列表/动画渲染完
  const detailShot = await desktopPage.screenshot();
  writeFileSync(`${OUT_DIR}/screenshot-desktop.png`, detailShot);
  console.log(`  -> ${OUT_DIR}/screenshot-desktop.png (${detailShot.length} bytes)`);

  // ---------- 2. 桌面:端点编辑页(/users) ----------
  console.log('[screenshot] 2/3 桌面 - 端点编辑页...');
  await desktopPage.goto(
    `${BASE}/projects/${DEMO_PROJECT_ID}/endpoints/${DEMO_ENDPOINT_ID}`,
    { waitUntil: 'networkidle' }
  );
  await desktopPage.waitForTimeout(1500);
  const endpointShot = await desktopPage.screenshot();
  writeFileSync(`${OUT_DIR}/screenshot-new-endpoint.png`, endpointShot);
  console.log(`  -> ${OUT_DIR}/screenshot-new-endpoint.png (${endpointShot.length} bytes)`);

  // ---------- 3. 移动:项目详情页 ----------
  console.log('[screenshot] 3/3 移动 - 项目详情页...');
  await mobilePage.goto(`${BASE}/projects/${DEMO_PROJECT_ID}`, { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(1500);
  const mobileShot = await mobilePage.screenshot();
  writeFileSync(`${OUT_DIR}/screenshot-mobile.png`, mobileShot);
  console.log(`  -> ${OUT_DIR}/screenshot-mobile.png (${mobileShot.length} bytes)`);

  await browser.close();
  console.log('[screenshot] 完成 ✅');
}

main().catch((err) => {
  console.error('[screenshot] 失败:', err);
  process.exit(1);
});
