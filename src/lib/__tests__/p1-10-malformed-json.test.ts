/**
 * P1-10 `malformed-json` 错误场景功能无效修复测试
 *
 * 报告:`src/lib/error-scenarios.ts:120,239-248` 预设 body=`'{invalid json response}'`、
 * contentType=`application/json`。mock 路由 parseJsonSafe 失败 → 返回原字符串 →
 * `NextResponse.json(string)` 把字符串再序列化成合法 JSON 字符串 → 客户端永远收不到
 * malformed JSON,该错误场景在任何情况下都达不到演练目的。
 *
 * 修复:抽 `serializeMockResponse` 纯函数,body 为字符串时走 text 分支(原始文本),
 * 不经 JSON 序列化。route.ts 调用此函数。
 *
 * 覆盖:
 *   1. malformed-json 场景经 applyErrorScenario → body 为非法 JSON 字符串
 *   2. serializeMockResponse 对该字符串 → 走 text 分支(原样返回)
 *   3. 该 text 分支输出是非法 JSON(JSON.parse 抛错)—— 即客户端真正收到 malformed JSON
 *   4. 对象 body + application/json → 走 json 分支(合法 JSON,正常 mock 不受影响)
 *   5. null/undefined body + application/json → 走 json 分支(降级为 {})
 *   6. 任意 body + 非 JSON content-type → 走 text 分支
 *   7. (回归证明)NextResponse.json(string) 会产生合法 JSON(证明 bug 真实存在,反衬修复必要)
 */
import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import {
  ERROR_SCENARIOS,
  applyErrorScenario,
} from '../error-scenarios';
import { serializeMockResponse } from '../mock-response-selector';

describe('P1-10: malformed-json 场景产出非法 JSON 字符串', () => {
  it('1. malformed-json 场景预设 body 为非法 JSON 字符串', () => {
    const scenario = ERROR_SCENARIOS['malformed-json'];
    expect(scenario.responseBody).toBe('{invalid json response}');
    expect(typeof scenario.responseBody).toBe('string');
    // 反证:该字符串本身不是合法 JSON
    expect(() => JSON.parse(scenario.responseBody as string)).toThrow();
  });

  it('2. applyErrorScenario 透传该字符串(不 JSON.stringify)', () => {
    const applied = applyErrorScenario(ERROR_SCENARIOS['malformed-json']);
    expect(applied.responseBody).toBe('{invalid json response}');
    expect(typeof applied.responseBody).toBe('string');
    expect(applied.contentType).toBe('application/json');
  });

  it('3. serializeMockResponse 对该字符串 + application/json → 走 text 分支', () => {
    const applied = applyErrorScenario(ERROR_SCENARIOS['malformed-json']);
    const serialized = serializeMockResponse(applied.responseBody, applied.contentType);
    expect(serialized.kind).toBe('text');
    expect((serialized as { text: string }).text).toBe('{invalid json response}');
  });

  it('4. text 分支输出是非法 JSON(JSON.parse 抛错)—— 客户端真正收到 malformed JSON', () => {
    const applied = applyErrorScenario(ERROR_SCENARIOS['malformed-json']);
    const serialized = serializeMockResponse(applied.responseBody, applied.contentType);
    expect(serialized.kind).toBe('text');
    const outputText = (serialized as { text: string }).text;
    // 客户端拿到的 body 不是合法 JSON —— 场景目的达成
    expect(() => JSON.parse(outputText)).toThrow(SyntaxError);
  });
});

describe('P1-10 回归:正常 JSON 响应不受影响', () => {
  it('5. 对象 body + application/json → 走 json 分支(合法 JSON)', () => {
    const objBody = { success: true, data: [1, 2, 3] };
    const serialized = serializeMockResponse(objBody, 'application/json');
    expect(serialized.kind).toBe('json');
    expect((serialized as { value: unknown }).value).toEqual(objBody);
    // 该 value 经 NextResponse.json 输出合法 JSON
    expect(() => JSON.parse(JSON.stringify((serialized as { value: unknown }).value))).not.toThrow();
  });

  it('5b. server-500 场景(对象 body)→ 走 json 分支', () => {
    const applied = applyErrorScenario(ERROR_SCENARIOS['server-500']);
    // applyErrorScenario 把对象 JSON.stringify 成字符串
    expect(typeof applied.responseBody).toBe('string');
    // 注意:applyErrorScenario 总是返回字符串(对象会 JSON.stringify)。
    // serializeMockResponse 看到字符串 → text 分支。这里测的是 string 输入的行为:
    // server-500 的字符串是合法 JSON,text 分支原样返回,客户端 JSON.parse 仍成功。
    const serialized = serializeMockResponse(applied.responseBody, applied.contentType);
    expect(serialized.kind).toBe('text');
    expect(() =>
      JSON.parse((serialized as { text: string }).text)
    ).not.toThrow();
  });

  it('6. null/undefined body + application/json → 走 json 分支(降级 {})', () => {
    expect(serializeMockResponse(null, 'application/json')).toEqual({ kind: 'json', value: {} });
    expect(serializeMockResponse(undefined, 'application/json')).toEqual({ kind: 'json', value: {} });
  });

  it('7. 任意 body + 非 JSON content-type → 走 text 分支', () => {
    // 对象 + text/plain → text(String(obj) 降级)
    const s1 = serializeMockResponse({ a: 1 }, 'text/plain');
    expect(s1.kind).toBe('text');
    // 字符串 + text/plain → text(原样)
    const s2 = serializeMockResponse('hello', 'text/html');
    expect(s2.kind).toBe('text');
    expect((s2 as { text: string }).text).toBe('hello');
    // null + text/plain → text(空串)
    const s3 = serializeMockResponse(null, 'text/plain');
    expect(s3.kind).toBe('text');
    expect((s3 as { text: string }).text).toBe('');
  });

  it('8. 数组 body + application/json → 走 json 分支', () => {
    const arr = [1, 2, 3];
    const serialized = serializeMockResponse(arr, 'application/json');
    expect(serialized.kind).toBe('json');
    expect((serialized as { value: unknown }).value).toEqual(arr);
  });
});

describe('P1-10 bug 证明:旧逻辑(NextResponse.json on string)会产生合法 JSON', () => {
  it('9. NextResponse.json(非法JSON字符串) → 客户端收到合法 JSON(反衬修复必要)', async () => {
    // 这是旧 mock 路由的行为:对 string body 调 NextResponse.json(string)
    const malformed = '{invalid json response}';
    const res = NextResponse.json(malformed);
    const text = await res.text();
    // NextResponse.json 给字符串加引号转义 → 变成合法 JSON 字符串字面量
    expect(text).toBe('"{invalid json response}"');
    // 因此 JSON.parse 成功,客户端永远收不到 malformed JSON —— bug 成立
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('10. 修复后 new NextResponse(string) → 客户端收到原始非法文本', async () => {
    const malformed = '{invalid json response}';
    const res = new NextResponse(malformed);
    const text = await res.text();
    expect(text).toBe('{invalid json response}');
    expect(() => JSON.parse(text)).toThrow(SyntaxError);
  });
});
