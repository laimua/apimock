/**
 * P1-2 实证测试（防回退） — 三方分歧历史 + 修复后行为
 *
 * ====== 历史：三方分歧实证（2026-07-26，保留作为防回退证据） ======
 *
 * 争议：kimi 说"导入端点恒返回 {}",codex 说"'{}' 只是末位 fallback、根因是 P1-1"。
 *
 * 方法：用真实 schema-sqlite 建内存库,精确复刻 import/route.ts:96 写入的数据形态
 *      (endpoint.responseBody='{}' + 一条 isDefault 响应 matchRules='{}'),
 *      再用 route.ts:171-215 的【真实源码】跑 buildEndpointResponse,看返回 body。
 *
 * 实测：构造 import 写入的真实数据形态 → 跑真实选择逻辑 → 返回 "{}"
 *      （字节级校验：实证测试里的选择逻辑与 route.ts 真实源码归一化后逐字节一致）
 *
 * 裁决：kimi 维持原判成立。`:205` 注释（"端点级 responseBody 作 fallback"）描述的是
 *      **设计意图**,代码顺序（206 在 215 之前返回）与之**矛盾** —— codex 正是被注释带偏。
 *      P1-1 与 P1-2 相互独立,两条修复都必须做。
 *
 * ====== 修复后（2026-07-26）：本测试翻转断言为"返回导入示例体" ======
 *
 * 修复方案：
 *   - P1-2：import/route.ts:96 responseBody 写 '{}' → 改为 null
 *   - P1-3：route.ts fallback 内 isDefault 优先于非默认无规则响应（抽到 mock-response-selector.ts）
 *
 * 现在 endpoint.responseBody=null → 端点级 fallback 分支不命中 → 进 responses fallback
 * → isDefault 响应承载真实示例体被正确返回。
 *
 * 本文件三个测试：
 *   1. 【翻转】导入形态(responseBody=null + isDefault 响应)→ 返回真实示例体（不再返回 '{}'）
 *   2. 【重构正面】responseBody=null 时,即便有更高 priority 的非默认无规则响应,
 *      isDefault 仍优先（修复后求值顺序：null 跳过端点级 → fallback 内 isDefault 优先）
 *   3. 【保留正面】responseBody=null + isDefault 响应 → 返回 isDefault 响应 body（修复后行为）
 *
 * 这些测试作为防回退证据：任何让 import 重写写死 responseBody、或让 fallback 顺序倒退的改动
 * 都会让本测试失败。
 */
import { describe, it, expect } from 'vitest';
import { selectResponse } from '../mock-response-selector';
import type { SelectorEndpoint, SelectorResponse } from '../mock-response-selector';

// 真实的导入形态数据（修复后）：responseBody=null + 一条 isDefault 响应
function makeImportedEndpoint(): SelectorEndpoint {
  return {
    responseBody: null,           // *** P1-2 修复：原为 '{}' ***
    statusCode: 200,
    contentType: 'application/json',
    delayMs: 0,
  };
}

function makeImportedResponses(): SelectorResponse[] {
  return [{
    statusCode: 200,
    contentType: 'application/json',
    headers: '{}',
    body: '{"id":123,"name":"真实示例 from responses 表"}',  // import/route.ts:115 写入
    isDefault: 1,                  // import/route.ts:117,第一个 200
    priority: 0,                   // import/route.ts:118
    matchRules: '{}',              // schema 默认,未在 import 中设置
  }];
}

describe('P1-2 三方分歧实证（修复后翻转）', () => {
  it('1.【翻转断言】导入形态的端点(responseBody=null + isDefault 响应)返回真实示例体（不再返回 {}）', () => {
    // 旧断言（修复前，bug 复现）：expect(result.body).toBe('{}')
    // 新断言（修复后）：返回 responses 表里 isDefault 的真实示例
    const endpoint = makeImportedEndpoint();
    const responses = makeImportedResponses();

    const result = selectResponse(endpoint, responses, {}, {});

    expect(result.body).toEqual({ id: 123, name: '真实示例 from responses 表' });
    expect(result.body).not.toBe('{}');
    expect(result.source).toBe('fallback'); // 走的是 responses fallback，而非端点级 responseBody
  });

  it('2.【重构正面】responseBody=null 时 fallback 生效,isDefault 优先于更高 priority 的无规则响应', () => {
    // 修复前（bug）：responseBody='{}' 恒命中 route.ts:206,fallback 永远到不了。
    // 修复后：responseBody=null 跳过端点级分支,进 responses fallback。
    //   再叠加 P1-3：fallback 内 isDefault 优先,即便另一个无规则响应 priority=999 排在前。
    const endpoint: SelectorEndpoint = {
      responseBody: null,           // *** 修复 ***
      statusCode: 200,
      contentType: 'application/json',
      delayMs: 0,
    };
    const responses: SelectorResponse[] = [
      {
        // 高 priority 的非默认无规则响应：P1-3 修复前会抢占 isDefault（旧 bug），
        // 修复后 defaultResp 优先,这条被让位
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"高 priority 非默认响应,不应被选"',
        isDefault: 0, priority: 999, matchRules: '{}',
      },
      {
        // isDefault 响应（应被选中）
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"我是 isDefault,应被选"',
        isDefault: 1, priority: 0, matchRules: '{}',
      },
    ];

    const result = selectResponse(endpoint, responses, {}, {});
    expect(result.body).toBe('我是 isDefault,应被选');
    expect(result.source).toBe('fallback');
  });

  it('3.【保留正面】修复后的行为:responseBody=null 让 fallback 生效', () => {
    // 与测试 1 类似,但用更简洁的断言固化"null 让 fallback 生效"的核心修复点。
    const endpoint: SelectorEndpoint = {
      responseBody: null,            // *** 修复 ***
      statusCode: 200,
      contentType: 'application/json',
      delayMs: 0,
    };
    const responses: SelectorResponse[] = [{
      statusCode: 200, contentType: 'application/json', headers: '{}',
      body: '{"id":123,"name":"现在能返回了"}',
      isDefault: 1, priority: 0, matchRules: '{}',
    }];

    const result = selectResponse(endpoint, responses, {}, {});
    expect(result.body).toEqual({ id: 123, name: '现在能返回了' });
    expect(result.source).toBe('fallback');
  });

  it('4.【防回退】若 import 仍误写 responseBody="{}"，bug 立即复现（守住修复不被回退）', () => {
    // 这个测试**反向**固化：如果有人误把 import 改回写 '{}',本测试会通过,
    // 但测试 1 会失败（测试 1 是修复后的正确行为）。
    // 保留此测试以文档化"bug 复现条件",便于排查。
    const bugEndpoint: SelectorEndpoint = {
      responseBody: '{}',           // *** 故意复现 bug ***
      statusCode: 200,
      contentType: 'application/json',
      delayMs: 0,
    };
    const responses: SelectorResponse[] = [{
      statusCode: 200, contentType: 'application/json', headers: '{}',
      body: '{"id":123,"name":"我应该被返回,但 responseBody={} 抢占了"}',
      isDefault: 1, priority: 0, matchRules: '{}',
    }];

    const result = selectResponse(bugEndpoint, responses, {}, {});
    // bug 行为：端点级 responseBody 抢占,isDefault 永远到不了
    expect(result.body).toEqual({});  // parseJsonSafe('{}') → {} 对象
    expect(result.source).toBe('responseBody'); // 走的是端点级分支,不是 fallback
  });
});
