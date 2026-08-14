/**
 * A4 — standalone 打包产物安全回归测试
 *
 * - pruneToAllowlist:黑名单→allow-list 反转。standalone 拷贝产物只保留
 *   server.js/package.json/node_modules/.next,其余(含 .env、data/ 开发库、
 *   仓库新增文件)一律删除——新增根文件默认不进包,漏登记不再泄密
 * - scanForbidden:递归扫产物禁含 .env 变体 / .git / .db / backups / .bak / .tmp
 *   (.env.example 空模板除外,是有意打进包的)
 */

import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneToAllowlist, scanForbidden, ROOT_ALLOWLIST } from '../scripts/package-standalone.mjs';

const tmpRoot = mkdtempSync(join(tmpdir(), 'apimock-pkg-'));
afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function scaffoldStandalone(dir: string): void {
  // allow-list 内的运行时文件
  for (const f of ['server.js', 'package.json']) writeFileSync(join(dir, f), '');
  mkdirSync(join(dir, 'node_modules', 'next'), { recursive: true });
  mkdirSync(join(dir, '.next', 'server'), { recursive: true });

  // file tracing 会拷进来的项目根文件(历史上真实出现过)
  for (const junk of [
    '.env', '.env.local',
    'data', 'docs', 'e2e', 'tests', 'coverage', 'src', 'openspec', 'drizzle',
    'AGENTS.md', 'CHANGELOG.md', 'README.md',
    'tsconfig.json', 'pnpm-lock.yaml', 'screenshot-desktop.png',
    // 模拟未来新增、没人登记黑名单的文件
    'some-future-new-config.yml',
  ]) {
    const p = join(dir, junk);
    if (junk.includes('.')) writeFileSync(p, '');
    else mkdirSync(p, { recursive: true });
  }
  writeFileSync(join(dir, 'data', 'apimock.db'), '');
  mkdirSync(join(dir, 'data', 'backups'), { recursive: true });
  writeFileSync(join(dir, 'data', 'backups', 'backup.tar.gz'), '');
}

describe('A4 pruneToAllowlist — 黑名单反转为 allow-list', () => {
  it('只保留 allow-list 条目,未登记的新增文件默认删除', () => {
    const dir = join(tmpRoot, 'prune');
    mkdirSync(dir, { recursive: true });
    scaffoldStandalone(dir);

    const removed = pruneToAllowlist(dir);

    expect(removed).toContain('.env');
    expect(removed).toContain('some-future-new-config.yml');
    // allow-list 条目全保留
    expect(readdirSync(dir).sort()).toEqual([...ROOT_ALLOWLIST].sort());
    expect(existsSync(join(dir, 'server.js'))).toBe(true);
    expect(existsSync(join(dir, 'node_modules', 'next'))).toBe(true);
    expect(existsSync(join(dir, '.next', 'server'))).toBe(true);
    // 密钥/开发库必删
    expect(existsSync(join(dir, '.env'))).toBe(false);
    expect(existsSync(join(dir, 'data'))).toBe(false);
  });
});

describe('A4 scanForbidden — 产物禁含文件递归扫描', () => {
  it('命中 .env* / .git / *.db / backups/ / *.bak / *.tmp', () => {
    const dir = join(tmpRoot, 'scan');
    mkdirSync(dir, { recursive: true });
    scaffoldStandalone(dir);
    mkdirSync(join(dir, '.git'), { recursive: true });
    writeFileSync(join(dir, 'debug.bak'), '');
    writeFileSync(join(dir, 'node_modules', 'orphan-7u5j.tmp'), '');

    const hits = scanForbidden(dir);
    expect(hits).toContain('.env');
    expect(hits).toContain('.env.local');
    expect(hits).toContain('.git/');
    expect(hits).toContain('data/apimock.db');
    expect(hits).toContain('data/backups/');
    expect(hits).toContain('debug.bak');
    expect(hits).toContain('node_modules/orphan-7u5j.tmp');
  });

  it('干净产物(含 .env.example 空模板)→ 空列表', () => {
    const dir = join(tmpRoot, 'clean');
    mkdirSync(join(dir, '.next', 'static'), { recursive: true });
    for (const f of ['server.js', 'package.json', '.env.example', 'migrate.mjs', 'start.bat', 'DEPLOY-README.md']) {
      writeFileSync(join(dir, f), '');
    }
    mkdirSync(join(dir, 'public'), { recursive: true });
    mkdirSync(join(dir, 'data'), { recursive: true }); // 空目录,无库文件

    expect(scanForbidden(dir)).toEqual([]);
  });

  it('.env.example 是唯一放行的 .env* 变体', () => {
    const dir = join(tmpRoot, 'env-only');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.env.example'), '');
    expect(scanForbidden(dir)).toEqual([]);

    writeFileSync(join(dir, '.env.production'), '');
    expect(scanForbidden(dir)).toEqual(['.env.production']);
  });
});
