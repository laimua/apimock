/**
 * Standalone 单机部署打包脚本
 *
 * 用法:
 *   node scripts/package-standalone.mjs              # build + 组装 + 打 tar 包
 *   node scripts/package-standalone.mjs --skip-build # 复用已有 .next(调试组装逻辑用)
 *
 * 产物:
 *   release/apimock-<version>/        可直接拷贝运行的目录(node server.js 启动)
 *   release/apimock-<version>-<platform>-<arch>.tar.gz(有 tar 命令时)
 *
 * 注意:
 *   - better-sqlite3 是原生模块,包只能在【与服务器同 OS/架构】的机器上构建
 *   - standalone 不自动包含 .next/static 与 public/,本脚本手动补(Next 官方要求)
 */

import { execFileSync, execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skipBuild = process.argv.includes('--skip-build');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const name = `apimock-${pkg.version}`;
const outDir = join(root, 'release', name);

if (!skipBuild) {
  console.log('[package] next build ...');
  execSync('pnpm build', { cwd: root, stdio: 'inherit' });
}

console.log(`[package] 组装 ${outDir}`);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(join(root, '.next', 'standalone'), outDir, { recursive: true });
cpSync(join(root, '.next', 'static'), join(outDir, '.next', 'static'), { recursive: true });
cpSync(join(root, 'public'), join(outDir, 'public'), { recursive: true });
cpSync(join(root, 'scripts', 'migrate-standalone.mjs'), join(outDir, 'migrate.mjs'));

// Next 的 file tracing 在本仓库会把整个项目根目录拷进 standalone(含 .env、data/ 里的
// 开发库、tests/e2e/docs 等),必须显式裁剪:运行时只需要 server.js + .next + public +
// node_modules(裁剪过的)+ 我们补的迁移器和说明文件。
const PRUNE = [
  '.env',
  'data', 'docs', 'e2e', 'tests', 'coverage', 'scripts', 'drizzle', 'src', 'openspec',
  'AGENTS.md', 'CHANGELOG.md', 'CLAUDE.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md',
  'README.md', 'README.en.md',
  'check-db.mjs', 'railway.toml', 'drizzle.config.ts', 'next.config.ts',
  'eslint.config.mjs', 'postcss.config.mjs', 'playwright.config.ts',
  'vitest.config.ts', 'vitest.setup.ts', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  'tsconfig.json', 'tsconfig.scripts.json', 'tsconfig.test.json',
  'tsconfig.tsbuildinfo', 'tsconfig.test.tsbuildinfo',
];
for (const p of PRUNE) rmSync(join(outDir, p), { recursive: true, force: true });
// 根目录 README 截图
for (const f of ['screenshot-desktop.png', 'screenshot-mobile.png', 'screenshot-new-endpoint.png',
  'screenshot-project-detail-mobile.png']) {
  rmSync(join(outDir, f), { force: true });
}
console.log('[package] 已裁剪非运行时文件(含 .env / data/)');

// pnpm 提升依赖在 standalone 里只存在于 node_modules/.pnpm/node_modules/,
// 顶层 node_modules/ 没有链接。原地运行时靠仓库根 node_modules 兜底所以没人发现;
// 拷走独立部署后 next 的 require-hook 找不到 styled-jsx 等提升依赖,直接起不来。
// 把缺失的提升依赖平拷到顶层(已存在的不覆盖)。
const pnpmFlat = join(outDir, 'node_modules', '.pnpm', 'node_modules');
const topNm = join(outDir, 'node_modules');
let hoisted = 0;
try {
  for (const entry of readdirSync(pnpmFlat)) {
    const names = entry.startsWith('@')
      ? readdirSync(join(pnpmFlat, entry)).map((n) => join(entry, n))
      : [entry];
    for (const n of names) {
      const dest = join(topNm, n);
      if (!existsSync(dest)) {
        cpSync(join(pnpmFlat, n), dest, { recursive: true });
        hoisted++;
      }
    }
  }
  console.log(`[package] 补齐 pnpm 提升依赖 ${hoisted} 个(styled-jsx 等)`);
} catch {
  console.log('[package] 无 .pnpm 提升目录(npm 布局),跳过');
}

writeFileSync(
  join(outDir, '.env.example'),
  `# 必填:openssl rand -hex 32 生成;更换后已加密的 AI provider key 全部失效
ENCRYPTION_KEY=
# 必填:管理面登录密码(≥20 位随机串)
MANAGE_TOKEN=
# 必填:备份触发 token(≥20 位随机串,与 MANAGE_TOKEN 不同)
ADMIN_TOKEN=
NODE_ENV=production
PORT=3000
# SQLITE_PATH=./data/apimock.db
# 无反代直连时设 false;Nginx/Caddy/Cloudflare 后面保持默认 true
# TRUST_PROXY=true
# METRICS_TOKEN=   # 启用 /api/metrics 时设置
`,
);

// Windows 单机部署启动脚本(server.js 不会自动读 .env,环境变量必须外部注入)
// 注意:必须保持纯 ASCII!cmd.exe 按 GBK 代码页解析 .bat,UTF-8 中文注释会乱码成非法命令
writeFileSync(
  join(outDir, 'start.bat'),
  `@echo off
rem ============================================================
rem  ApiMock launcher (Windows standalone)
rem  First run: replace the three CHANGE_ME values below with
rem  your own random strings, save, then double-click this file.
rem  Generate a random key (only needs Node):
rem    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
rem  NOTE: keep this file ASCII-only. cmd.exe cannot parse
rem  Chinese comments in a UTF-8 .bat file (GBK codepage issue).
rem ============================================================

rem Node must be 22.x: better-sqlite3 native binding is ABI-locked
rem to the Node major version this package was built with (22).
node -e "const v=process.versions.node.split('.')[0];if(v!=='22'){console.error('ERROR: Node 22.x required, found '+process.version);process.exit(1)}" || exit /b 1

rem REQUIRED: 64-char hex random string (encrypts AI provider keys; do not change later)
set ENCRYPTION_KEY=CHANGE_ME_64_hex
rem REQUIRED: admin login password, 20+ random chars (browser login)
set MANAGE_TOKEN=CHANGE_ME_20plus_chars
rem REQUIRED: backup API token, 20+ random chars, different from MANAGE_TOKEN
set ADMIN_TOKEN=CHANGE_ME_20plus_chars_different
rem Port (change if 3000 is taken)
set PORT=3000
rem DB file location (default: data\\apimock.db inside this folder)
rem set SQLITE_PATH=D:\\apimock-data\\apimock.db
rem Direct connection (no reverse proxy): false. Behind Nginx/IIS proxy: true
set TRUST_PROXY=false

cd /d %~dp0
if not exist data\\apimock.db (
  echo [init] First run, initializing database...
  node migrate.mjs
)
node server.js
pause
`,
);

writeFileSync(
  join(outDir, 'DEPLOY-README.md'),
  `# ApiMock ${pkg.version} standalone 部署包

## 要求
- 服务器只需 **Node.js 22.x** 运行时(必须 22 大版本:better-sqlite3 原生绑定 ABI 锁定,
  Node 24/25 会报 ERR_DLOPEN_FAILED;离线机器可用免安装版 node-v22.x-win-x64.zip 解压即用)
- 无需 pnpm / npm install / docker
- 本包构建于 ${platform()}/${arch()},只能部署到同 OS/架构的机器(better-sqlite3 原生绑定)

## 启动(Windows)
1. 打开 \`start.bat\`,把三个 \`CHANGE_ME\` 改成随机串,保存
   (生成随机串:\`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\`)
2. 双击 \`start.bat\`(首次会自动初始化数据库)
3. 浏览器访问 \`http://localhost:3000\`(或 \`http://<本机IP>:3000\` 给同事用)

注意:\`server.js\` 不会自动读 \`.env\`,环境变量必须由 start.bat(或系统环境变量)注入。

## 启动(Linux / macOS)
\`\`\`bash
cp .env.example .env   # 填好 ENCRYPTION_KEY / MANAGE_TOKEN / ADMIN_TOKEN
export \$(grep -v '^#' .env | xargs)   # 或用 systemd EnvironmentFile
node migrate.mjs       # 首次/升级时跑一次(幂等)
node server.js         # 启动,默认 0.0.0.0:3000
\`\`\`

## 验证
- \`curl http://localhost:3000/api/health\` → {"status":"ok",...}
- \`curl http://localhost:3000/demo-project/users\` → 用户列表 JSON
- 浏览器开 /projects → 跳 /login,输入 MANAGE_TOKEN 登录

## 备份(建议配定时任务)
\`curl -X POST -H "X-Admin-Token: <ADMIN_TOKEN>" http://localhost:3000/api/admin/backup\`
输出到 ./data/backups/,滚动保留 7 份。
Linux 用 cron;Windows 用「任务计划程序」建每日任务,程序填:
\`curl.exe -X POST -H "X-Admin-Token: <ADMIN_TOKEN>" http://localhost:3000/api/admin/backup\`

## 升级
用新版本的包整体替换目录(data/ 数据库保留),先 node migrate.mjs 再 node server.js。
`,
);

// 打 tar 包(可选;Windows 10+ 与常见 Linux 都自带 tar)
// 用相对路径 + cwd,避免 Windows 绝对路径(D:\...)被 tar 误解析为远程主机
const tarName = `${name}-${platform()}-${arch()}.tar.gz`;
try {
  execFileSync('tar', ['czf', tarName, name], { cwd: join(root, 'release'), stdio: 'inherit' });
  console.log(`[package] 完成: release/${tarName}`);
} catch {
  console.log(`[package] tar 不可用,跳过压缩。目录已就绪: release/${name}/`);
}
