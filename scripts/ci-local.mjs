#!/usr/bin/env node
/**
 * 本地 CI 复现脚本
 *
 * 按 CI 完全相同的环境和顺序跑：install → playwright install → db:push →
 * build → playwright test (CI=true 触发 production server + no reuse + retries=0)
 *
 * 用法：node scripts/ci-local.mjs
 *   或 package.json: pnpm ci:local
 *
 * Windows 下 Playwright webServer 起子进程跑 pnpm start，env 继承，能复现
 * production 行为。node 版本可能跨平台不一致（本地 25 / CI 20），但前端
 * 渲染行为跨版本基本一致。
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Next.js build 把 .env 烤进 production bundle 作为常量（process.env.X = ...）。
// 本地 .env 若是 MySQL，build 后即使运行时 env 改 sqlite 也无效。
// ci-local 期间临时移走 .env，强制 build 用我们的 CI_ENV。
const ENV_PATH = path.resolve('.env');
const ENV_BAK = path.resolve('.env.ci-local-bak');
const envMoved = fs.existsSync(ENV_PATH);
if (envMoved) {
  fs.renameSync(ENV_PATH, ENV_BAK);
}

const CI_ENV = {
  ...process.env,
  CI: 'true',                    // 触发 Playwright CI 分支
  NODE_ENV: 'test',
  DB_TYPE: 'sqlite',
  SQLITE_PATH: './data/apimock-local-ci.db',
  ENCRYPTION_KEY: 'local-ci-encryption-key-not-for-production',
  SKIP_SEED: 'false',            // 触发 auto-seed（和 CI 一致）
  // CI 在 job 级设了 MANAGE_TOKEN（ci.yml），本地必须显式带上：
  // build 后 .env 被恢复，production server 运行时会经 @next/env 读到
  // 用户 .env 里的 MANAGE_TOKEN 打开鉴权；若 playwright 进程没有该变量，
  // globalSetup 会跳过登录种 cookie，所有测试 401（已踩坑）。
  MANAGE_TOKEN: 'ci-e2e-manage-token',
};

const SQLITE_PATH = CI_ENV.SQLITE_PATH;
const SQLITE_DIR = path.dirname(SQLITE_PATH);
if (!fs.existsSync(SQLITE_DIR)) fs.mkdirSync(SQLITE_DIR, { recursive: true });
// 重置 CI DB，保证每次本地跑都是从干净状态开始
if (fs.existsSync(SQLITE_PATH)) fs.unlinkSync(SQLITE_PATH);
if (fs.existsSync(`${SQLITE_PATH}-wal`)) fs.unlinkSync(`${SQLITE_PATH}-wal`);
if (fs.existsSync(`${SQLITE_PATH}-shm`)) fs.unlinkSync(`${SQLITE_PATH}-shm`);

function run(cmd, args, label) {
  console.log(`\n━━━ ${label} ━━━`);
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: CI_ENV,
  });
  if (r.status !== 0) {
    console.error(`✗ ${label} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

const pkgMgr = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

// 1. install（CI 用 frozen-lockfile，本地保证 lockfile 一致）
run(pkgMgr, ['install', '--frozen-lockfile'], 'Install');

// 2. Playwright browsers
run(pkgMgr, ['exec', 'playwright', 'install', 'chromium'], 'Playwright browsers');

// 3. db:push（CI 用 push 不用 migrate，避开 drizzle/*.sql 版本依赖）
run(pkgMgr, ['db:push'], 'DB schema sync');

// 4. build（production）
run(pkgMgr, ['build'], 'Production build');

// build 完恢复 .env（webServer 子进程会用我们设的 CI_ENV，.env 不影响）
if (envMoved && fs.existsSync(ENV_BAK)) {
  fs.renameSync(ENV_BAK, ENV_PATH);
}

// 5. Playwright test（CI=true + retries=0）
//    只跑 chromium（CI 同）。传 --grep 跑单测：
//      pnpm ci:local -- --grep "should auto-generate slug"
const extraArgs = process.argv.slice(2);
run(
  pkgMgr,
  ['exec', 'playwright', 'test', '--project=chromium', '--retries=0', ...extraArgs],
  'Playwright E2E'
);

console.log('\n✓ 本地 CI 复现通过');
