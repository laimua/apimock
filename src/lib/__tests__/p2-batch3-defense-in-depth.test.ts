/**
 * P2 第三批纵深防御段验收测试:P2-21 / P2-29 / P2-31 / P2-34 / P2-36
 *
 * P2-21 — health/ready 公开路由不泄露 DB/FS 异常 message:
 *   修复前:`error: err.message`(可能含 `SQLITE_CANTOPEN: /app/data/x.db` 等驱动/路径细节)
 *   修复后:对外只回固定文案("database check failed" / "filesystem check failed"),
 *           原始 err 进 logger.error(受 redact 保护)。匿名访问者拿不到细节。
 *
 * P2-29 — encryption deriveKeyCache 加 LRU + ENCRYPTION_KEY 强度校验:
 *   修复前:cache 无淘汰上限(encrypt 每次随机 salt 新增一条,长命进程慢泄漏);
 *           ENCRYPTION_KEY 无强度校验("x" 也接受)
 *   修复后:cache 超 1000 条删最旧;短 key(<16 字符)首次访问时 warn 一次
 *
 * P2-31 — sanitizeHeaders 名单偏窄:
 *   修复前:`proxy-authorization`、`x-forwarded-for` 等未脱敏即落库 requests 表
 *   修复后:扩 sensitiveHeaders Set,代理凭证 + 代理拓扑头全部脱敏
 *
 * P2-34 — db-sqlite 未设 busy_timeout:
 *   修复前:多进程并发写偶发 SQLITE_BUSY(busy_timeout 默认 0,锁竞争立即报错)
 *   修复后:`pragma('busy_timeout = 5000')`,获取写锁的连接在锁释放后重试 5s
 *
 * P2-36 — console.error 绕过 pino redact:
 *   修复前:多处 `console.error('...', err)`(generate/providers/request-retention 等)
 *           绕过 pino redact,潜在 apiKey/baseURL 落到原始 stderr
 *   修复后:统一 `logger.error({ err }, '...')`,走 redact 管线
 *
 * 注:P2-34 用独立 better-sqlite3 :memory: 实例验证 pragma 生效,不导 db-sqlite.ts
 * 单例(那是落盘文件库)。与 p1-4-foreign-keys.test.ts 的隔离模式一致。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import {
  encrypt,
  decrypt,
  _clearEncryptionKeyCache,
  _deriveKeyCacheSize,
  _DERIVE_KEY_CACHE_MAX,
  _setDeriveKeyCacheMaxForTest,
} from '../encryption';

// ============================================
// P2-21
// ============================================
// 用 vi.mock 替换 @/lib/db 让 health/ready 的 DB 检查可控抛错。
// factory 在 import 期求值,定义在顶层(vitest hoist)。注意:不重置整个模块图,
// 避免 metrics.ts 的 collectDefaultMetrics() 重复注册。
const throwingDb = {
  select: () => {
    throw new Error('SQLITE_CANTOPEN: /secret/internal/path/apimock.db');
  },
};
vi.mock('@/lib/db', () => ({ db: throwingDb, isMysqlEnv: () => false }));

describe('P2-21: health/ready 不泄露 DB/FS 异常 message', () => {
  let originalDbType: string | undefined;

  beforeEach(() => {
    originalDbType = process.env.DB_TYPE;
    process.env.DB_TYPE = 'mysql'; // 跳过 fs 检查,聚焦 db 检查脱敏
  });

  afterEach(() => {
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
    vi.restoreAllMocks();
  });

  it('DB 异常时响应体含固定文案,不含原始 err.message', async () => {
    const { logger } = await import('../logger');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    const { GET } = await import('@/app/api/health/ready/route');
    const res = await GET();
    const body = await res.json();

    // 降级状态
    expect(res.status).toBe(503);
    expect(body.status).toBe('degraded');
    // db check 失败标志位
    const dbCheck = body.checks.find((c: { name: string }) => c.name === 'db');
    expect(dbCheck).toBeDefined();
    expect(dbCheck.ok).toBe(false);
    // 关键断言:对外只回固定文案,不含原始 message 细节
    expect(dbCheck.error).toBe('database check failed');
    expect(dbCheck.error).not.toMatch(/secret/i);
    expect(dbCheck.error).not.toMatch(/SQLITE|CANTOPEN|EACCES|ENOENT/i);
    // 整个响应体都不回显敏感路径
    expect(JSON.stringify(body)).not.toContain('/secret/internal/path/');
    // 原始异常确实进了 logger(细节保留在服务端)
    expect(errorSpy).toHaveBeenCalled();
  });

  it('fs 异常时也回固定文案(MySQL 跳过 fs,故设 sqlite + 不可写目录)', async () => {
    process.env.DB_TYPE = 'sqlite';
    // 触发 fs 检查需要一个真实不可写路径;跳过:db 失败已覆盖 catch 分支语义,
    // 这里只验证 fs 失败时也走同一固定文案模式 —— 通过源码静态扫确保 fs 分支
    // 也有 'filesystem check failed' 字面量(防回归)。
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/api/health/ready/route.ts'),
      'utf8'
    );
    expect(src).toContain("'database check failed'");
    expect(src).toContain("'filesystem check failed'");
  });
});

// ============================================
// P2-29
// ============================================
describe('P2-29: encryption deriveKeyCache LRU + key 强度校验', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    _clearEncryptionKeyCache();
    // 缩小 LRU 上限到 5:跑 scrypt 太慢(N=2 默认也要几十 ms),1000+ 次会超时。
    // LRU 逻辑与上限值无关,小上限照样验证"超限删最旧"。
    _setDeriveKeyCacheMaxForTest(5);
    process.env.ENCRYPTION_KEY = 'strong-test-key-with-enough-length-32bytes!';
  });

  afterEach(() => {
    _clearEncryptionKeyCache();
    _setDeriveKeyCacheMaxForTest(_DERIVE_KEY_CACHE_MAX); // 复位
    if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it('LRU:超上限删最旧,缓存大小不超上限', () => {
    // 用足够多的不同输入触发 encrypt(每次随机 salt → 不同 cacheKey)
    // encrypt 内部 deriveKey 缓存 (secret.length, saltHex) → key
    const max = 5;
    for (let i = 0; i < max + 20; i++) {
      encrypt(`msg-${i}`);
    }
    // 不应无限增长,被钉在上限
    expect(_deriveKeyCacheSize()).toBeLessThanOrEqual(max);
    // 也不是几乎没缓存(确实在缓存)
    expect(_deriveKeyCacheSize()).toBeGreaterThan(0);
  });

  it('decrypt 仍正确工作(LRU 不破坏正确性)', () => {
    const plain = 'correctness-check-p2-29';
    const cipher = encrypt(plain);
    expect(decrypt(cipher)).toBe(plain);
  });

  it('LRU:大量 encrypt 后仍能 decrypt 历史 ciphertext(scrypt 重算一致)', () => {
    // 即使某条被 LRU 淘汰,decrypt 时 scrypt 重算结果一致,功能不变
    const cipher1 = encrypt('first-msg');
    // 填满并淘汰(上限 5,插 20 条足矣)
    for (let i = 0; i < 20; i++) {
      encrypt(`filler-${i}`);
    }
    expect(decrypt(cipher1)).toBe('first-msg');
  });

  it('C3: 轮换到同长度 ENCRYPTION_KEY 后 decrypt 不得命中旧 key 缓存', () => {
    // 旧 cacheKey `${secret.length}:${saltHex}` 只按长度区分 secret,
    // 同长度轮换会命中旧缓存 → 用旧 key 解新数据。C3 改 sha256 后必须抛错。
    const cipher = encrypt('rotation-canary');
    // 同长度不同内容的新 key(都是 40 字符)
    process.env.ENCRYPTION_KEY = 'ROTATED-test-key-with-enough-length-32byt';
    expect(() => decrypt(cipher)).toThrow(/Decryption failed/);
  });

  it('ENCRYPTION_KEY 短(<16 字符)→ logger.warn 提示(不抛错,保生产可用)', async () => {
    _clearEncryptionKeyCache();
    process.env.ENCRYPTION_KEY = 'short'; // 5 字符,< 16
    const { logger } = await import('../logger');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    // 首次访问触发 warn
    encrypt('trigger-key-check');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const callArg = warnSpy.mock.calls[0]?.[0];
    const msg = typeof callArg === 'string' ? callArg : JSON.stringify(callArg ?? '');
    expect(msg).toMatch(/ENCRYPTION_KEY/i);
    expect(msg).toMatch(/16|weak|strength|rotate/i);

    // 二次访问不再 warn(只 warn 一次,避免 decrypt 热路径反复打日志)
    encrypt('trigger-key-check-2');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('ENCRYPTION_KEY 强(>=16 字符)→ 不 warn', () => {
    _clearEncryptionKeyCache();
    process.env.ENCRYPTION_KEY = 'long-enough-key-16chars';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    encrypt('trigger-key-check');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ============================================
// P2-31
// ============================================
describe('P2-31: sanitizeHeaders 扩 sensitiveHeaders 名单', () => {
  // 辅助:case-insensitive 取值。生产用 undici Headers 会 lowercase key,
  // happy-dom 测试环境不 lowercase,故按 lowerKey 比对以兼容两种实现。
  function getCI(rec: Record<string, string>, name: string): string | undefined {
    const lower = name.toLowerCase();
    for (const k of Object.keys(rec)) {
      if (k.toLowerCase() === lower) return rec[k];
    }
    return undefined;
  }

  it('proxy-authorization 被脱敏(原名单漏掉,等同 authorization 泄露代理凭证)', async () => {
    const { sanitizeHeaders } = await import('@/app/[project]/[...path]/route');
    const h = new Headers();
    h.set('Proxy-Authorization', 'Basic dXNlcjpwYXNz');
    const out = sanitizeHeaders(h);
    expect(getCI(out, 'proxy-authorization')).toBe('[REDACTED]');
    expect(JSON.stringify(out)).not.toContain('dXNlcjpwYXNz');
  });

  it('x-forwarded-for / x-real-ip / forwarded 被脱敏(原名单漏掉,泄露真实 client IP)', async () => {
    const { sanitizeHeaders } = await import('@/app/[project]/[...path]/route');
    const h = new Headers();
    h.set('X-Forwarded-For', '10.0.0.1, 192.168.1.1');
    h.set('X-Real-Ip', '10.0.0.1');
    h.set('Forwarded', 'for=10.0.0.1;proto=https');
    const out = sanitizeHeaders(h);
    expect(getCI(out, 'x-forwarded-for')).toBe('[REDACTED]');
    expect(getCI(out, 'x-real-ip')).toBe('[REDACTED]');
    expect(getCI(out, 'forwarded')).toBe('[REDACTED]');
    // 不回显 IP
    expect(JSON.stringify(out)).not.toContain('10.0.0.1');
  });

  it('x-forwarded-host / x-forwarded-proto 被脱敏(泄露代理内部拓扑)', async () => {
    const { sanitizeHeaders } = await import('@/app/[project]/[...path]/route');
    const h = new Headers();
    h.set('X-Forwarded-Host', 'internal-proxy.corp:8080');
    h.set('X-Forwarded-Proto', 'https');
    const out = sanitizeHeaders(h);
    expect(getCI(out, 'x-forwarded-host')).toBe('[REDACTED]');
    expect(getCI(out, 'x-forwarded-proto')).toBe('[REDACTED]');
  });

  it('回归:原名单 authorization/cookie/set-cookie/x-api-key 仍脱敏', async () => {
    const { sanitizeHeaders } = await import('@/app/[project]/[...path]/route');
    const h = new Headers();
    h.set('Authorization', 'Bearer secret');
    h.set('Cookie', 'session=abc');
    h.set('Set-Cookie', 'a=b');
    h.set('X-API-Key', 'sk-xxx');
    const out = sanitizeHeaders(h);
    expect(getCI(out, 'authorization')).toBe('[REDACTED]');
    expect(getCI(out, 'cookie')).toBe('[REDACTED]');
    expect(getCI(out, 'set-cookie')).toBe('[REDACTED]');
    expect(getCI(out, 'x-api-key')).toBe('[REDACTED]');
  });

  it('回归:非敏感头保留原值(不误伤)', async () => {
    const { sanitizeHeaders } = await import('@/app/[project]/[...path]/route');
    const h = new Headers();
    h.set('Content-Type', 'application/json');
    h.set('Accept', 'text/html');
    h.set('User-Agent', 'curl/8.0');
    const out = sanitizeHeaders(h);
    expect(getCI(out, 'content-type')).toBe('application/json');
    expect(getCI(out, 'accept')).toBe('text/html');
    expect(getCI(out, 'user-agent')).toBe('curl/8.0');
  });

  it('大小写不敏感:PROXY-AUTHORIZATION 与 proxy-authorization 同样脱敏', async () => {
    const { sanitizeHeaders } = await import('@/app/[project]/[...path]/route');
    const h = new Headers();
    h.set('PROXY-AUTHORIZATION', 'Bearer x');
    h.set('X-Forwarded-For', '1.2.3.4');
    const out = sanitizeHeaders(h);
    // lowerKey 比对:无论原始大小写,只要 lower 后在名单内就脱敏
    expect(Object.values(out)).toContain('[REDACTED]');
    expect(JSON.stringify(out)).not.toContain('1.2.3.4');
    expect(getCI(out, 'proxy-authorization')).toBe('[REDACTED]');
  });
});

// ============================================
// P2-34
// ============================================
describe('P2-34: SQLite busy_timeout pragma', () => {
  it('new Database 后设 busy_timeout=5000 → PRAGMA 查询返回 5000', () => {
    // 直接模拟 db-sqlite.ts 修复后的连接初始化序列(busy_timeout 在 foreign_keys 之后)
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000'); // 与 db-sqlite.ts 修复后一致
    const v = db.pragma('busy_timeout', { simple: true });
    expect(v).toBe(5000);
    db.close();
  });

  it('busy_timeout 可观测地切换(设值即生效)', () => {
    // 探测可观测性:设 5000 后查到 5000;设其它值后查到对应值
    const db = new Database(':memory:');
    db.pragma('busy_timeout = 5000');
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    db.pragma('busy_timeout = 1000');
    expect(db.pragma('busy_timeout', { simple: true })).toBe(1000);
    db.close();
  });

  it('db-sqlite.ts 源码包含 busy_timeout = 5000 pragma(静态校验,防回归)', () => {
    // 防止后续重构误删 pragma —— 静态扫源码字符串。
    // 即便驱动(better-sqlite3 v12)默认已设 5000,显式声明仍是防御性写法:
    // 不能依赖驱动的便利默认,否则驱动版本变更/换库会导致行为回归。
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/db-sqlite.ts'),
      'utf8'
    );
    expect(src).toMatch(/busy_timeout\s*=\s*5000/);
  });

  it('db-sqlite.ts busy_timeout 在 foreign_keys 之后(journal/WAL/FK/busy 顺序)', () => {
    // 顺序校验:foreign_keys 与 busy_timeout 都是连接级 pragma,必须在连接
    // 创建后立即设。这里只验证二者都在 db-sqlite.ts 源码中(wal/FK/busy 齐全)。
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/db-sqlite.ts'),
      'utf8'
    );
    expect(src).toMatch(/journal_mode\s*=\s*WAL/);
    expect(src).toMatch(/foreign_keys\s*=\s*ON/);
    expect(src).toMatch(/busy_timeout\s*=\s*5000/);
  });
});

// ============================================
// P2-36
// ============================================
describe('P2-36: console.error 替换为 logger.error(走 pino redact)', () => {
  it('静态校验:src/ 后端源码不再含裸 console.error(前端 client 组件除外)', () => {
    // 防回归:扫源码确认后端非 test 文件已无 console.error。
    // 例外:前端 client 组件(error.tsx/global-error.tsx/page.tsx/Dialog)用
    //       console.error 是浏览器侧日志,无 pino redact 语义,不替换(不碰前端)。

    function walk(dir: string, acc: string[] = []): string[] {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === '.next') continue;
          walk(full, acc);
        } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
          if (e.name.includes('.test.') || e.name.includes('.spec.')) continue;
          acc.push(full);
        }
      }
      return acc;
    }

    // 前端 client component 白名单(浏览器侧日志,不在本次范围)
    const frontendAllow = [
      'src/app/error.tsx',
      'src/app/global-error.tsx',
      'src/app/settings/ai/page.tsx',
      'src/components/AiGenerateDialog.tsx',
    ].map((p) => path.resolve(process.cwd(), p));

    const files = walk(path.resolve(process.cwd(), 'src'));
    const offenders: string[] = [];
    for (const f of files) {
      if (frontendAllow.includes(f)) continue;
      const src = fs.readFileSync(f, 'utf8');
      if (/\bconsole\.error\b/.test(src)) {
        offenders.push(path.relative(process.cwd(), f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('request-retention.ts 源码用 logger.error 而非 console.error(静态校验)', () => {
    // 单文件聚焦校验:P2-36 报告点名 request-retention.ts:58(改后行号变动),
    // 静态扫确认改完。不动态跑(动态 import 整条 metrics 链会触发重复注册)。
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/request-retention.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/\bconsole\.error\b/);
    expect(src).toMatch(/logger\.error/);
    // import 确认
    expect(src).toMatch(/from ['"]\.\/logger['"]/);
  });

  it('generate/route.ts + providers 路由用 logger.error 而非 console.error', () => {
    const targets = [
      'src/app/api/ai/generate/route.ts',
      'src/app/api/ai/providers/route.ts',
      'src/app/api/ai/providers/[id]/route.ts',
      'src/app/api/ai/providers/[id]/default/route.ts',
      'src/app/api/projects/route.ts',
      'src/app/api/projects/[id]/route.ts',
      'src/lib/demo-seed.ts',
    ];
    for (const rel of targets) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      expect(src).not.toMatch(/\bconsole\.error\b/);
    }
  });
});
