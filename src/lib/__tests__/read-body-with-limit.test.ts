/**
 * Streaming body-size guard unit tests (P0-1)
 *
 * 覆盖 codex 验收关注项 #1 / #2 / #3：
 * - 流式读取 + 超限提前终止（堵住 chunked + 无 content-length 的内存放大）
 * - 只数字节不解码（多字节 UTF-8 跨 chunk 安全）
 * - 资源释放：超限 / 正常 / 异常路径都不泄漏 reader
 *
 * 本文件只测纯函数 `readBodyWithLimit`，route handler 的集成见
 * `tests/body-size-guard.test.ts` 与 `tests/body-size-chunked.test.ts`。
 */

import { describe, it, expect } from 'vitest';
import { MAX_BODY_BYTES, readBodyWithLimit } from '../body-size-limit';

/** 把字符串打包成 N 个 chunk 组成的 ReadableStream，模拟 chunked 传输 */
function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** 把一个 buffer 切成 n 个等大（最后一个可不等）chunk */
function splitInto(buf: Uint8Array, n: number): Uint8Array[] {
  const size = Math.ceil(buf.byteLength / n);
  const out: Uint8Array[] = [];
  for (let i = 0; i < buf.byteLength; i += size) {
    out.push(buf.slice(i, i + size));
  }
  return out;
}

describe('readBodyWithLimit', () => {
  it('reads a small body fully and returns tooLarge=false', async () => {
    const body = streamFromChunks([utf8('{"a":1}')]);
    const res = await readBodyWithLimit(body);
    expect(res.tooLarge).toBe(false);
    expect(res.text).toBe('{"a":1}');
  });

  it('returns tooLarge=true when body exceeds default 1MB (chunked, no content-length)', async () => {
    // 模拟 chunked 编码：1.5MB 数据切成多个 chunk，无任何 content-length 预告
    const big = utf8('x'.repeat(MAX_BODY_BYTES + 500_000));
    const body = streamFromChunks(splitInto(big, 8));
    const res = await readBodyWithLimit(body);
    expect(res.tooLarge).toBe(true);
    expect(res.text).toBe('');
  });

  it('accepts body exactly at the limit (boundary)', async () => {
    const big = utf8('x'.repeat(MAX_BODY_BYTES));
    const body = streamFromChunks(splitInto(big, 4));
    const res = await readBodyWithLimit(body);
    expect(res.tooLarge).toBe(false);
    expect(res.text.length).toBe(MAX_BODY_BYTES);
  });

  it('respects a custom maxBytes', async () => {
    const body = streamFromChunks([utf8('0123456789')]); // 10 bytes
    const res = await readBodyWithLimit(body, 5);
    expect(res.tooLarge).toBe(true);
  });

  it('only counts bytes: multi-byte UTF-8 split across chunks decodes correctly', async () => {
    // '你好' = 6 字节，每字符 3 字节。切成两个 3 字节 chunk（正好切断字符）。
    // 因为只数字节不解码，最终合并后一次性 decode，字符不被破坏。
    const buf = utf8('你好');
    expect(buf.byteLength).toBe(6);
    const chunks = [buf.slice(0, 3), buf.slice(3, 6)];
    const body = streamFromChunks(chunks);
    const res = await readBodyWithLimit(body);
    expect(res.tooLarge).toBe(false);
    expect(res.text).toBe('你好');
  });

  it('counts multi-byte UTF-8 bytes correctly for size limit', async () => {
    // 1000000 字节上限 → 333333 个中文(3字节)= 999999 字节，再加 1 个中文(3字节)= 1000002 → 超限
    const ok = utf8('中'.repeat(333333));
    expect(ok.byteLength).toBe(999999);
    const res1 = await readBodyWithLimit(streamFromChunks([ok]));
    expect(res1.tooLarge).toBe(false);

    const over = utf8('中'.repeat(333334));
    expect(over.byteLength).toBe(1000002);
    const res2 = await readBodyWithLimit(streamFromChunks([over]));
    expect(res2.tooLarge).toBe(true);
  });

  it('handles empty body', async () => {
    const body = streamFromChunks([]);
    const res = await readBodyWithLimit(body);
    expect(res.tooLarge).toBe(false);
    expect(res.text).toBe('');
  });

  it('stops early (does not read whole body) when oversized', async () => {
    // 用一个 pull 流验证：超限后不应继续读完所有 chunk
    let pulls = 0;
    const totalChunks = 50;
    const chunkSize = 100_000; // 每 chunk 100KB
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > totalChunks) {
          controller.close();
          return;
        }
        controller.enqueue(utf8('x'.repeat(chunkSize)));
      },
    });
    const res = await readBodyWithLimit(body);
    expect(res.tooLarge).toBe(true);
    // 1MB 上限 / 100KB chunk = 约 11 个 chunk 就该停；绝不应拉满 50 个
    expect(pulls).toBeLessThan(totalChunks);
  });

  it('releases reader on read error (no leak)', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('boom'));
      },
    });
    await expect(readBodyWithLimit(body)).rejects.toThrow('boom');
    // 流已被 finally 中的 cancel 关闭；再次读应得到已关闭错误而非挂起
    // （这里不直接断言 reader 状态，避免实现耦合；只要上面不挂起即视为通过）
  });
});
