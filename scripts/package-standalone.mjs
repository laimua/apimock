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
 *   - pruneToAllowlist / scanForbidden 导出给 vitest 做产物安全回归测试
 */

import { execFileSync, execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { platform, arch } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A4: 产物根目录 allow-list。
 *
 * Next 的 file tracing 在本仓库会把整个项目根目录拷进 standalone(含 .env、
 * data/ 里的开发库、tests/e2e/docs 等)。黑名单裁剪追不上仓库新增文件
 * (每加一个根目录文件都要记得登记),漏登记就把密钥/开发库打进发布包。
 * 反转为 allow-list:只保留运行时必需项,其余一律删除——新增文件默认不进包。
 */
export const ROOT_ALLOWLIST = new Set(['server.js', 'package.json', 'node_modules', '.next']);

/**
 * A4: 把 standalone 拷贝产物裁剪到 allow-list,返回被删除的条目(日志用)。
 */
export function pruneToAllowlist(dir) {
  const removed = [];
  for (const entry of readdirSync(dir)) {
    if (!ROOT_ALLOWLIST.has(entry)) {
      rmSync(join(dir, entry), { recursive: true, force: true });
      removed.push(entry);
    }
  }
  return removed;
}

/**
 * A4: 发布包禁含文件模式——.env*(密钥,根目录 .env.example 模板除外)、.git(仓库元数据,
 * 目录/普通文件/symlink 全拦——git worktree 下 .git 是指向主仓库的文件)、*.db 及
 * .db-wal/.db-shm sidecar(开发库)、backups/(运维备份)、*.bak/*.tmp(编辑器/脚本残留)。
 * 递归扫描目录,返回命中的相对路径 POSIX 风格列表(空 = 干净)。
 * release.yml 的 verify job 与 vitest 产物测试共同使用这份判定。
 */
export function scanForbidden(dir, base = dir) {
  const hits = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(base, full).split(sep).join('/');
    // .git 不论形态都拦:目录(常规仓库) / 普通文件(worktree 的 gitdir 指针) /
    // symlink(手工链接的仓库元数据)。只判 isDirectory() 会漏后两种。
    if (entry.name === '.git') {
      hits.push(entry.isDirectory() ? `${rel}/` : rel);
      continue;
    }
    if (entry.isDirectory()) {
      if (rel === 'backups' || rel.endsWith('/backups')) {
        hits.push(`${rel}/`);
        continue;
      }
      hits.push(...scanForbidden(full, base));
    } else if (isForbiddenFile(rel)) {
      hits.push(rel);
    }
  }
  return hits;
}

function isForbiddenFile(rel) {
  // .env.example 豁免只限产物根目录那份(本脚本有意写入的空模板)。
  // 嵌套位置的 .env.example(node_modules/foo/.env.example、public/.env.example)
  // 不是我们写入的,同样可能是密钥文件,必须命中告警。
  if (rel === '.env.example') return false;
  const base = rel.split('/').pop() ?? rel;
  return (
    /^\.env(\..+)?$/.test(base) ||
    // SQLite sidecar 真实命名是短横线(apimock.db-wal/-shm);正则同时覆盖点号
    // 变体(data.db.wal),大小写不敏感(LEGACY.DB)
    /\.db([-.](?:wal|shm))?$/i.test(base) ||
    /\.(bak|tmp)$/.test(base)
  );
}

function main() {
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

  // A4: allow-list 裁剪(替代旧黑名单 PRUNE)——见 ROOT_ALLOWLIST 注释
  const removed = pruneToAllowlist(outDir);
  console.log(`[package] allow-list 裁剪完成,删除 ${removed.length} 项非运行时文件(含 .env / data/,新增根文件默认不进包)`);

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
# 必填:管理面登录密码(建议 >=32 位 CSPRNG 随机串,如 openssl rand -hex 32;
# 短于 32 位可运行但启动时会有 security warn)
MANAGE_TOKEN=
# 必填:备份触发 token(>=20 位随机串,与 MANAGE_TOKEN 不同)
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
set "ENCRYPTION_KEY=CHANGE_ME_64_hex"
rem REQUIRED: admin login password, 32+ random chars (browser login)
set "MANAGE_TOKEN=CHANGE_ME_32plus_chars"
rem REQUIRED: backup API token, 20+ random chars, different from MANAGE_TOKEN
set "ADMIN_TOKEN=CHANGE_ME_20plus_chars_different"
rem Port (change if 3000 is taken)
set "PORT=3000"
rem DB file location (default: data\\apimock.db inside this folder)
rem set "SQLITE_PATH=D:\\apimock-data\\apimock.db"
rem Direct connection (no reverse proxy): false. Behind Nginx/IIS proxy: true
set "TRUST_PROXY=false"

rem A5: refuse to boot while any placeholder/empty value is still set -
rem a production deploy with the well-known CHANGE_ME secrets is worse
rem than no deploy at all.
if "%ENCRYPTION_KEY%"=="" goto :badconfig
if "%MANAGE_TOKEN%"=="" goto :badconfig
if "%ADMIN_TOKEN%"=="" goto :badconfig
if "%ENCRYPTION_KEY%"=="CHANGE_ME_64_hex" goto :badconfig
if "%MANAGE_TOKEN%"=="CHANGE_ME_32plus_chars" goto :badconfig
if "%ADMIN_TOKEN%"=="CHANGE_ME_20plus_chars_different" goto :badconfig
goto :configok
:badconfig
echo ERROR: this file still contains CHANGE_ME placeholders (or empty values).
echo Open start.bat in a text editor, replace them with your own random
echo strings, save, then run again. Generate one with:
echo   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
pause
exit /b 1
:configok

rem Quotes guard paths with spaces (default Downloads/Program Files etc.)
cd /d "%~dp0"

rem A5: run migrations on every start (idempotent: missing columns are
rem added, existing ones untouched). Upgrade flow = replace folder, start.
echo [db] running migrations (idempotent)...
node migrate.mjs
if errorlevel 1 (
  echo ERROR: migration failed, server not started.
  pause
  exit /b 1
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
   带占位符启动会直接拒绝运行(防止用众所周知的弱密钥上线)
2. 双击 \`start.bat\`(每次启动自动跑幂等迁移,首次自动初始化数据库)
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
用新版本的包整体替换目录(data/ 数据库保留),start.bat / node migrate.mjs 幂等,直接启动即可。
`,
  );

  // 发布前安全自检:产物内不得有密钥/开发库/仓库元数据(与 release.yml verify job 双保险)
  const forbidden = [
    ...scanForbidden(outDir),
  ];
  if (forbidden.length > 0) {
    console.error(`[package] 产物含禁含文件,中止打包:\n  ${forbidden.join('\n  ')}`);
    rmSync(outDir, { recursive: true, force: true });
    process.exit(1);
  }
  console.log('[package] 产物安全扫描通过(无 .env / .git / *.db / backups)');

  // 打 tar 包(可选;Windows 10+ 与常见 Linux 都自带 tar)
  // 用相对路径 + cwd,避免 Windows 绝对路径(D:\...)被 tar 误解析为远程主机
  const tarName = `${name}-${platform()}-${arch()}.tar.gz`;
  try {
    execFileSync('tar', ['czf', tarName, name], { cwd: join(root, 'release'), stdio: 'inherit' });
    console.log(`[package] 完成: release/${tarName}`);
  } catch {
    console.log(`[package] tar 不可用,跳过压缩。目录已就绪: release/${name}/`);
  }
}

// 直接执行时跑 main;被 import(vitest 产物测试)时只暴露纯函数
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
