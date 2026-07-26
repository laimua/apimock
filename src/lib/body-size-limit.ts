/**
 * Body size limit constants and helper
 * Used by mock service route to reject oversized payloads
 */

export const MAX_BODY_BYTES = 1_000_000; // 1MB

export function isBodyTooLarge(byteLength: number): boolean {
  return byteLength > MAX_BODY_BYTES;
}

/**
 * 计算 UTF-8 字符串的字节长度
 * text.length 是 UTF-16 code unit 数，中文/emoji 实际字节更多
 */
export function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/**
 * 流式读取 body 并累计字节数，超限立即停止。
 *
 * 关键设计点（codex 验收关注项 #3 / #1 / #2）：
 * - **只数字节不解码**：直接累加 `chunk.byteLength`，避免多字节 UTF-8 字符
 *   跨 chunk 截断导致的解码问题（不需要 TextDecoder 的 `stream:true`）。
 * - **流式 + 提前终止**：累计字节一旦超过 `maxBytes` 立即 cancel reader 并返回
 *   `{ tooLarge: true }`，不会把整个 body 读入内存。这堵住了 `Transfer-Encoding: chunked`
 *   + 无 `content-length` 绕过 fast-path 预检导致的内存放大。
 * - **资源释放**：所有退出路径（正常 done / 超限 / 读取出错）都通过 `finally`
 *   调用 `reader.cancel()`，保证底层流句柄不泄漏。cancel 对已 done 的 reader
 *   是 no-op，安全。
 *
 * **调用约定**：本函数会消费 `body` 流。Next route handler 里 `request.body`
 * 只能消费一次（codex 关注项 #4），调用方必须先 `request.clone()` 再把 clone
 * 的 body 传入，否则原始 request 的下游消费（`request.json()` / `request.text()`）
 * 拿不到数据。
 *
 * @param body   可读流（通常是 `request.clone().body` 或 `request.body`）
 * @param maxBytes 字节上限，超出即视为过大（默认 MAX_BODY_BYTES）
 * @returns `{ tooLarge, text }`：超限时 `tooLarge=true`、`text=''`；
 *          正常时 `tooLarge=false`、`text` 为以 UTF-8 解码的完整字符串。
 */
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array>,
  maxBytes: number = MAX_BODY_BYTES
): Promise<{ tooLarge: boolean; text: string }> {
  const reader = body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          // 超限：提前终止。cancel 在 finally 里统一执行。
          return { tooLarge: true, text: '' };
        }
        chunks.push(value);
      }
    }
    // 全部读完且未超限：拼装并按 UTF-8 解码。
    // chunks 内是原始字节，一次性 decode 不会有跨 chunk 截断问题。
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    return { tooLarge: false, text: new TextDecoder('utf-8').decode(merged) };
  } finally {
    // 统一释放：无论正常完成、超限、还是异常退出都 cancel。
    //
    // 注意(undici/Next 行为)：对 `request.clone()` 产生的 tee body 调用
    // `await reader.cancel()` 会**挂起**——因为另一半 tee 仍由原 Request 持有，
    // undici 的 cancel 要等原始 fetch body 完成。在 route handler 里这会导致
    // 413 响应被无限延迟，正好让 DoS 攻击得逞（与修复目标背道而驰）。
    //
    // 因此这里采用 **fire-and-forget**：发送 cancel 信号但不 await。reader
    // 锁随 GC 释放，底层 socket 句柄也会在原 Request 被 drop 时关闭。对已
    // done 的 reader，cancel 是 no-op。
    try {
      void reader.cancel().catch(() => {
        /* 忽略：cancel 失败不影响业务结果，句柄由 GC 兜底 */
      });
    } catch {
      /* 同上 */
    }
  }
}
