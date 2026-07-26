/**
 * Mock 响应选择纯函数（P1-2 + P1-3 抽离）
 *
 * 从 `src/app/[project]/[...path]/route.ts` 的 `buildEndpointResponse` 选择逻辑抽出，
 * 便于单测覆盖（route.ts 内函数未导出，无法直接测）。**route.ts 现调用本模块**，
 * 行为与重构前等价，并在 P1-3 上修正了 fallback 内 isDefault 可被无规则响应抢占的 bug。
 *
 * 选择语义（不变）：**matched（规则命中）> fallback**。
 *   - matched：response 有非空 matchRules 且匹配请求 query/header
 *   - fallback（matched 为空时进入）：
 *       端点级 responseBody（非 null/undefined） → responses 表 fallback
 *
 * P1-3 修复点（在 fallback 内的 responses 选择）：
 *   旧实现用单一 `fallback` 变量，非默认无规则响应只要排在 isDefault 前面就占住 fallback，
 *   isDefault 形同虚设。新实现拆为 `defaultResp` / `firstNoRule`，**优先取 defaultResp**，
 *   其次取 firstNoRule。matched 优先级**不动**。
 *
 * 报告：
 *   - P1-2（src/app/api/projects/[id]/import/route.ts:96 写死 '{}'）由导入层修复，本模块不关心
 *   - P1-3（src/app/[project]/[...path]/route.ts:187-199）由本模块的 selectResponseFromList 实现
 */

/**
 * matchRules 形态（与 route.ts 内部完全一致）
 */
export type MatchRules = { query?: Record<string, string>; header?: Record<string, string> };

/**
 * 端点最小接口（route.ts 的 Endpoint 类型子集；只取选择需要的字段）
 */
export interface SelectorEndpoint {
  responseBody: string | null;
  statusCode: number | null;
  contentType: string | null;
  delayMs: number | null;
}

/**
 * 响应最小接口（route.ts 的 Response 类型子集）
 */
export interface SelectorResponse {
  statusCode: number | null;
  contentType: string | null;
  headers: string | null;
  body: string | null;
  isDefault: number | boolean | null;
  priority: number | null;
  matchRules: string | null;
}

/**
 * 选择结果（与 route.ts toResponseObj 的形态对齐；headers 已 parse，body 已 parseJsonSafe）
 */
export interface SelectionResult {
  source: 'matched' | 'responseBody' | 'fallback' | 'empty';
  statusCode: number;
  contentType: string;
  headers: Record<string, string>;
  body: unknown;
  delay: number;
}

// ============================================
// 内部辅助：复刻 route.ts:104-141 的 matchRules 三件套（逐字一致）
// ============================================

export function parseMatchRules(raw: string | null | undefined): MatchRules {
  if (!raw || raw === '{}' || raw === '') return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch { /* ignore */ }
  return {};
}

export function hasRules(rules: MatchRules): boolean {
  const qLen = Object.keys(rules.query || {}).length;
  const hLen = Object.keys(rules.header || {}).length;
  return qLen + hLen > 0;
}

export function matchRule(
  rules: MatchRules,
  requestQuery: Record<string, string>,
  requestHeaders: Record<string, string>,
): boolean {
  if (rules.query) {
    for (const [key, value] of Object.entries(rules.query)) {
      if (requestQuery[key] !== value) return false;
    }
  }
  if (rules.header) {
    const lowerHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(requestHeaders)) {
      lowerHeaders[k.toLowerCase()] = v;
    }
    for (const [key, value] of Object.entries(rules.header)) {
      if (lowerHeaders[key.toLowerCase()] !== value) return false;
    }
  }
  return true;
}

/**
 * parseJsonSafe — 与 route.ts:92-99 一致
 */
function parseJsonSafe(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseHeaders(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 排序：与 route.ts orderBy(desc(priority)) 一致；priority 并列时按 createdAt 升序作次级键
 * （报告 P2-13：本函数接口未暴露 createdAt，调用方需在传入前已按 createdAt 升序排好，
 *  这里做稳定排序保持该顺序）。JS Array.sort 在 V8 是稳定排序，相等元素保持原序。
 */
function sortByPriorityDesc(list: SelectorResponse[]): SelectorResponse[] {
  return [...list].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * P1-3 核心：从已排序的 responseList 选出 fallback 响应（matched 为空时调用）
 *
 * 修复策略：拆 `defaultResp` / `firstNoRule` 两个变量，优先取 defaultResp。
 *   - defaultResp：第一条 isDefault 的无规则响应
 *   - firstNoRule：第一条非 isDefault 的无规则响应
 * 选择顺序：defaultResp ?? firstNoRule
 *
 * 这样：显式 priority 无规则响应（UI 创建）即便排在前面，也不会抢占 isDefault；
 * 导入形态（priority 全 0、一条 isDefault）也能正确取到 isDefault。
 */
export function selectFallbackResponse(sorted: SelectorResponse[]): SelectorResponse | null {
  let defaultResp: SelectorResponse | null = null;
  let firstNoRule: SelectorResponse | null = null;

  for (const resp of sorted) {
    const rules = parseMatchRules(resp.matchRules);
    if (hasRules(rules)) continue; // fallback 不考虑带规则的响应

    if (resp.isDefault) {
      if (!defaultResp) defaultResp = resp;
    } else if (!firstNoRule) {
      firstNoRule = resp;
    }
    // 两个变量都填满后可提前退出（不影响结果）
    if (defaultResp && firstNoRule) break;
  }

  return defaultResp ?? firstNoRule;
}

/**
 * 端点级 responseBody 包装成伪 SelectorResponse（与 route.ts:206-213 行为一致）
 */
function endpointResponseBodyAsResponse(endpoint: SelectorEndpoint): SelectorResponse {
  return {
    statusCode: endpoint.statusCode,
    contentType: endpoint.contentType,
    headers: '{}',
    body: endpoint.responseBody,
    isDefault: false,
    priority: null,
    matchRules: null,
  };
}

function toResult(
  source: SelectionResult['source'],
  endpoint: SelectorEndpoint,
  resp: SelectorResponse | null,
): SelectionResult {
  return {
    source,
    statusCode: resp?.statusCode || 200,
    contentType: resp?.contentType || 'application/json',
    headers: parseHeaders(resp?.headers),
    body: parseJsonSafe(resp?.body),
    delay: endpoint.delayMs || 0,
  };
}

/**
 * 选择 mock 响应的纯函数。
 *
 * 语义：**matched（规则命中）> 端点级 responseBody > responses fallback > 空 200 {}**
 *
 * @param endpoint 端点（含 responseBody / statusCode / contentType / delayMs）
 * @param responseList 该端点的全部 responses（DB 查询结果，已按 createdAt 升序或任意顺序均可，本函数内部按 priority desc 重排）
 * @param requestQuery 请求 query（小写无关）
 * @param requestHeaders 请求 headers（key 大小写不敏感，matchRule 内部做 lower）
 *
 * 返回 SelectionResult；source 字段用于测试断言来源链路（matched/responseBody/fallback/empty）。
 */
export function selectResponse(
  endpoint: SelectorEndpoint,
  responseList: SelectorResponse[],
  requestQuery: Record<string, string> = {},
  requestHeaders: Record<string, string> = {},
): SelectionResult {
  const sorted = sortByPriorityDesc(responseList);

  // 1. matched（规则命中）— 优先级最高，不被 isDefault / responseBody 抢占
  let matched: SelectorResponse | null = null;
  for (const resp of sorted) {
    const rules = parseMatchRules(resp.matchRules);
    if (hasRules(rules) && matchRule(rules, requestQuery, requestHeaders)) {
      matched = resp;
      break; // 取 priority 最高的第一个匹配
    }
  }
  if (matched) {
    return toResult('matched', endpoint, matched);
  }

  // 2. 端点级 responseBody（P1-2 修复后，导入路径 responseBody=null，此分支不命中 → 进 fallback）
  if (endpoint.responseBody !== null && endpoint.responseBody !== undefined) {
    return toResult('responseBody', endpoint, endpointResponseBodyAsResponse(endpoint));
  }

  // 3. fallback（P1-3 修复：defaultResp 优先于 firstNoRule）
  const fallback = selectFallbackResponse(sorted);
  if (fallback) {
    return toResult('fallback', endpoint, fallback);
  }

  // 4. 全空：返回 200 + 空 body（route.ts:215 toResponseObj(endpoint, null) 的行为）
  return toResult('empty', endpoint, null);
}

// ============================================
// P1-10: mock 响应序列化决策（纯函数,便于单测覆盖）
// ============================================

/**
 * mock 响应序列化形态。
 * - `text`: 走 `new NextResponse(text)` 原始文本分支(body 原样返回,不经 JSON 序列化)
 * - `json`: 走 `NextResponse.json(value)` 分支(对象/数组等输出合法 JSON)
 */
export type SerializedMockResponse =
  | { kind: 'text'; text: string }
  | { kind: 'json'; value: unknown };

/**
 * 从 Content-Type 头值中解析出 media type(去掉 `;` 之后的参数,如 charset)。
 *
 * P2-39 修复:`application/json; charset=utf-8` 经解析得 `application/json`,
 * 不再被精确比较 `!== 'application/json'` 误判为非 JSON 分支(对象 body 经 `String()`
 * 变成 `[object Object]`)。
 *
 * 与 RFC 7231 一致:取 `;` 前的 type/substring,去除前后 OWS(空白),整体小写。
 * 输入为空或非法时返回空串(调用方按非 JSON 分支处理)。
 */
export function mediaType(contentType: string | null | undefined): string {
  if (!contentType) return '';
  // 取 `;` 前的 media type;trim OWS;整体小写做大小写不敏感比较
  const semi = contentType.indexOf(';');
  const raw = semi >= 0 ? contentType.slice(0, semi) : contentType;
  return raw.trim().toLowerCase();
}

/**
 * 决定 mock 响应如何序列化,与 `src/app/[project]/[...path]/route.ts` 的响应构建逻辑对齐。
 *
 * 分流规则:
 *   1. media type 非 `application/json` → text(body 原样/降级 String())
 *   2. body 是字符串 → text(P1-10:避免 NextResponse.json 把字符串再序列化成合法 JSON)
 *   3. 否则 → json
 *
 * P1-10 关键:body 为字符串时**必须**走 text 分支。
 *   反例:`malformed-json` 场景预设 body=`'{invalid json response}'`、contentType=`application/json`,
 *   旧实现走到分支 3 用 `NextResponse.json(string)` → 输出合法 JSON 字符串(被引号包裹)→
 *   客户端永远收不到 malformed JSON,该错误场景完全失效。
 *   走 text 分支后 body 原样返回,客户端真正收到非法 JSON。
 *
 * P2-39 修复:contentType 比较从精确 `!== 'application/json'` 改为解析 media type
 *   (`mediaType(contentType) === 'application/json'`)。`application/json; charset=utf-8`
 *   现在正确走 JSON 分支,对象 body 输出合法 JSON 而非 `[object Object]`。
 *   与 P1-10 兼容:分支 2(字符串 body → text)在分支 1 之后,优先级保持不变——
 *   `application/json; charset=utf-8` + 字符串 body 仍走 text,不破坏 malformed-json 场景。
 */
export function serializeMockResponse(
  body: unknown,
  contentType: string,
): SerializedMockResponse {
  // 1. 非 JSON media type → 原始文本(P2-39:用 mediaType 解析,去掉 charset 等参数)
  if (mediaType(contentType) !== 'application/json') {
    const text = body !== null && body !== undefined
      ? (typeof body === 'string' ? body : String(body))
      : '';
    return { kind: 'text', text };
  }

  // 2. P1-10: body 为字符串 → 原始文本(不经 JSON 序列化)
  if (typeof body === 'string') {
    return { kind: 'text', text: body };
  }

  // 3. 对象/数组/null/undefined → JSON 序列化(null/undefined 降级为 {})
  return { kind: 'json', value: body ?? {} };
}

