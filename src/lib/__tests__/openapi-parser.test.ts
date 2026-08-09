/**
 * OpenAPI Parser Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseOpenAPIFile,
  resolveRefs,
  extractPaths,
  parseAndExtract,
  detectFormat,
  detectCircularRef,
  type JsonValue,
} from '../openapi-parser';

type Obj = Record<string, unknown>;

describe('parseOpenAPIFile', () => {
  describe('JSON format', () => {
    it('should parse valid JSON OpenAPI document', () => {
      const jsonContent = `{
        "openapi": "3.0.0",
        "info": { "title": "Test API", "version": "1.0.0" },
        "paths": {}
      }`;
      const result = parseOpenAPIFile(jsonContent, 'json') as Obj;
      expect(result.openapi).toBe('3.0.0');
      expect((result.info as Obj).title).toBe('Test API');
    });

    it('should parse JSON array', () => {
      const jsonContent = '[1, 2, 3]';
      const result = parseOpenAPIFile(jsonContent, 'json');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should throw error for invalid JSON', () => {
      const jsonContent = '{ invalid json }';
      expect(() => parseOpenAPIFile(jsonContent, 'json')).toThrow('Failed to parse JSON');
    });
  });

  describe('YAML format', () => {
    it('should parse valid YAML OpenAPI document', () => {
      const yamlContent = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths: {}
      `;
      const result = parseOpenAPIFile(yamlContent, 'yaml') as Obj;
      expect(result.openapi).toBe('3.0.0');
      expect((result.info as Obj).title).toBe('Test API');
    });

    it('should parse YAML with nested objects', () => {
      const yamlContent = `
openapi: 3.0.0
info:
  title: Nested API
  contact:
    name: Support
    email: support@test.com
paths: {}
      `;
      const result = parseOpenAPIFile(yamlContent, 'yaml') as Obj;
      const contact = (result.info as Obj).contact as Obj;
      expect(contact.name).toBe('Support');
      expect(contact.email).toBe('support@test.com');
    });

    it('should parse YAML arrays', () => {
      const yamlContent = `
- item1
- item2
- item3
      `;
      const result = parseOpenAPIFile(yamlContent, 'yaml');
      expect(result).toEqual(['item1', 'item2', 'item3']);
    });

    it('should throw error for invalid YAML', () => {
      const yamlContent = `
invalid: yaml: content:
    : bad
      `;
      expect(() => parseOpenAPIFile(yamlContent, 'yaml')).toThrow('Failed to parse YAML');
    });
  });
});

describe('resolveRefs', () => {
  it('should resolve simple $ref to components', () => {
    const doc = {
      openapi: '3.0.0',
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = resolveRefs(doc) as Obj;
    // Verify the ref was resolved at the schema level
    const paths = result.paths as Obj;
    const schema = (((paths['/users'] as Obj).get as Obj).responses as Obj)['200'] as Obj;
    const jsonContent = (schema.content as Obj)['application/json'] as Obj;
    const resolvedSchema = jsonContent.schema;
    // P1-1 强化断言：旧实现只断言 typeof === 'object'（{$ref} 也是 object，掩盖了 bug）。
    // 现在必须解析出完整目标 schema（值相等），而不是 { $ref: '...' } 字面值。
    expect(resolvedSchema).toEqual({
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
    });
    // 并且不再含 $ref 字段
    expect(resolvedSchema).not.toHaveProperty('$ref');
  });

  it('should resolve nested $ref', () => {
    const doc = {
      components: {
        schemas: {
          BaseUser: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          ExtendedUser: {
            allOf: [
              { $ref: '#/components/schemas/BaseUser' },
              {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                },
              },
            ],
          },
        },
      },
    };

    const result = resolveRefs(doc as unknown as JsonValue) as Obj;
    const schemas = ((result.components as Obj).schemas as Obj);
    const extended = schemas.ExtendedUser as Obj;
    // Verify the schema structure is preserved
    expect(extended).toBeDefined();
    expect(extended.allOf).toBeDefined();
    expect(Array.isArray(extended.allOf)).toBe(true);
    expect(extended.allOf).toHaveLength(2);
    // The second item (non-ref) should be preserved
    expect(((extended.allOf as Obj[])[1] as Obj).type).toBe('object');
  });

  it('should handle arrays with $ref', () => {
    const doc = {
      components: {
        schemas: {
          Item: { type: 'string' },
        },
      },
      data: [{ $ref: '#/components/schemas/Item' }, { $ref: '#/components/schemas/Item' }],
    };

    const result = resolveRefs(doc) as Obj;
    const data = result.data as unknown[];
    // Verify the refs were resolved in the array
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
    // P1-1 强化：两个数组元素都应解析为目标 schema（值相等），而非 { $ref }
    expect(data[0]).toEqual({ type: 'string' });
    expect(data[1]).toEqual({ type: 'string' });
    expect(data[0]).not.toHaveProperty('$ref');
    expect(data[1]).not.toHaveProperty('$ref');
  });

  it('should preserve non-resolvable $ref', () => {
    const doc = {
      data: { $ref: '#/components/schemas/NotFound' },
    };

    const result = resolveRefs(doc) as Obj;
    expect(result.data).toEqual({ $ref: '#/components/schemas/NotFound' });
  });

  it('should handle objects without $ref', () => {
    const doc = {
      name: 'test',
      value: 123,
      nested: { key: 'value' },
    };

    const result = resolveRefs(doc);
    expect(result).toEqual(doc);
  });

  it('should handle null and primitive values', () => {
    expect(resolveRefs(null)).toBe(null);
    expect(resolveRefs('string')).toBe('string');
    expect(resolveRefs(123)).toBe(123);
    expect(resolveRefs(true)).toBe(true);
  });
});

describe('extractPaths', () => {
  it('should extract endpoints from paths', () => {
    const doc = {
      paths: {
        '/users': {
          get: {
            summary: 'List users',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
          post: {
            summary: 'Create user',
            responses: {
              '201': {
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    };

    const endpoints = extractPaths(doc);
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toMatchObject({
      path: '/users',
      method: 'GET',
      name: 'List users',
    });
    expect(endpoints[1]).toMatchObject({
      path: '/users',
      method: 'POST',
      name: 'Create user',
    });
  });

  it('should extract all HTTP methods', () => {
    const doc = {
      paths: {
        '/resource': {
          get: { responses: { '200': {} } },
          post: { responses: { '201': {} } },
          put: { responses: { '200': {} } },
          delete: { responses: { '204': {} } },
          patch: { responses: { '200': {} } },
          options: { responses: { '200': {} } },
          head: { responses: { '200': {} } },
        },
      },
    };

    const endpoints = extractPaths(doc);
    // TRACE is added implicitly by the HTTP_METHODS constant
    expect(endpoints).toHaveLength(7);
    const methods = endpoints.map((e) => e.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
    expect(methods).toContain('PATCH');
    expect(methods).toContain('OPTIONS');
    expect(methods).toContain('HEAD');
  });

  it('should extract operationId as name when summary is not present', () => {
    const doc = {
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: { '200': {} },
          },
        },
      },
    };

    const endpoints = extractPaths(doc);
    expect(endpoints[0].name).toBe('getUsers');
  });

  it('should extract description', () => {
    const doc = {
      paths: {
        '/users': {
          get: {
            description: 'Get all users in the system',
            responses: { '200': {} },
          },
        },
      },
    };

    const endpoints = extractPaths(doc);
    expect(endpoints[0].description).toBe('Get all users in the system');
  });

  it('should extract response schemas', () => {
    const doc = {
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const endpoints = extractPaths(doc);
    expect(endpoints[0].responses).toHaveLength(1);
    expect(endpoints[0].responses[0].statusCode).toBe(200);
    expect(endpoints[0].responses[0].body).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('should handle default response status', () => {
    const doc = {
      paths: {
        '/users': {
          get: {
            responses: {
              default: {
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    };

    const endpoints = extractPaths(doc);
    expect(endpoints[0].responses[0].statusCode).toBe(200);
  });

  it('should handle empty paths object', () => {
    const endpoints = extractPaths({ paths: {} });
    expect(endpoints).toEqual([]);
  });

  it('should handle missing paths', () => {
    const endpoints = extractPaths({});
    expect(endpoints).toEqual([]);
  });
});

describe('parseAndExtract', () => {
  it('should parse and extract complete OpenAPI document', () => {
    const yamlContent = `
openapi: 3.0.0
info:
  title: Sample API
  version: 1.0.0
paths:
  /users:
    get:
      summary: Get users
      responses:
        '200':
          content:
            application/json:
              schema:
                type: array
    `;

    const result = parseAndExtract(yamlContent, 'yaml');
    expect(result.errors).toHaveLength(0);
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0]).toMatchObject({
      path: '/users',
      method: 'GET',
      name: 'Get users',
    });
  });

  it('should collect errors during parsing', () => {
    const result = parseAndExtract('invalid content', 'json');
    expect(result.endpoints).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Failed to parse JSON');
  });

  it('should continue extraction even if ref resolution fails', () => {
    const content = JSON.stringify({
      openapi: '3.0.0',
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/NotFound' },
                  },
                },
              },
            },
          },
        },
      },
    });

    const result = parseAndExtract(content, 'json');
    expect(result.endpoints).toHaveLength(1);
  });

  it('should handle invalid document structure', () => {
    const result = parseAndExtract('null', 'yaml');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('detectFormat', () => {
  it('should detect JSON object', () => {
    expect(detectFormat('{"key": "value"}')).toBe('json');
  });

  it('should detect JSON array', () => {
    expect(detectFormat('["item1", "item2"]')).toBe('json');
  });

  it('should detect JSON with whitespace', () => {
    expect(detectFormat('  {"key": "value"}  ')).toBe('json');
  });

  it('should default to YAML for non-JSON', () => {
    expect(detectFormat('key: value')).toBe('yaml');
  });

  it('should detect YAML content', () => {
    expect(detectFormat('openapi: 3.0.0\ninfo:\n  title: Test')).toBe('yaml');
  });

  it('should handle YAML array syntax', () => {
    expect(detectFormat('- item1\n- item2')).toBe('yaml');
  });
});

describe('Integration tests', () => {
  it('should handle complex OpenAPI document with refs', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Pet Store', version: '1.0.0' },
      components: {
        schemas: {
          Pet: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
            },
          },
        },
      },
      paths: {
        '/pets': {
          get: {
            summary: 'List all pets',
            operationId: 'listPets',
            responses: {
              '200': {
                description: 'A paged array of pets',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Pet' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = parseAndExtract(JSON.stringify(doc), 'json');
    expect(result.endpoints).toHaveLength(1);
    // Verify the response body has the resolved schema structure
    const body = result.endpoints[0].responses[0].body as Obj | undefined;
    expect(body).toBeDefined();
    expect(body?.type).toBe('array');
    expect(body?.items).toBeDefined();
  });

  it('should handle OpenAPI 2.0 (Swagger) format', () => {
    const doc = {
      swagger: '2.0',
      info: { title: 'API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                schema: { type: 'array' },
              },
            },
          },
        },
      },
    };

    const result = parseAndExtract(JSON.stringify(doc), 'json');
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].path).toBe('/users');
  });
});

// ============================================
// P2-16:循环引用检测(detectCircularRef + parseAndExtract 集成)
// ============================================
describe('detectCircularRef (P2-16)', () => {
  it('无环文档返回 null', () => {
    const doc = { openapi: '3.0.0', paths: { '/users': { get: {} } } };
    expect(detectCircularRef(doc)).toBeNull();
  });

  it('基本类型 / null / 数组元素无环返回 null', () => {
    expect(detectCircularRef(null)).toBeNull();
    expect(detectCircularRef('str')).toBeNull();
    expect(detectCircularRef(42)).toBeNull();
    expect(detectCircularRef([1, { a: 2 }, 'x'])).toBeNull();
  });

  it('对象自引用(直接环)→ 命中', () => {
    const obj: Record<string, unknown> = { name: 'a' };
    obj.self = obj;
    const hit = detectCircularRef(obj);
    expect(hit).not.toBeNull();
    expect(hit).toContain('self');
  });

  it('嵌套环 a.b.c → a → 命中并返回路径', () => {
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = { parent: a };
    const c: Record<string, unknown> = { parent: b };
    a.child = c; // a → c → b → a (环)
    const hit = detectCircularRef(a);
    expect(hit).not.toBeNull();
    // 路径应从 root 开始
    expect(hit).toMatch(/^root\./);
  });

  it('数组内环 → 命中(路径含 [n])', () => {
    const arr: unknown[] = [1, 2];
    arr.push(arr); // 自环
    const hit = detectCircularRef(arr);
    expect(hit).not.toBeNull();
    expect(hit).toMatch(/\[\d+\]/);
  });

  it('DAG 共享引用(非环)→ 返回 null,不误杀', () => {
    // 共享子对象被多个属性引用,但不在同一条向下路径上 → 不是环
    const shared = { value: 1 };
    const doc = { a: { child: shared }, b: { child: shared } };
    expect(detectCircularRef(doc)).toBeNull();
  });
});

describe('parseAndExtract 循环引用 (P2-16)', () => {
  it('YAML 锚点/别名形成的循环对象 → 返回空端点 + 明确错误(不抛 500)', () => {
    // 真实场景:YAML `&anchor` + `*alias` 自引用 → js-yaml 解析产出 JS 堆中的环对象。
    // 此前 JSON.stringify(response.body) 必抛 → 路由 500。P2-16 在 parseAndExtract
    // 内提前 detectCircularRef,命中即返回空端点 + 明确错误,路由据此返 400。
    const cyclicYaml = `
openapi: 3.0.0
info:
  title: Loop
  version: 1.0.0
paths: &paths
  /users:
    get:
      responses:
        '200':
          description: ok
  back: *paths
`;
    const result = parseAndExtract(cyclicYaml, 'yaml');
    expect(result.endpoints).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    // 错误信息应明确提及"循环引用",便于前端展示
    expect(result.errors.some((e) => e.includes('循环引用'))).toBe(true);
  });

  it('正常 OpenAPI 文档(无环)→ 解析正常,循环检测不影响', () => {
    const spec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'T', version: '1' },
      paths: { '/users': { get: { responses: { '200': { description: 'ok' } } } } },
    });
    const result = parseAndExtract(spec, 'json');
    expect(result.errors).toHaveLength(0);
    expect(result.endpoints).toHaveLength(1);
  });
});

// ============================================
// 真实数据导入:example / examples 优先于 schema
// ============================================
describe('extractPaths: example 真实数据优先', () => {
  function docWith(mediaType: Record<string, unknown>): JsonValue {
    return {
      paths: {
        '/users': {
          get: {
            responses: {
              '200': { content: { 'application/json': mediaType } },
            },
          },
        },
      },
    } as unknown as JsonValue;
  }
  const SCHEMA = { type: 'object', properties: { id: { type: 'integer' } } };

  it('有 example → body 为真实数据而非 schema', () => {
    const example = { code: 0, data: { list: [{ id: 1, name: '张三' }] } };
    const endpoints = extractPaths(docWith({ schema: SCHEMA, example }));
    expect(endpoints[0].responses[0].body).toEqual(example);
  });

  it('example 为 falsy 值(0 / false / {})也生效(判 undefined 而非真值)', () => {
    expect(extractPaths(docWith({ schema: SCHEMA, example: 0 }))[0].responses[0].body).toBe(0);
    expect(extractPaths(docWith({ schema: SCHEMA, example: false }))[0].responses[0].body).toBe(false);
    expect(extractPaths(docWith({ schema: SCHEMA, example: {} }))[0].responses[0].body).toEqual({});
  });

  it('无 example 有 examples map → 取第一个条目的 value', () => {
    const endpoints = extractPaths(docWith({
      schema: SCHEMA,
      examples: {
        vip: { summary: 'VIP 用户', value: { id: 1, level: 'gold' } },
        normal: { value: { id: 2 } },
      },
    }));
    expect(endpoints[0].responses[0].body).toEqual({ id: 1, level: 'gold' });
  });

  it('examples 条目无 value(externalValue 风格)→ 退回 schema', () => {
    const endpoints = extractPaths(docWith({
      schema: SCHEMA,
      examples: { ext: { externalValue: 'https://example.com/x.json' } },
    }));
    expect(endpoints[0].responses[0].body).toEqual(SCHEMA);
  });

  it('无 example/examples → 退回 schema(历史行为不变)', () => {
    const endpoints = extractPaths(docWith({ schema: SCHEMA }));
    expect(endpoints[0].responses[0].body).toEqual(SCHEMA);
  });

  it('example 显式为 null → body 为 null(判 undefined,null 是显式值)', () => {
    expect(extractPaths(docWith({ schema: SCHEMA, example: null }))[0].responses[0].body).toBeNull();
  });
});

describe('extractPaths: OpenAPI 路径参数 {id} → :id', () => {
  it('{id} 转换为 :id(mock 路由只认冒号风格)', () => {
    const doc = {
      paths: {
        '/users/{id}': { get: { responses: { '200': {} } } },
        '/orders/{orderId}/items/{itemId}': { get: { responses: { '200': {} } } },
      },
    };
    const endpoints = extractPaths(doc);
    expect(endpoints[0].path).toBe('/users/:id');
    expect(endpoints[1].path).toBe('/orders/:orderId/items/:itemId');
  });

  it('无路径参数的原样保留', () => {
    const doc = { paths: { '/users': { get: { responses: { '200': {} } } } } };
    expect(extractPaths(doc)[0].path).toBe('/users');
  });
});
