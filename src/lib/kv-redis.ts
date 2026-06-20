/**
 * Redis KV 后端（多副本一致）
 *
 * ioredis。INCR 原子，EXPIRE 设 TTL。pub/sub 用于缓存失效广播，TTL 兜底。
 *
 * Lua 限流脚本（原子 INCR + EXPIRE）：
 *   第一次 INCR 时附 EXPIRE，避免每次请求都 PEXPIRE。
 *   count = INCR key; if count == 1 then EXPIRE key windowSec end; return count
 */

import Redis from 'ioredis';
import type { KVStore } from './kv-store';
import { logger } from './logger';

const INCR_WITH_TTL_LUA = `
local cur = redis.call('INCR', KEYS[1])
if cur == 1 and ARGV[2] then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return cur
`;

export async function createRedisKv(url: string): Promise<KVStore> {
  const client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
  });

  const incrScript = client.defineCommand('incrWithTtl', {
    numberOfKeys: 1,
    lua: INCR_WITH_TTL_LUA,
  });
  await incrScript;

  // pub/sub 用独立连接（ioredis 同连接 subscribe 后不能发普通命令）
  let subClient: Redis | null = null;
  const subscribers = new Map<string, Set<(msg: string) => void>>();

  client.on('error', (err) => {
    logger.error({ err }, 'redis error');
  });

  return {
    backend: 'redis',

    async get(key) {
      return client.get(key);
    },

    async set(key, value, ttlSec) {
      if (ttlSec && ttlSec > 0) {
        await client.set(key, value, 'EX', ttlSec);
      } else {
        await client.set(key, value);
      }
    },

    async incr(key, by = 1, ttlSec) {
      if (by === 1 && ttlSec) {
        // 原子 INCR + 首次 EXPIRE
        // @ts-expect-error defineCommand 类型推断有限
        const result = await client.incrWithTtl(key, String(by), String(ttlSec));
        return Number(result);
      }
      if (by !== 1) {
        const after = await client.incrby(key, by);
        return Number(after);
      }
      return await client.incr(key);
    },

    async del(key) {
      await client.del(key);
    },

    async delByPrefix(prefix) {
      // SCAN 防大 key 集阻塞
      let cursor = '0';
      let deleted = 0;
      do {
        const [next, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) {
          deleted += await client.del(...keys);
        }
      } while (cursor !== '0');
      return deleted;
    },

    async clear() {
      // 仅清当前 DB。生产慎用。
      await client.flushdb();
    },

    async publish(channel, message) {
      await client.publish(channel, message);
    },

    async subscribe(channel, callback) {
      if (!subClient) {
        subClient = new Redis(url, { lazyConnect: false });
        subClient.on('error', (err) => logger.error({ err }, 'redis sub error'));
      }
      let set = subscribers.get(channel);
      if (!set) {
        set = new Set();
        subscribers.set(channel, set);
        await subClient.subscribe(channel);
        subClient.on('message', (ch, msg) => {
          subscribers.get(ch)?.forEach((cb) => cb(msg));
        });
      }
      set.add(callback);
    },
  };
}
