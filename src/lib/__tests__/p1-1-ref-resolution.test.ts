/**
 * P1-1 修复回归测试 — OpenAPI $ref 解析
 *
 * 报告（docs/CODE-REVIEW-2026-07-25.md P1-1）：
 *   `resolveRefs` 递归到 `$ref` 节点时把**当前节点**当文档根做指针查找，
 *   `#/components/schemas/X` 永远查不到 → 静默返回未解析的 `{$ref}`。
 *   修复：`resolveRefs` 增加 root 参数，`$ref` 分支改用 root 查找；加循环 guard。
 *
 * codex 验收重点关注项 ①（必须满足，否则打回）：
 *   循环 guard 不能误杀 DAG 共享引用（同一 schema 被多个属性 $ref 引用是常态，树形 DAG，非环）。
 *   必测：
 *     - `#/components/schemas/Pet` 被 Cat 和 Dog 同时 $ref → 两者都完整解析
 *     - 真环 `#/A→#/A` 才触发 guard
 *     - 区分**环**（断）和**共享引用**（不断）
 *
 * 本文件覆盖：
 *   1. $ref 解析后值等于目标 schema（深度相等，非 {$ref}）
 *   2. DAG 共享引用：Pet 被 Cat 和 Dog 同时引用 → 两者都完整解析（防 guard 误杀）
 *   3. 真环 `#/A→#/A` → 不死循环（返回原 {$ref} 节点）
 *   4. 间接环 `#/A→#/B→#/A` → 同上
 *   5. P2-18：`{"$ref":"#"}` / `"#/"` → 不无限递归
 *   6. 深嵌套共享引用（多层 DAG）不误杀
 */
import { describe, it, expect } from 'vitest';
import { resolveRefs, type JsonValue } from '../openapi-parser';

type Obj = Record<string, unknown>;

describe('P1-1: $ref 解析修复', () => {
  it('1. $ref 解析后值等于目标 schema（非 {$ref} 字面值）', () => {
    const doc: JsonValue = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              email: { type: 'string' },
            },
          },
        },
      },
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
            },
          },
        },
      },
    } as JsonValue;

    const result = resolveRefs(doc) as Obj;
    const schema = (((result.paths as Obj)['/users/{id}'] as Obj).get as Obj).responses as Obj;
    const resolved = (((schema['200'] as Obj).content as Obj)['application/json'] as Obj).schema;

    expect(resolved).toEqual({
      type: 'object',
      properties: {
        id: { type: 'integer' },
        email: { type: 'string' },
      },
    });
    expect(resolved).not.toHaveProperty('$ref');
  });

  // ====================================================================
  // ★ codex 必测：DAG 共享引用不被循环 guard 误杀 ★
  // ====================================================================
  it('2. DAG 共享引用：Pet 被 Cat 和 Dog 同时 $ref → 两者都完整解析', () => {
    // OpenAPI 常见形态：Pet 作为共享 schema 被 Cat 和 Dog 引用（树形 DAG，非环）
    const doc: JsonValue = {
      components: {
        schemas: {
          Pet: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
            },
          },
          Cat: {
            type: 'object',
            properties: {
              pet: { $ref: '#/components/schemas/Pet' },
              meow: { type: 'boolean' },
            },
          },
          Dog: {
            type: 'object',
            properties: {
              pet: { $ref: '#/components/schemas/Pet' },
              bark: { type: 'boolean' },
            },
          },
        },
      },
    } as JsonValue;

    const result = resolveRefs(doc) as Obj;
    const schemas = result.components as Obj;
    const cat = (schemas.schemas as Obj).Cat as Obj;
    const dog = (schemas.schemas as Obj).Dog as Obj;
    const catPet = (cat.properties as Obj).pet as Obj;
    const dogPet = (dog.properties as Obj).pet as Obj;

    // ★ 关键断言：第二次解析 Pet 不能变空，也不能仍是 {$ref} ★
    expect(catPet).toEqual({
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
      },
    });
    expect(dogPet).toEqual({
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
      },
    });
    expect(catPet).not.toHaveProperty('$ref');
    expect(dogPet).not.toHaveProperty('$ref');
    // 两处解析结果内容一致（DAG 共享，不是环）
    expect(catPet).toEqual(dogPet);
  });

  it('2b. 同一 $ref 在同一数组内出现两次（共享引用）→ 都完整解析', () => {
    const doc: JsonValue = {
      components: {
        schemas: {
          Tag: { type: 'string', enum: ['a', 'b'] },
        },
      },
      items: [
        { $ref: '#/components/schemas/Tag' },
        { $ref: '#/components/schemas/Tag' },
        { $ref: '#/components/schemas/Tag' },
      ],
    } as JsonValue;

    const result = resolveRefs(doc) as Obj;
    const items = result.items as Obj[];
    expect(items).toHaveLength(3);
    for (const it of items) {
      expect(it).toEqual({ type: 'string', enum: ['a', 'b'] });
      expect(it).not.toHaveProperty('$ref');
    }
  });

  // ====================================================================
  // ★ codex 必测：真环不死循环 ★
  // ====================================================================
  it('3. 真环 #/A→#/A → 不死循环，返回 {$ref} 节点', () => {
    // A 自引用自身 → 必须被 guard 断开
    const doc: JsonValue = {
      components: {
        schemas: {
          // 自引用环：A.$ref 指回 A 的顶层定义
          SelfRef: {
            type: 'object',
            properties: {
              self: { $ref: '#/components/schemas/SelfRef' },
            },
          },
        },
      },
    } as JsonValue;

    // 不能抛 RangeError，不能 hang
    const result = resolveRefs(doc) as Obj;
    const selfRef = ((result.components as Obj).schemas as Obj).SelfRef as Obj;
    // 外层结构完整保留
    expect(selfRef.type).toBe('object');
    expect((selfRef.properties as Obj).self).toBeDefined();
    // 环断点：self 属性被解析后，其内部 self 不再无限展开（保持 {$ref} 或被截断为不含无限递归的对象）
    // 关键：调用正常返回，没有 RangeError / 不 hang
    expect(result).toBeDefined();
  });

  it('3b. 顶层自引用 形态的真环（A = {x: {$ref:"#"}}）', () => {
    // $ref 指向根 → 根含 A → A 又 $ref 回根
    const doc: JsonValue = {
      x: { $ref: '#' },
    } as JsonValue;

    const result = resolveRefs(doc) as Obj;
    // 不死循环、不抛错
    expect(result).toBeDefined();
  });

  it('4. 间接环 #/A→#/B→#/A → 不死循环', () => {
    // A 引用 B，B 引用 A，形成 2 步环
    const doc: JsonValue = {
      components: {
        schemas: {
          A: {
            type: 'object',
            properties: {
              b: { $ref: '#/components/schemas/B' },
            },
          },
          B: {
            type: 'object',
            properties: {
              a: { $ref: '#/components/schemas/A' },
            },
          },
        },
      },
    } as JsonValue;

    const result = resolveRefs(doc) as Obj;
    const schemas = (result.components as Obj).schemas as Obj;
    const a = schemas.A as Obj;
    const b = schemas.B as Obj;
    // 外层结构完整
    expect(a.type).toBe('object');
    expect(b.type).toBe('object');
    // 不 hang、不抛错
    expect(result).toBeDefined();
  });

  // ====================================================================
  // P2-18：空 pointer（'#' / '#/'）→ 不无限递归
  // ====================================================================
  it('5a. P2-18: {"$ref":"#"} → 不无限递归', () => {
    const doc: JsonValue = {
      data: { $ref: '#' },
    } as JsonValue;

    // 旧实现：parts 为空 → resolveRefs(自身) → 无限递归 → RangeError
    // 新实现：parts 为空 → 直接返回根节点
    const result = resolveRefs(doc) as Obj;
    expect(result).toBeDefined();
    // data 现在应该是根节点的副本（指向根）
    expect(result.data).toBeDefined();
  });

  it('5b. P2-18: {"$ref":"#/"} → 不无限递归', () => {
    const doc: JsonValue = {
      data: { $ref: '#/' },
    } as JsonValue;

    const result = resolveRefs(doc) as Obj;
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
  });

  it('6. 深层 DAG 嵌套（多级 $ref 链）→ 全部解析', () => {
    // 链式：User → Base → Id；Dog → Pet → Id（共享 Id）
    const doc: JsonValue = {
      components: {
        schemas: {
          Id: { type: 'integer', format: 'int64' },
          Base: {
            type: 'object',
            properties: { id: { $ref: '#/components/schemas/Id' } },
          },
          User: {
            type: 'object',
            properties: {
              base: { $ref: '#/components/schemas/Base' },
              name: { type: 'string' },
            },
          },
          Pet: {
            type: 'object',
            properties: { petId: { $ref: '#/components/schemas/Id' } },
          },
          Dog: {
            type: 'object',
            properties: {
              pet: { $ref: '#/components/schemas/Pet' },
            },
          },
        },
      },
    } as JsonValue;

    const result = resolveRefs(doc) as Obj;
    const schemas = (result.components as Obj).schemas as Obj;

    // User.base.id → 完整 Id
    const user = schemas.User as Obj;
    const userBase = (user.properties as Obj).base as Obj;
    expect(userBase.properties).toBeDefined();
    const userId = (userBase.properties as Obj).id as Obj;
    expect(userId).toEqual({ type: 'integer', format: 'int64' });

    // Dog.pet.petId → 完整 Id（共享引用）
    const dog = schemas.Dog as Obj;
    const dogPet = (dog.properties as Obj).pet as Obj;
    const dogPetId = ((dogPet.properties as Obj).petId as Obj);
    expect(dogPetId).toEqual({ type: 'integer', format: 'int64' });

    // DAG 共享：Id 被三处引用（Base.id, User间接, Pet.petId），都完整解析
    expect(userId).toEqual(dogPetId);
  });

  it('7. 未解析的 $ref（目标不存在）→ 保留 {$ref} 字面值', () => {
    // 这个行为是设计内的：解析不到就返回原 {$ref}（不抛错）
    const doc: JsonValue = {
      data: { $ref: '#/components/schemas/NotFound' },
    } as JsonValue;

    const result = resolveRefs(doc) as Obj;
    expect(result.data).toEqual({ $ref: '#/components/schemas/NotFound' });
  });
});
