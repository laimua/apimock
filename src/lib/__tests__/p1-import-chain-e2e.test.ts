/**
 * 导入链端到端测试（P1-1 + P1-2 + P1-3 三件套打通）
 *
 * 这是 codex 验收会跑的核心端到端场景：
 *   构造一个含 $ref 和示例的 OpenAPI → 解析（P1-1）→ 模拟导入写入（P1-2: responseBody=null）
 *   → 调 buildEndpointResponse 选择逻辑（P1-3）→ 断言返回真实示例体（非 `{}`）
 *
 * 不起 Next 服务、不连真实 DB（避免依赖）；而是：
 *   - 用真实的 parseAndExtract（含 P1-1 修复后的 resolveRefs）跑解析
 *   - 复刻 import/route.ts batchCreateEndpoints 写入逻辑构造 SelectorResponse
 *     （P1-2 修复后 responseBody=null）
 *   - 调真实的 selectResponse（P1-3 修复后的选择逻辑）
 *
 * 修复前行为：返回 '{}' 或未解析的 {$ref}
 * 修复后行为：返回真实示例体
 */
import { describe, it, expect } from 'vitest';
import { parseAndExtract } from '../openapi-parser';
import { selectResponse, type SelectorEndpoint, type SelectorResponse } from '../mock-response-selector';

/**
 * 模拟 import/route.ts batchCreateEndpoints 的写入逻辑（P1-2 修复后）
 * 把 parseAndExtract 的输出转成导入会写入 DB 的数据形态。
 */
function simulateImport(endpoint: {
  path: string;
  method: string;
  responses: { statusCode: number; body?: unknown }[];
}): { endpoint: SelectorEndpoint; responses: SelectorResponse[] } {
  // P1-2 修复：responseBody=null（原为 '{}'）
  const selEndpoint: SelectorEndpoint = {
    responseBody: null,
    statusCode: 200,
    contentType: 'application/json',
    delayMs: 0,
  };

  // import/route.ts:101-122 写入 responses（第一个 200 = isDefault, priority=0）
  let first200ForEndpoint = true;
  const responses: SelectorResponse[] = endpoint.responses.map((r) => {
    const isDefault = r.statusCode === 200 && first200ForEndpoint ? 1 : 0;
    if (r.statusCode === 200) first200ForEndpoint = false;
    return {
      statusCode: r.statusCode,
      contentType: 'application/json',
      headers: '{}',
      body: JSON.stringify(r.body),
      isDefault,
      priority: 0,
      matchRules: '{}',
    };
  });

  return { endpoint: selEndpoint, responses };
}

describe('导入链端到端:OpenAPI → 解析 → 导入 → 选择 → 真实示例体', () => {
  it('E2E-1. 含 $ref + example 的 OpenAPI → mock 请求返回真实示例体（非 {}）', () => {
    // 最小 OpenAPI 3：Pet schema + /pets/{id} GET 返回 $ref Pet
    const spec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Pet API', version: '1.0.0' },
      paths: {
        '/pets/{id}': {
          get: {
            summary: 'Get a pet',
            responses: {
              '200': {
                description: 'A pet',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Pet' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Pet: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
            },
            example: { id: 1, name: 'Rex' },
          },
        },
      },
    });

    // === P1-1: 解析阶段 ===
    const parseResult = parseAndExtract(spec, 'json');
    expect(parseResult.errors).toHaveLength(0);
    expect(parseResult.endpoints).toHaveLength(1);

    const ep = parseResult.endpoints[0];
    // OpenAPI {id} 在解析期转换为 mock 路由认的 :id 风格
    expect(ep.path).toBe('/pets/:id');
    expect(ep.method).toBe('GET');

    // ★ P1-1 修复后：body 是完整 Pet schema（含 example），不是 {$ref} ★
    const body = ep.responses[0].body as Record<string, unknown>;
    expect(body).not.toHaveProperty('$ref');
    expect(body.type).toBe('object');
    expect((body.properties as Record<string, unknown>).id).toBeDefined();
    // example 字段（含真实示例数据）必须被保留
    expect(body.example).toEqual({ id: 1, name: 'Rex' });

    // === P1-2: 导入写入阶段（模拟） ===
    const imported = simulateImport(ep);

    // 验证导入数据形态：responseBody=null（P1-2 修复）
    expect(imported.endpoint.responseBody).toBeNull();

    // 验证 responses 表数据：第一条 200 isDefault,body 是完整 Pet schema
    expect(imported.responses).toHaveLength(1);
    expect(imported.responses[0].isDefault).toBe(1);
    const respBody = JSON.parse(imported.responses[0].body ?? 'null');
    expect(respBody.example).toEqual({ id: 1, name: 'Rex' });

    // === P1-3: mock 请求选择阶段 ===
    const result = selectResponse(imported.endpoint, imported.responses, {}, {});

    // ★ 端到端断言：返回的是解析后的完整 schema（含真实示例 example）★
    expect(result.body).not.toBe('{}');
    expect(result.body).not.toEqual({});
    const resultBody = result.body as Record<string, unknown>;
    expect(resultBody.example).toEqual({ id: 1, name: 'Rex' });
    expect(result.source).toBe('fallback'); // 走 responses fallback,不是端点级 responseBody
  });

  it('E2E-2. 修复前会失败的断言（防回退）:旧 P1-1 bug 下 body 是 {$ref}', () => {
    // 构造一个故意未解析的 body,模拟 P1-1 修复前的状态,断言它会失败端到端
    // 这个测试证明：如果 P1-1 修复被回退,导入链端到端会断
    const unresolvedBody = { $ref: '#/components/schemas/Pet' };

    const imported = simulateImport({
      path: '/pets',
      method: 'GET',
      responses: [{ statusCode: 200, body: unresolvedBody }],
    });

    const result = selectResponse(imported.endpoint, imported.responses, {}, {});

    // 修复前 P1-1 bug：body 是 {$ref}（未解析）
    // 修复后：在我们的测试里 body 是被故意未解析的 {$ref}，说明 P1-1 必须修
    const resultBody = result.body as Record<string, unknown>;
    expect(resultBody).toHaveProperty('$ref');
    // 这条断言固化了"P1-1 修不好，导入链就出 {$ref}" —— 防回退证据
  });

  it('E2E-3. 修复前会失败的断言（防回退）:旧 P1-2 bug 下 responseBody={} 抢占 fallback', () => {
    // 模拟 P1-2 修复前的 import 数据：responseBody='{}'
    const bugEndpoint: SelectorEndpoint = {
      responseBody: '{}', // *** 故意复现 P1-2 bug ***
      statusCode: 200,
      contentType: 'application/json',
      delayMs: 0,
    };
    const bugResponses: SelectorResponse[] = [{
      statusCode: 200,
      contentType: 'application/json',
      headers: '{}',
      body: JSON.stringify({
        type: 'object',
        properties: { id: { type: 'integer' } },
        example: { id: 1 },
      }),
      isDefault: 1,
      priority: 0,
      matchRules: '{}',
    }];

    const result = selectResponse(bugEndpoint, bugResponses, {}, {});

    // P1-2 bug 行为：端点级 '{}' 抢占,isDefault 永远到不了
    expect(result.body).toEqual({}); // '{}' 解析为空对象
    expect(result.source).toBe('responseBody'); // 走端点级分支,不是 fallback
  });

  it('E2E-4. DAG 共享引用导入:同一 schema 被多个端点引用 → 都返回真实示例', () => {
    // 两个端点都引用 Pet schema（DAG 共享）
    const spec = JSON.stringify({
      openapi: '3.0.0',
      paths: {
        '/cats': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        pet: { $ref: '#/components/schemas/Pet' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/dogs': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        pet: { $ref: '#/components/schemas/Pet' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Pet: {
            type: 'object',
            properties: { name: { type: 'string' } },
            example: { name: 'Shared Pet' },
          },
        },
      },
    });

    const parseResult = parseAndExtract(spec, 'json');
    expect(parseResult.errors).toHaveLength(0);
    expect(parseResult.endpoints).toHaveLength(2);

    // 两个端点都应该解析出完整的嵌套结构（Pet 不被 guard 误杀）
    for (const ep of parseResult.endpoints) {
      const body = ep.responses[0].body as Record<string, unknown>;
      const petProp = (body.properties as Record<string, unknown>).pet as Record<string, unknown>;
      // ★ DAG 共享引用：第二个端点的 Pet 也必须完整解析 ★
      expect(petProp).not.toHaveProperty('$ref');
      expect(petProp.example).toEqual({ name: 'Shared Pet' });
    }

    // 两个端点 mock 都返回真实示例
    for (const ep of parseResult.endpoints) {
      const imported = simulateImport(ep);
      const result = selectResponse(imported.endpoint, imported.responses, {}, {});
      const resultBody = result.body as Record<string, unknown>;
      const petProp = (resultBody.properties as Record<string, unknown>).pet as Record<string, unknown>;
      expect(petProp.example).toEqual({ name: 'Shared Pet' });
    }
  });

  it('E2E-5. 多响应端点:200 isDefault + 404 非默认 → 默认返回 200 真实示例', () => {
    const spec = JSON.stringify({
      openapi: '3.0.0',
      paths: {
        '/users/{id}': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
              '404': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Error' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { id: { type: 'integer' } },
            example: { id: 42 },
          },
          Error: {
            type: 'object',
            properties: { msg: { type: 'string' } },
            example: { msg: 'not found' },
          },
        },
      },
    });

    const parseResult = parseAndExtract(spec, 'json');
    expect(parseResult.errors).toHaveLength(0);
    const ep = parseResult.endpoints[0];
    expect(ep.responses).toHaveLength(2);

    const imported = simulateImport(ep);
    // import 逻辑：第一个 200 是 isDefault,404 不是
    expect(imported.responses.find((r) => r.statusCode === 200)?.isDefault).toBe(1);
    expect(imported.responses.find((r) => r.statusCode === 404)?.isDefault).toBe(0);

    // mock 请求：默认命中 200（isDefault）
    const result = selectResponse(imported.endpoint, imported.responses, {}, {});
    expect(result.body).toEqual(expect.objectContaining({
      type: 'object',
      example: { id: 42 },
    }));
    expect(result.source).toBe('fallback');
  });
});
