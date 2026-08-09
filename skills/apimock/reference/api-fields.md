# ApiMock REST API 字段参考

供 `skills/apimock/SKILL.md` 引用。所有管理 API 需要 `Authorization: Bearer <MANAGE_TOKEN>`。
统一响应形状:成功 `{success: true, data: ...}`,失败 `{success: false, error: ...}`。

## POST /api/projects

```json
{
  "name": "string, 1-255, 必填",
  "slug": "string, 可选;缺省从 name 生成,中文名生成空 slug 会 400,需显式给英文 slug",
  "description": "string, 可选",
  "basePath": "string, 可选"
}
```

- 201 → `data` 为完整 project 对象(含 `id`、`slug`)
- 409 → slug 撞唯一索引;400 → slug 保留字/格式非法(校验失败统一 400)

## POST /api/projects/{id}/import

- Content-Type: `multipart/form-data`,字段名 `file`(JSON 或 YAML,按首字符 `{`/`[` 嗅探)
- 上限 5MB(413)
- 201 `data`: `{total, created, skipped, errors: [], parseErrors: []}`
- 207 = 部分批次失败;400 `INVALID_OPENAPI` = 解析零产出(含 YAML 循环引用)
- 每个 path×method → 一条 endpoint(`responseBody=null`);每个声明的 status code → 一条 response
  (**body 优先取 media type 的 `example`,其次 `examples` map 第一个条目的 `value`,
  都没有时退回 `content.application/json.schema` 对象本身**);第一个 200 设 `isDefault`
- (method, path) 已存在 → skip(幂等,可重复导入)

## POST /api/projects/{id}/endpoints

```json
{
  "path": "必填,/^\\/([^/]+\\/)*[^/]+$/,≤500;必须 / 开头、无尾斜杠、无空段;路径参数写 :id 风格",
  "method": "GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS,默认 GET",
  "name": "可选", "description": "可选",
  "delayMs": "0-60000,可选,端点级延迟(超时场景)",
  "tags": ["string"], "isShareable": true,
  "statusCode": "100-599,默认 200",
  "contentType": "默认 application/json",
  "responseBody": "任意 JSON,≤1MB,可选"
}
```

- 409 → (method, path) 在该项目已存在

## PUT /api/projects/{id}/endpoints/{endpointId}

全部字段可选(部分更新),字段同上 + `isActive`。409 → 改成已存在的 (method, path)。

## POST /api/projects/{id}/endpoints/{endpointId}/responses(场景)

```json
{
  "name": "必填",
  "description": "可选",
  "statusCode": "100-599,必填",
  "contentType": "默认 application/json",
  "headers": {"X-Key": "value"},
  "body": "任意 JSON,≤1MB",
  "matchRules": {
    "query": {"status": "vip"},
    "header": {"x-debug-scenario": "error"}
  },
  "isDefault": false,
  "priority": "0-1000,默认 0"
}
```

### 响应选择语义(selectResponse)

1. **matched**:matchRules 精确等值匹配(仅等值,无正则/范围;query 和 header 同时给则都要满足),
   多个命中时 priority 大者优先
2. endpoint 级 `responseBody`(无规则命中时的默认内容)
3. responses fallback:`isDefault` 优先于第一条无规则响应
4. 空 200 `{}`

设 `isDefault: true` 时事务内清掉该端点其它响应的默认标记。

### 常见场景配方

| 场景 | 做法 |
|------|------|
| 正常变体 | 200 + matchRules(query/header)+ priority 10 |
| 服务器错误 | statusCode 500 + body `{"code":500,"message":"..."}` |
| 未授权 | 401;不存在 | 404;限流 | 429(均需手动建,无预设) |
| 超时 | 端点级 `delayMs`(PUT endpoint),**不能按 response 场景** |
| 空响应 | body `{}` 或 null |

## POST /api/ai/generate

```json
{
  "prompt": "string, 1-2000, 必填",
  "count": "1-100, 默认 10",
  "providerId": "可选,缺省用默认 provider"
}
```

- 响应 `data` = 生成的 JSON(固定形状 `{code, message, data: {list, total}}`)
- **不落库**:拿到后需自行 PUT 到 endpoint 的 `responseBody` 或 response 的 `body`
- 降级链:指定 provider → 默认 provider → `OPENAI_API_KEY` 环境变量 → 本地模板(无 AI 也可用)
- 限流 10 req/min/IP(429);日预算超支自动降级模板

## 公开路径(免鉴权)

- mock 服务:`GET $BASE/{slug}/{path}`(核心功能)
- 分享页数据:`GET /api/share/{slug}`(项目 + isShareable 端点)
- `GET /api/health`、`GET /api/health/ready`
