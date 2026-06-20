/**
 * Memory KV 后端（默认，单实例精确）
 *
 * 进程内 Map。TTL 用 setTimeout 实现，到期删除。多副本下各自独立计数，
 * 限流会 N 倍宽松——上多副本前必须切 Redis。
 */

import type { KVStore } from './kv-store';

type Entry = { value: string; timer?: NodeJS.Timeout };

export function createMemoryKv(): KVStore {
  const store = new Map<string, Entry>();

  return {
    backend: 'memory',

    async get(key) {
      return store.get(key)?.value ?? null;
    },

    async set(key, value, ttlSec) {
      const existing = store.get(key);
      if (existing?.timer) clearTimeout(existing.timer);
      const entry: Entry = { value };
      if (ttlSec && ttlSec > 0) {
        entry.timer = setTimeout(() => store.delete(key), ttlSec * 1000);
        entry.timer.unref?.();
      }
      store.set(key, entry);
    },

    async incr(key, by = 1, ttlSec) {
      const cur = Number(store.get(key)?.value ?? 0);
      const next = cur + by;
      const existing = store.get(key);
      if (existing?.timer) {
        // 保持现有 TTL（计数操作不改 TTL）
      } else if (ttlSec && ttlSec > 0) {
        const timer = setTimeout(() => store.delete(key), ttlSec * 1000);
        timer.unref?.();
        store.set(key, { value: String(next), timer });
        return next;
      }
      store.set(key, { value: String(next), timer: existing?.timer });
      return next;
    },

    async del(key) {
      const entry = store.get(key);
      if (entry?.timer) clearTimeout(entry.timer);
      store.delete(key);
    },

    async delByPrefix(prefix) {
      let n = 0;
      for (const key of [...store.keys()]) {
        if (key.startsWith(prefix)) {
          const entry = store.get(key);
          if (entry?.timer) clearTimeout(entry.timer);
          store.delete(key);
          n++;
        }
      }
      return n;
    },

    async clear() {
      for (const entry of store.values()) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      store.clear();
    },
  };
}
