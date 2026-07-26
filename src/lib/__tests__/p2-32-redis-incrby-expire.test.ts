/**
 * P2-32: Redis incr(key, by>1, ttlSec) 走 incrby 不设 EXPIRE → token 预算 key 永不过期
 *
 * 修复：新增 INCRBY_WITH_TTL_LUA,incrby 路径在 key 新建时（after === by）
 * 原子设 EXPIRE,已存在 key 再 incrby 不重置 TTL。
 *
 * 测试策略：用 fake ioredis（mock 默认导出）实现 INCRBY/EXPIRE/INCR 语义,
 * 验证 createRedisKv().incr 调用了 incrbyWithTtl 脚本（即 defineCommand 注册的
 * Lua），并最终给新 key 设了 TTL、不给已存在 key 设 TTL。
 *
 * 这是 Redis-only 行为，Memory 后端的 incr 已自带 TTL 语义（kv-memory.ts:39-43）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// fake redis 状态
function makeFakeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  // 记录 defineCommand 注册的命令,以便 Lua 语义在 JS 侧复现
  const commands = new Map<string, (keys: string[], args: string[]) => Promise<unknown>>();

  const fakeClient = {
    on: () => {},
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string, ...rest: unknown[]) => {
      // SET k v EX ttl
      store.set(k, v);
      if (rest[0] === 'EX') {
        ttls.set(k, Number(rest[1]));
      } else {
        ttls.delete(k);
      }
    },
    incr: async (k: string) => {
      const next = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(next));
      return next;
    },
    incrby: async (k: string, by: number) => {
      const next = Number(store.get(k) ?? 0) + by;
      store.set(k, String(next));
      return next;
    },
    expire: async (k: string, ttl: number) => {
      ttls.set(k, ttl);
      return 1;
    },
    del: async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) {
        if (store.delete(k)) n++;
        ttls.delete(k);
      }
      return n;
    },
    scan: async () => ['0', []],
    flushdb: async () => {
      store.clear();
      ttls.clear();
      return 'OK';
    },
    publish: async () => 0,
    // defineCommand: 注册命令名 + lua,返回一个绑定的可调用函数
    defineCommand: (name: string, _opts: { numberOfKeys: number; lua: string }) => {
      // 复现 INCR/INCRBY+EXPIRE 语义（仅测试用,真实 redis 跑 Lua）
      if (/incrWithTtl/i.test(name)) {
        commands.set('incrWithTtl', async (keys: string[], args: string[]) => {
          const [k] = keys;
          const ttl = args[1];
          const next = Number(store.get(k) ?? 0) + 1;
          store.set(k, String(next));
          if (next === 1 && ttl) ttls.set(k, Number(ttl));
          return next;
        });
      } else if (/incrbyWithTtl/i.test(name)) {
        commands.set('incrbyWithTtl', async (keys: string[], args: string[]) => {
          const [k] = keys;
          const by = Number(args[0]);
          const ttl = args[1];
          const before = Number(store.get(k) ?? 0);
          const after = before + by;
          store.set(k, String(after));
          // P2-32 核心：仅新建 key 设 EXPIRE
          if (after === by && ttl) ttls.set(k, Number(ttl));
          return after;
        });
      }
      return Promise.resolve();
    },
  };

  // 把 defineCommand 注册的命令挂成 client.<name>(...args) 的方法
  // 按约定 numberOfKeys=1 时签名是 (key, ...argv)
  const proxy = new Proxy(fakeClient as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      // 匹配已注册命令（忽略大小写）
      for (const [cmd, fn] of commands) {
        if (cmd.toLowerCase() === prop.toLowerCase()) {
          return async (key: string, ...args: string[]) => fn([key], args);
        }
      }
      return undefined;
    },
  });

  return { client: proxy, store, ttls };
}

describe('P2-32 Redis incrby EXPIRE', () => {
  let fake: ReturnType<typeof makeFakeRedis>;

  beforeEach(() => {
    vi.resetModules();
    fake = makeFakeRedis();
    // default 导出必须可 new：普通函数构造调用返回 fake.client（对象），
    // `new Ctor()` 即返回该对象，规避 vi.fn 的 new 行为差异。
    vi.doMock('ioredis', () => {
      function FakeRedis() {
        return fake.client;
      }
      return { __esModule: true, default: FakeRedis };
    });
  });

  afterEach(() => {
    vi.doUnmock('ioredis');
  });

  it('incr(key, by>1, ttl) sets EXPIRE on newly-created key', async () => {
    const { createRedisKv } = await import('../kv-redis');
    const kv = await createRedisKv('redis://localhost:6379');
    const after = await kv.incr('budget:tok:2026-07-25', 500, 86400);
    expect(after).toBe(500);
    expect(fake.ttls.get('budget:tok:2026-07-25')).toBe(86400);
  });

  it('subsequent incrby on existing key does NOT reset TTL', async () => {
    const { createRedisKv } = await import('../kv-redis');
    const kv = await createRedisKv('redis://localhost:6379');
    // 首次创建 + 设 TTL
    await kv.incr('budget:tok:2026-07-26', 500, 86400);
    expect(fake.ttls.get('budget:tok:2026-07-26')).toBe(86400);
    // 改 TTL 模拟"已存在但 TTL 是早些时候设的"
    fake.ttls.set('budget:tok:2026-07-26', 100);
    // 再次 incrby,不应重置 TTL
    const after = await kv.incr('budget:tok:2026-07-26', 200, 9999);
    expect(after).toBe(700);
    expect(fake.ttls.get('budget:tok:2026-07-26')).toBe(100);
  });

  it('incr(key, by>1, no ttl) does not set EXPIRE', async () => {
    const { createRedisKv } = await import('../kv-redis');
    const kv = await createRedisKv('redis://localhost:6379');
    const after = await kv.incr('no-ttl-key', 5);
    expect(after).toBe(5);
    expect(fake.ttls.has('no-ttl-key')).toBe(false);
  });
});
