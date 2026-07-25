import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // G1 鉴权:globalSetup 登录种 cookie,所有测试共享(有 MANAGE_TOKEN 时)
  globalSetup: process.env.MANAGE_TOKEN ? './e2e/global-setup.ts' : undefined,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // CI 用 list（打印每个测试名 + 失败断言到 stdout 便于日志诊断）
  // 本地用 html（可视化）
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    // G1 鉴权:加载 globalSetup 存的 cookie(有 MANAGE_TOKEN 时)
    storageState: process.env.MANAGE_TOKEN ? './e2e/.auth/state.json' : undefined,
    // 诊断模式：所有 run 都留 trace + screenshot + video，失败立即可查
    // 定位完测试问题后可收紧回 'on-first-retry'
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // CI 测 production 产物（pnpm build 已跑），本地测 dev server
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
