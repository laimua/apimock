/**
 * P1-3 + mock-response-selector 单元测试
 *
 * 覆盖 codex 验收重点关注项 ③（必须满足,否则打回）：
 *   整体语义是 `matched(规则命中) > fallback`。改 fallback 内部顺序时**不能动 matched 优先级**。
 *
 * 必测：
 *   1. 有规则响应命中 → 仍返回规则响应（不被 isDefault 抢）
 *   2. 无规则命中 + 有 isDefault 响应 + 有非默认无规则响应（更高 priority 排在前）→ 返回 isDefault
 *   3. 无规则命中 + 无 isDefault → 返回首个无规则响应
 *   4. 导入形态（priority 全 0、一条 isDefault）→ 返回 isDefault 那条
 *   5. matched 优先级：matched 始终 > fallback（即便 fallback 的 isDefault 响应 priority 更高）
 *
 * 报告 P1-3 复核注记：
 *   对导入数据 responses priority 全为 0,fallback 归属实际取决于存储顺序（旧实现）;
 *   但对 UI 创建的显式 priority 响应,旧实现抢占确定性触发 → 逻辑错误成立。
 *   修复后：defaultResp 总是优先于 firstNoRule,两种数据形态都正确。
 */
import { describe, it, expect } from 'vitest';
import {
  selectResponse,
  selectFallbackResponse,
  parseMatchRules,
  hasRules,
  matchRule,
  type SelectorEndpoint,
  type SelectorResponse,
} from '../mock-response-selector';

function emptyEndpoint(): SelectorEndpoint {
  return {
    responseBody: null,
    statusCode: 200,
    contentType: 'application/json',
    delayMs: 0,
  };
}

describe('P1-3: fallback 内 isDefault 优先（不破坏 matched 优先级）', () => {
  // ====================================================================
  // ★ codex 必测 1：matched 不被 isDefault 抢占 ★
  // ====================================================================
  it('1. 有规则响应命中 → 返回规则响应（不被 isDefault 抢占）', () => {
    const endpoint = emptyEndpoint();
    const responses: SelectorResponse[] = [
      {
        // isDefault + 高 priority,但**无规则** → fallback 候选
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"isDefault 响应,但请求应走规则命中"',
        isDefault: 1, priority: 999, matchRules: '{}',
      },
      {
        // 规则响应（matchRules 非空）,请求 query x=1 命中
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"我是规则命中的响应"',
        isDefault: 0, priority: 1,
        matchRules: '{"query":{"x":"1"}}',
      },
    ];

    const result = selectResponse(endpoint, responses, { x: '1' }, {});

    // ★ 关键：matched 优先,isDefault 不能抢占 ★
    expect(result.body).toBe('我是规则命中的响应');
    expect(result.source).toBe('matched');
  });

  // ====================================================================
  // ★ codex 必测 2：无规则命中 → fallback 内 isDefault 优先 ★
  // ====================================================================
  it('2. 无规则命中 + 高 priority 非默认无规则响应在前 + isDefault → 返回 isDefault', () => {
    const endpoint = emptyEndpoint();
    const responses: SelectorResponse[] = [
      {
        // 非 isDefault + 高 priority（旧实现会抢占 isDefault）
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"高 priority 非默认,旧 bug 会选我"',
        isDefault: 0, priority: 999, matchRules: '{}',
      },
      {
        // isDefault,低 priority
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"isDefault,修复后应选我"',
        isDefault: 1, priority: 0, matchRules: '{}',
      },
    ];

    const result = selectResponse(endpoint, responses, {}, {});

    // ★ P1-3 修复：defaultResp 优先于 firstNoRule ★
    expect(result.body).toBe('isDefault,修复后应选我');
    expect(result.source).toBe('fallback');
  });

  // ====================================================================
  // codex 必测 3：无 isDefault → 首个无规则响应
  // ====================================================================
  it('3. 无规则命中 + 无 isDefault → 返回首个无规则响应（priority 最高那个）', () => {
    const endpoint = emptyEndpoint();
    const responses: SelectorResponse[] = [
      {
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"A: priority=10"',
        isDefault: 0, priority: 10, matchRules: '{}',
      },
      {
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"B: priority=5"',
        isDefault: 0, priority: 5, matchRules: '{}',
      },
    ];

    const result = selectResponse(endpoint, responses, {}, {});
    // priority desc 排序后 A 在前
    expect(result.body).toBe('A: priority=10');
    expect(result.source).toBe('fallback');
  });

  // ====================================================================
  // codex 必测 4：导入形态（priority 全 0、一条 isDefault）
  // ====================================================================
  it('4. 导入形态（priority 全 0、一条 isDefault + 若干非默认）→ 返回 isDefault 那条', () => {
    const endpoint = emptyEndpoint();
    const responses: SelectorResponse[] = [
      {
        // 导入时多个 statusCode,只有第一个 200 是 isDefault
        statusCode: 404, contentType: 'application/json', headers: '{}',
        body: '"404 响应"',
        isDefault: 0, priority: 0, matchRules: '{}',
      },
      {
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '{"id":1,"imported":true}',
        isDefault: 1, priority: 0, matchRules: '{}',
      },
      {
        statusCode: 500, contentType: 'application/json', headers: '{}',
        body: '"500 响应"',
        isDefault: 0, priority: 0, matchRules: '{}',
      },
    ];

    const result = selectResponse(endpoint, responses, {}, {});
    expect(result.body).toEqual({ id: 1, imported: true });
    expect(result.source).toBe('fallback');
  });

  // ====================================================================
  // 报告场景：显式 priority 无规则响应抢占 vs isDefault（修复后）
  // ====================================================================
  it('5. matched 始终 > fallback（即便 fallback 的 isDefault priority 更高）', () => {
    const endpoint = emptyEndpoint();
    const responses: SelectorResponse[] = [
      {
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"isDefault priority=9999"',
        isDefault: 1, priority: 9999, matchRules: '{}',
      },
      {
        // 规则响应,priority 低
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"规则命中 priority=1"',
        isDefault: 0, priority: 1,
        matchRules: '{"header":{"x-test":"1"}}',
      },
    ];

    // 请求头命中规则
    const result = selectResponse(endpoint, responses, {}, { 'X-Test': '1' });
    expect(result.body).toBe('规则命中 priority=1');
    expect(result.source).toBe('matched');
  });

  // ====================================================================
  // 端点级 responseBody 与 fallback 的关系（P1-2 联动）
  // ====================================================================
  it('6. responseBody 非 null → 端点级优先于 responses fallback', () => {
    const endpoint: SelectorEndpoint = {
      responseBody: '{"explicit":"from endpoint"}',
      statusCode: 201,
      contentType: 'application/json',
      delayMs: 0,
    };
    const responses: SelectorResponse[] = [{
      statusCode: 200, contentType: 'application/json', headers: '{}',
      body: '"我应该被忽略"',
      isDefault: 1, priority: 0, matchRules: '{}',
    }];

    const result = selectResponse(endpoint, responses, {}, {});
    // 端点级 responseBody 非 null → 优先返回（这与 P1-2 import 修复的 null 互补）
    expect(result.body).toEqual({ explicit: 'from endpoint' });
    expect(result.statusCode).toBe(201); // 用端点 statusCode
    expect(result.source).toBe('responseBody');
  });

  // ====================================================================
  // 完全空：没有 responses,没有 responseBody → 返回 200 空 body
  // ====================================================================
  it('7. 空 responses + null responseBody → 返回 200 空 body（不抛错）', () => {
    const endpoint = emptyEndpoint();
    const result = selectResponse(endpoint, [], {}, {});
    expect(result.statusCode).toBe(200);
    expect(result.contentType).toBe('application/json');
    expect(result.body).toBeNull(); // parseJsonSafe(null) === null
    expect(result.source).toBe('empty');
  });

  // ====================================================================
  // 规则匹配本身：query / header 双匹配
  // ====================================================================
  it('8. 规则匹配：query + header 都满足才命中', () => {
    const endpoint = emptyEndpoint();
    const responses: SelectorResponse[] = [
      {
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"规则响应"',
        isDefault: 0, priority: 5,
        matchRules: '{"query":{"q":"a"},"header":{"X-Key":"v"}}',
      },
      {
        statusCode: 200, contentType: 'application/json', headers: '{}',
        body: '"isDefault fallback"',
        isDefault: 1, priority: 0, matchRules: '{}',
      },
    ];

    // query 不满足 → 不命中规则 → 走 fallback
    expect(selectResponse(endpoint, responses, { q: 'b' }, { 'X-Key': 'v' }).body).toBe('isDefault fallback');

    // header 不满足 → 同上
    expect(selectResponse(endpoint, responses, { q: 'a' }, { 'X-Key': 'wrong' }).body).toBe('isDefault fallback');

    // 都满足 → 命中规则
    expect(selectResponse(endpoint, responses, { q: 'a' }, { 'X-Key': 'v' }).body).toBe('规则响应');

    // header 大小写不敏感
    expect(selectResponse(endpoint, responses, { q: 'a' }, { 'x-key': 'v' }).body).toBe('规则响应');
  });
});

// ====================================================================
// 抽离的辅助函数单测（固化现状,确保重构等价）
// ====================================================================
describe('mock-response-selector 辅助函数', () => {
  it('parseMatchRules: null/空/{}/坏 JSON → 空 rules', () => {
    expect(parseMatchRules(null)).toEqual({});
    expect(parseMatchRules('')).toEqual({});
    expect(parseMatchRules('{}')).toEqual({});
    expect(parseMatchRules('not json')).toEqual({});
  });

  it('parseMatchRules: 合法 JSON 对象 → 原样返回', () => {
    expect(parseMatchRules('{"query":{"a":"1"}}')).toEqual({ query: { a: '1' } });
  });

  it('hasRules: 仅 query 或 header 任一非空 → true', () => {
    expect(hasRules({})).toBe(false);
    expect(hasRules({ query: {} })).toBe(false);
    expect(hasRules({ query: { a: '1' } })).toBe(true);
    expect(hasRules({ header: { H: 'v' } })).toBe(true);
  });

  it('matchRule: query 不匹配 → false', () => {
    expect(matchRule({ query: { a: '1' } }, { a: '2' }, {})).toBe(false);
    expect(matchRule({ query: { a: '1' } }, { a: '1' }, {})).toBe(true);
  });

  it('matchRule: header 不区分大小写', () => {
    expect(matchRule({ header: { 'X-Key': 'v' } }, {}, { 'x-key': 'v' })).toBe(true);
    expect(matchRule({ header: { 'X-Key': 'v' } }, {}, { 'X-KEY': 'wrong' })).toBe(false);
  });

  describe('selectFallbackResponse（P1-3 核心函数）', () => {
    it('优先返回 isDefault（即便它 priority 低）', () => {
      const sorted: SelectorResponse[] = [
        { statusCode: 200, contentType: 'application/json', headers: '{}', body: '"high-prio non-default"', isDefault: 0, priority: 999, matchRules: '{}' },
        { statusCode: 200, contentType: 'application/json', headers: '{}', body: '"isDefault"', isDefault: 1, priority: 0, matchRules: '{}' },
      ];
      // 已排好序,直接传入
      expect(selectFallbackResponse(sorted)?.body).toBe('"isDefault"');
    });

    it('无 isDefault → 返回首个无规则响应', () => {
      const sorted: SelectorResponse[] = [
        { statusCode: 200, contentType: 'application/json', headers: '{}', body: '"A"', isDefault: 0, priority: 10, matchRules: '{}' },
        { statusCode: 200, contentType: 'application/json', headers: '{}', body: '"B"', isDefault: 0, priority: 5, matchRules: '{}' },
      ];
      expect(selectFallbackResponse(sorted)?.body).toBe('"A"');
    });

    it('跳过带规则的响应', () => {
      const sorted: SelectorResponse[] = [
        { statusCode: 200, contentType: 'application/json', headers: '{}', body: '"rule-bound, skipped"', isDefault: 1, priority: 999, matchRules: '{"query":{"x":"1"}}' },
        { statusCode: 200, contentType: 'application/json', headers: '{}', body: '"no-rule, selected"', isDefault: 0, priority: 0, matchRules: '{}' },
      ];
      expect(selectFallbackResponse(sorted)?.body).toBe('"no-rule, selected"');
    });

    it('空列表 → null', () => {
      expect(selectFallbackResponse([])).toBeNull();
    });
  });
});
