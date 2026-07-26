/**
 * P2-38 + P2-39: mock 响应序列化边界
 *
 * P2-38 — 非 Latin-1 路径/自定义头值致 500:
 *   报告 `src/app/[project]/[...path]/route.ts`:`X-Mock-Endpoint: <path>` 及用户自定义
 *   响应头若含中文等字符,undici Headers 抛 TypeError 未捕获 → 裸 500。
 *   修复:`X-Mock-Endpoint` 用 percent-encode(纯 ASCII);其余头值做 Latin-1 安全化。
 *
 * P2-39 — contentType 精确比较致 `[object Object]`:
 *   报告 `serializeMockResponse`:`application/json; charset=utf-8` 因精确比较
 *   `!== 'application/json'` 落入非 JSON 分支,对象 body 经 `String()` 变 `[object Object]`。
 *   修复:解析 media type(去掉 `;` 后参数)再比较。
 *
 * 覆盖:
 *   P2-38 单元层:
 *     1. sanitizeHeaderValue:中文/Latin-1/ASCII/数字/emoji 各情形
 *     2. encodeHeaderValueAsAscii:中文 path percent-encoded 成纯 ASCII 且可还原
 *     3. 含中文的头值经 sanitize 后不会触发 Headers TypeError
 *
 *   P2-39 单元层:
 *     4. mediaType 解析:去掉 charset 等参数、大小写不敏感、空输入
 *     5. `application/json; charset=utf-8` + 对象 body → json 分支(非 [object Object])
 *     6. `application/json; charset=utf-8` + 字符串 body → text 分支(P1-10 不破坏)
 *     7. 回归:精确 `application/json`、非 JSON contentType、空 contentType 仍工作
 */
import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import {
  serializeMockResponse,
  mediaType,
} from '../mock-response-selector';
import {
  sanitizeHeaderValue,
  encodeHeaderValueAsAscii,
} from '@/app/[project]/[...path]/route';

// ============================================
// P2-38
// ============================================
describe('P2-38: sanitizeHeaderValue — Latin-1 安全化', () => {
  it('1a. ASCII / 数字 / 基本拉丁字符保持原样', () => {
    expect(sanitizeHeaderValue('ApiMock')).toBe('ApiMock');
    expect(sanitizeHeaderValue('application/json; charset=utf-8')).toBe(
      'application/json; charset=utf-8'
    );
    expect(sanitizeHeaderValue('123')).toBe('123');
    expect(sanitizeHeaderValue('')).toBe('');
  });

  it('1b. Latin-1 补充字符(0x80–0xFF)保留', () => {
    // é = U+00E9, ñ = U+00F1 —— 都在 Latin-1 范围内,应保留
    expect(sanitizeHeaderValue('café')).toBe('café');
    expect(sanitizeHeaderValue('niño')).toBe('niño');
  });

  it('1c. 中文字符(超出 Latin-1)替换为 ?', () => {
    // 用户列表 = 4 个中文字符
    expect(sanitizeHeaderValue('用户列表')).toBe('????');
    // 用户 = 2 个中文字符
    expect(sanitizeHeaderValue('/用户/list')).toBe('/??/list');
  });

  it('1d. emoji(超出 BMP/Latin-1)替换为 ?', () => {
    // 😀 = U+1F600 surrogate pair,两个 code unit 都 > 0xFF → 两个 ?
    expect(sanitizeHeaderValue('ok 😀')).toBe('ok ??');
  });

  it('1e. null / undefined / 非字符串降级为空串或字符串化', () => {
    expect(sanitizeHeaderValue(null)).toBe('');
    expect(sanitizeHeaderValue(undefined)).toBe('');
    expect(sanitizeHeaderValue(123)).toBe('123');
    expect(sanitizeHeaderValue({ a: 1 })).toBe('[object Object]');
  });
});

describe('P2-38: encodeHeaderValueAsAscii — path percent-encoding', () => {
  it('2a. 中文 path 编码为纯 ASCII', () => {
    const encoded = encodeHeaderValueAsAscii('/用户/list');
    // 输出只含 ASCII(% 与十六进制)
    expect(encoded).toMatch(/^[\x00-\x7f]+$/);
    // 可还原
    expect(decodeURIComponent(encoded)).toBe('/用户/list');
  });

  it('2b. 纯 ASCII path 原样保留(仅非 Latin-1 才编码,保持可读性)', () => {
    // 仅对超出 Latin-1 的码点做 percent-encoding,ASCII 与 Latin-1 原样保留。
    // 这样 /users/123 等常见路径可读性不变,只有含中文等的路径才编码。
    // 关键不变式:输出只含 Latin-1,且 decodeURIComponent 可还原。
    const encoded = encodeHeaderValueAsAscii('/users/123');
    expect(encoded).toMatch(/^[\x00-\x7f]+$/);
    expect(encoded).toBe('/users/123'); // ASCII 原样保留(不编码 /)
    expect(decodeURIComponent(encoded)).toBe('/users/123');
  });
});

describe('P2-38: sanitize/encode 输出保证 Latin-1 安全', () => {
  /** 断言字符串只含 Latin-1 code units (0x00–0xFF) */
  function assertLatin1(s: string): void {
    for (let i = 0; i < s.length; i++) {
      expect(s.charCodeAt(i)).toBeLessThanOrEqual(0xff);
    }
  }

  it('3. 中文 path 经 encodeHeaderValueAsAscii 后纯 ASCII 且可还原', () => {
    const rawChinese = '/用户/list';
    const safe = encodeHeaderValueAsAscii(rawChinese);
    // 输出只含 ASCII
    assertLatin1(safe);
    expect(safe).toMatch(/^[\x00-\x7f]+$/);
    // 可还原
    expect(decodeURIComponent(safe)).toBe(rawChinese);
  });

  it('3b. 自定义头值含中文 → sanitize 后 Latin-1 安全', () => {
    const rawCustom = '你好-world';
    const safe = sanitizeHeaderValue(rawCustom);
    assertLatin1(safe);
    // 中文字符被替换为 ?,ASCII 部分(-world)保留
    expect(safe).toBe('??-world');
  });

  it('3c. 完整 mock 响应构建:中文 X-Mock-Endpoint + 中文自定义头 Latin-1 安全,响应不抛', () => {
    // 模拟 route.ts handleMock 末尾的响应构建路径
    const path = '/用户/list';
    const headers: Record<string, string> = {
      'X-Mock-Server': 'ApiMock',
      'X-Mock-Endpoint': encodeHeaderValueAsAscii(path),
      'X-Custom-Header': sanitizeHeaderValue('响应值中文'),
      'Content-Type': 'application/json; charset=utf-8',
    };
    // 全部头值 Latin-1 安全
    for (const v of Object.values(headers)) assertLatin1(v);
    const serialized = serializeMockResponse({ ok: true }, headers['Content-Type']);
    expect(serialized.kind).toBe('json');
    // NextResponse.json 不会因头值抛错(实测 undici/Next 运行时这里会抛)
    expect(() =>
      NextResponse.json((serialized as { value: unknown }).value, { headers })
    ).not.toThrow();
    const res = NextResponse.json((serialized as { value: unknown }).value, { headers });
    // X-Mock-Endpoint 是 percent-encoded 中文 path,可还原
    expect(res.headers.get('X-Mock-Endpoint')).toBe(encodeHeaderValueAsAscii(path));
    expect(decodeURIComponent(res.headers.get('X-Mock-Endpoint')!)).toBe(path);
    // 自定义头:5 个中文字符 → 5 个 ?,附 -world 之类 ASCII 部分
    // '响应值中文' = 5 个中文 → '?????'
    expect(res.headers.get('X-Custom-Header')).toBe('?????');
  });
});

// ============================================
// P2-39
// ============================================
describe('P2-39: mediaType — Content-Type 解析', () => {
  it('4a. 去掉 charset 等参数', () => {
    expect(mediaType('application/json; charset=utf-8')).toBe('application/json');
    expect(mediaType('application/json; charset=UTF-8')).toBe('application/json');
    expect(mediaType('application/json; charset=utf-8; boundary=xyz')).toBe(
      'application/json'
    );
  });

  it('4b. 大小写不敏感 + 前后空白 trim', () => {
    expect(mediaType('APPLICATION/JSON')).toBe('application/json');
    expect(mediaType('  Application/JSON  ; charset=utf-8')).toBe('application/json');
    expect(mediaType('Text/HTML')).toBe('text/html');
  });

  it('4c. 空输入返回空串', () => {
    expect(mediaType('')).toBe('');
    expect(mediaType(null)).toBe('');
    expect(mediaType(undefined)).toBe('');
  });
});

describe('P2-39: application/json; charset=utf-8 不再误判到 text 分支', () => {
  it('5. 对象 body + `application/json; charset=utf-8` → json 分支(合法 JSON)', async () => {
    const objBody = { success: true, items: [1, 2, 3] };
    const serialized = serializeMockResponse(objBody, 'application/json; charset=utf-8');
    expect(serialized.kind).toBe('json');
    expect((serialized as { value: unknown }).value).toEqual(objBody);
    // 经 NextResponse.json 输出合法 JSON —— 关键:不再是 [object Object]
    const res = NextResponse.json((serialized as { value: unknown }).value);
    const text = await res.text();
    expect(text).toBe(JSON.stringify(objBody));
    expect(text).not.toContain('[object Object]');
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('5b. bug 反证:旧精确比较会把对象 body 推到 text 分支变 [object Object]', () => {
    // 旧逻辑:`contentType !== 'application/json'` 对 'application/json; charset=utf-8' 为 true
    // → 走 text 分支 → String({success:true}) → '[object Object]'
    const objBody = { success: true };
    // 模拟旧逻辑
    const buggyText = String(objBody);
    expect(buggyText).toBe('[object Object]');
    // 修复后不会出现
    const serialized = serializeMockResponse(objBody, 'application/json; charset=utf-8');
    expect(serialized.kind).not.toBe('text');
  });

  it('6. 字符串 body + `application/json; charset=utf-8` → 仍走 text(P1-10 不破坏)', () => {
    // malformed-json 场景的 contentType 也可能是带 charset 的;字符串必须走 text
    const malformed = '{invalid json response}';
    const serialized = serializeMockResponse(malformed, 'application/json; charset=utf-8');
    expect(serialized.kind).toBe('text');
    expect((serialized as { text: string }).text).toBe(malformed);
    // 客户端真正收到非法 JSON
    expect(() => JSON.parse((serialized as { text: string }).text)).toThrow(SyntaxError);
  });

  it('6b. 合法 JSON 字符串 body + `application/json; charset=utf-8` → text(P1-10)', () => {
    const str = '{"ok":true}';
    const serialized = serializeMockResponse(str, 'application/json; charset=utf-8');
    expect(serialized.kind).toBe('text');
    expect((serialized as { text: string }).text).toBe(str);
  });

  it('7. 回归:精确 application/json 仍工作', () => {
    expect(serializeMockResponse({ a: 1 }, 'application/json').kind).toBe('json');
    expect(serializeMockResponse('s', 'application/json').kind).toBe('text');
  });

  it('7b. 回归:非 JSON contentType 仍走 text', () => {
    const s1 = serializeMockResponse({ a: 1 }, 'text/plain');
    expect(s1.kind).toBe('text');
    expect((s1 as { text: string }).text).toBe('[object Object]'); // 非 JSON 分支原本就 String()
    const s2 = serializeMockResponse('hi', 'text/html');
    expect(s2.kind).toBe('text');
    expect((s2 as { text: string }).text).toBe('hi');
  });

  it('7c. 回归:带 charset 的非 JSON(text/plain; charset=utf-8)仍走 text', () => {
    const s = serializeMockResponse('hello', 'text/plain; charset=utf-8');
    expect(s.kind).toBe('text');
    expect((s as { text: string }).text).toBe('hello');
  });

  it('7d. 数组 body + `application/json; charset=utf-8` → json 分支', () => {
    const arr = [1, 2, 3];
    const serialized = serializeMockResponse(arr, 'application/json; charset=utf-8');
    expect(serialized.kind).toBe('json');
    expect((serialized as { value: unknown }).value).toEqual(arr);
  });
});
