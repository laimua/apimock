import yaml from 'js-yaml';

/**
 * JSON 值类型（递归）——OpenAPI 文档本质是 JSON 树
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

/**
 * Parsed endpoint representation
 */
export interface ParsedEndpoint {
  path: string;
  method: string;
  name?: string;
  description?: string;
  responses: {
    statusCode: number;
    body?: JsonValue;
  }[];
}

/**
 * Result of OpenAPI parsing operation
 */
export interface OpenAPIParseResult {
  endpoints: ParsedEndpoint[];
  errors: string[];
}

/**
 * HTTP methods to extract from OpenAPI paths
 */
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'] as const;

/**
 * T2: Parse OpenAPI file content (YAML or JSON)
 * @param content - File content as string
 * @param format - Format type: 'yaml' or 'json'
 * @returns Parsed OpenAPI document object
 */
export function parseOpenAPIFile(content: string, format: 'yaml' | 'json'): JsonValue {
  try {
    if (format === 'yaml') {
      return yaml.load(content) as JsonValue;
    } else {
      return JSON.parse(content) as JsonValue;
    }
  } catch (error) {
    throw new Error(`Failed to parse ${format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * P2-16 修复:循环引用检测。
 *
 * 背景:YAML 锚点/别名(`&anchor` / `*alias`)可造出循环对象图,JSON.parse 不会
 * (JSON 标准不支持引用)。一旦解析产物含环,后续 `JSON.stringify(response.body)`
 * 必抛 `Converting circular structure to JSON` → 路由 500。
 *
 * 本函数用 DFS + 路径栈(WeakSet 记录"当前路径上"的对象,进入 add / 退出 delete):
 *   - 同一对象在**同一条**向下路径上重复出现 → 真环,返回路径描述
 *   - 同一对象被多条兄弟路径共享(DAG)→ 不算环(进入前不在栈上)
 * 这与 resolveRefs 的 $ref 解析栈思路一致,但针对的是 JS 堆中的原生环对象。
 *
 * 递归实现:正常 OpenAPI 文档深度有限(<50),不会栈溢出;resolveRefs 内部已用
 * `RESOLVE_DEPTH_LIMIT=50` 兜底超深输入。
 *
 * @param doc - 解析后的文档对象
 * @returns 命中环时返回形如 `"root.a.b.a"` 的路径;无环返回 null
 */
export function detectCircularRef(doc: unknown): string | null {
  if (doc === null || typeof doc !== 'object') return null;
  const onPath = new WeakSet<object>();

  function visit(value: unknown, path: string): string | null {
    if (value === null || typeof value !== 'object') return null;
    const obj = value as object;
    if (onPath.has(obj)) {
      return path; // 命中环:返回从 root 到环回点的路径
    }
    onPath.add(obj);
    try {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const hit = visit(value[i], `${path}[${i}]`);
          if (hit) return hit;
        }
      } else {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          const hit = visit(v, path === 'root' ? `root.${k}` : `${path}.${k}`);
          if (hit) return hit;
        }
      }
      return null;
    } finally {
      onPath.delete(obj);
    }
  }

  return visit(doc, 'root');
}

/**
 * 循环引用检测：深度上限（防超深嵌套/意外退化为链表的情况）
 */
const RESOLVE_DEPTH_LIMIT = 50;

/**
 * T5: Resolve all $ref references in the document
 * Recursively finds and resolves JSON References like #/components/schemas/Xxx
 *
 * 实现要点（P1-1 修复）：
 *   1. **root 参数透传**：首次调用传入文档根，递归到 `$ref` 节点时用 **root** 而非当前节点
 *      去查 pointer，否则 `#/components/schemas/X` 永远在当前节点下查不到 → 静默返回 `{$ref}`。
 *   2. **循环 guard 用「解析栈」**：记录当前正在解析的 $ref 指针路径（Set），进入 push / 退出 pop。
 *      这样 DAG 共享引用（同一 schema 被多个属性引用，但不在同一条解析链上）**不会被误杀**，
 *      只有真环（同一 pointer 在同一条解析链上重复出现）才断。codex 重点关注项 ①。
 *   3. **深度上限**：防超深嵌套或意外退化的兜底。
 *
 * @param doc - OpenAPI 文档（首次调用）或子节点（递归）
 * @param root - 文档根（用于 $ref 指针查找）；省略时等价于 doc
 * @param stack - 解析栈（内部用，外部不传）
 * @param depth - 当前递归深度（内部用，外部不传）
 * @returns Node with all references resolved
 */
export function resolveRefs(
  doc: JsonValue,
  root?: JsonValue,
  stack?: Set<string>,
  depth?: number,
): JsonValue {
  const rootDoc = root ?? doc;
  const seen = stack ?? new Set<string>();
  const d = depth ?? 0;

  if (d > RESOLVE_DEPTH_LIMIT) {
    // 超深嵌套：避免极端/退化输入导致栈溢出
    return doc;
  }

  if (doc === null || typeof doc !== 'object') {
    return doc;
  }

  // Handle arrays
  if (Array.isArray(doc)) {
    return doc.map(item => resolveRefs(item, rootDoc, seen, d + 1));
  }

  // Handle $ref
  if ('$ref' in doc) {
    const refPath = doc.$ref;
    if (typeof refPath === 'string' && refPath.startsWith('#')) {
      return resolveRefPointer(rootDoc, refPath, seen, d);
    }
    return doc;
  }

  // Recursively resolve refs in object properties
  const result: JsonObject = {};
  for (const [key, value] of Object.entries(doc)) {
    result[key] = resolveRefs(value, rootDoc, seen, d + 1);
  }
  return result;
}

/**
 * Resolve a JSON Pointer reference (e.g., #/components/schemas/User)
 *
 * P1-1 + P2-18 修复：
 *   - **root 参数**：始终用文档根做查找（由调用方透传）。
 *   - **空 pointer（P2-18）**：`{"$ref":"#"}` 或 `"#/"` → parts 为空 → 直接返回根节点本身，
 *     避免对自身无限递归导致 RangeError。
 *   - **循环 guard（解析栈）**：进入时把 pointer 推入 stack，退出时弹出。
 *     若 pointer 已在 stack 中 → 真环，返回原 `{$ref}` 节点（不断、不抛、不死循环）。
 *     DAG 共享引用（同一 schema 被多个属性引用）因不在同一条解析链上，**不会**误杀。
 */
function resolveRefPointer(
  rootDoc: JsonValue,
  pointer: string,
  stack: Set<string>,
  depth: number,
): JsonValue {
  // P2-18：parts 为空（"#"/"#/"）→ 返回根节点本身，不递归调用 resolveRefs(rootDoc)
  // （否则 rootDoc === root 会在 resolveRefs 内对 root 自身递归 → 无限循环 → RangeError）
  const parts = pointer.substring(1).split('/').filter(Boolean);

  // 真环检测：同一 pointer 在当前解析链上重复出现 → 断开，返回原 {$ref}
  if (stack.has(pointer)) {
    return { $ref: pointer };
  }

  if (parts.length === 0) {
    // 指向根：直接返回根节点本身（不再向下 resolve，避免 root→root 无限递归）
    return rootDoc;
  }

  let current: JsonValue = rootDoc;
  for (const part of parts) {
    if (current && typeof current === 'object' && !Array.isArray(current) && part in current) {
      current = current[part];
    } else {
      // Reference not found, return original
      return { $ref: pointer };
    }
  }

  // Recursively resolve refs in the referenced value（入栈/出栈 guard DAG vs 环）
  stack.add(pointer);
  try {
    return resolveRefs(current, rootDoc, stack, depth + 1);
  } finally {
    stack.delete(pointer);
  }
}

/**
 * T3: Extract API endpoints from OpenAPI paths
 * @param doc - Parsed OpenAPI document
 * @returns Array of parsed endpoints
 */
export function extractPaths(doc: JsonValue): ParsedEndpoint[] {
  const endpoints: ParsedEndpoint[] = [];

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return endpoints;
  }
  const paths = (doc as JsonObject).paths;
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) {
    return endpoints;
  }

  for (const [rawPath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object' || Array.isArray(pathItem)) continue;
    const pathObj = pathItem as JsonObject;
    // OpenAPI 路径参数 {id} → ApiMock 路由匹配用的 :id(mock 路由只认冒号风格,
    // 不转换则带参端点导入后永远 404)
    const path = rawPath.replace(/\{([^}/]+)\}/g, ':$1');

    for (const method of HTTP_METHODS) {
      if (method in pathObj) {
        const operation = pathObj[method];
        if (operation && typeof operation === 'object' && !Array.isArray(operation)) {
          endpoints.push(extractEndpoint(path, method.toUpperCase(), operation as JsonObject));
        }
      }
    }
  }

  return endpoints;
}

/**
 * Extract a single endpoint from an operation object
 */
function extractEndpoint(path: string, method: string, operation: JsonObject): ParsedEndpoint {
  const responses: ParsedEndpoint['responses'] = [];

  const opResponses = operation.responses;
  if (opResponses && typeof opResponses === 'object' && !Array.isArray(opResponses)) {
    for (const [status, response] of Object.entries(opResponses as JsonObject)) {
      const statusCode = status === 'default' ? 200 : parseInt(status, 10);
      const body = extractResponseBody(response);
      responses.push({ statusCode, body });
    }
  }

  const summary = operation.summary;
  const operationId = operation.operationId;
  const description = operation.description;

  return {
    path,
    method,
    name: typeof summary === 'string' ? summary : (typeof operationId === 'string' ? operationId : undefined),
    description: typeof description === 'string' ? description : undefined,
    responses,
  };
}

/**
 * Extract response body from response object
 */
function extractResponseBody(response: JsonValue): JsonValue | undefined {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return undefined;
  }
  const responseObj = response as JsonObject;

  const content = responseObj.content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const contentObj = content as JsonObject;
    // Try to get application/json first
    const jsonContent = contentObj['application/json'] as JsonObject | undefined;
    if (jsonContent) {
      const body = extractBodyFromMediaType(jsonContent);
      if (body !== undefined) {
        return body;
      }
    }
    // Fallback to first content type
    const firstContent = Object.values(contentObj)[0] as JsonObject | undefined;
    if (firstContent) {
      const body = extractBodyFromMediaType(firstContent);
      if (body !== undefined) {
        return body;
      }
    }
  }

  return responseObj.schema;
}

/**
 * 从 media type 对象提取响应体:优先真实示例数据(`example`,或 `examples` map
 * 第一个条目的 `value`),都没有时退回 schema 对象本身(历史行为)。
 * 这样调用方(agent / 用户)在文档里写好 example,导入后 mock 直接返回真实数据。
 */
function extractBodyFromMediaType(mediaType: JsonObject): JsonValue | undefined {
  if (mediaType.example !== undefined) {
    return mediaType.example;
  }
  const examples = mediaType.examples;
  if (examples && typeof examples === 'object' && !Array.isArray(examples)) {
    const first = Object.values(examples as JsonObject)[0];
    if (first && typeof first === 'object' && !Array.isArray(first) && 'value' in first) {
      return (first as JsonObject).value;
    }
  }
  return mediaType.schema;
}

/**
 * T7: Main parsing pipeline
 * Combines all parsing steps with comprehensive error handling
 * @param content - OpenAPI file content
 * @param format - Format type: 'yaml' or 'json'
 * @returns Parse result with endpoints and any errors
 */
export function parseAndExtract(content: string, format: 'yaml' | 'json'): OpenAPIParseResult {
  const errors: string[] = [];
  const result: OpenAPIParseResult = {
    endpoints: [],
    errors,
  };

  // Step 1: Parse file content
  let doc: JsonValue;
  try {
    doc = parseOpenAPIFile(content, format);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }

  // Validate basic structure
  if (!doc || typeof doc !== 'object') {
    errors.push('Invalid OpenAPI document: not an object');
    return result;
  }

  // P2-16:检测循环引用。YAML 锚点/别名可造出循环对象图,后续 JSON.stringify 必抛
  // → 路由 500。此处提前检测,若命中则返回空端点 + 明确错误,让路由返 400
  // (INVALID_OPENAPI)。注意 resolveRefs 的 $ref 解析栈只防 $ref 环,不防 JS 原生环。
  const cyclePath = detectCircularRef(doc);
  if (cyclePath) {
    errors.push(`文档含循环引用(命中路径:${cyclePath}),请去除 YAML 锚点/别名形成的环`);
    return result;
  }

  // Step 2: Resolve all $ref references
  try {
    doc = resolveRefs(doc);
  } catch (error) {
    errors.push(`Reference resolution failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 3: Extract endpoints (continue even if ref resolution had issues)
  try {
    result.endpoints = extractPaths(doc);
  } catch (error) {
    errors.push(`Endpoint extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Auto-detect format from content
 */
export function detectFormat(content: string): 'yaml' | 'json' {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }
  return 'yaml';
}
