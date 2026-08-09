---
name: apimock
description: 在 ApiMock 服务中创建 mock 接口、场景和数据。当用户完成某个功能的开发(vibecoding)并产出接口文档(OpenAPI/markdown 表格/自然语言描述),想要"生成 mock 接口"、"根据接口文档创建 mock"、"设计 mock 场景和数据"、"搭建联调用 mock 服务"时使用。也适用于 create mock API from API doc / OpenAPI import / mock scenarios。
---

# ApiMock:接口文档 → Mock 场景与数据

把接口文档变成 ApiMock 里可访问的 mock 接口。全程通过 ApiMock 的 REST API 完成,**不需要打开 Web UI**。

## 前置条件

- `APIMOCK_BASE_URL`:ApiMock 服务地址,默认 `http://localhost:3000`
- `APIMOCK_TOKEN`:管理 token(= 服务器的 `MANAGE_TOKEN`)

两个变量都没有就问用户要。所有命令按 **bash** 编写(Windows 上用 Git Bash,不要用 cmd)。

```bash
export APIMOCK_BASE_URL="http://localhost:3000"   # 按实际部署改
export APIMOCK_TOKEN="<MANAGE_TOKEN>"
AUTH="Authorization: Bearer $APIMOCK_TOKEN"

# 自检:401 说明 token 错或未配置;503 说明服务器没配 MANAGE_TOKEN
curl -s -o /dev/null -w "%{http_code}\n" -H "$AUTH" "$APIMOCK_BASE_URL/api/projects"
```

## 工作流(六步)

### 第 1 步:接口文档 → OpenAPI 3.0 YAML

如果用户给的已经是 OpenAPI 文件,直接用。否则(markdown 表格/自然语言/代码里的路由定义)先转换成 OpenAPI 3.0 YAML,写到临时文件,如 `/tmp/api-doc.yaml`。

转换规则:
- 每个接口写一个 `path` + `method`,给 `summary`
- **每个接口至少声明一个 200 响应,并在 media type 里写 `example` 真实数据** —— 这是关键:
  导入器优先取 `example`(或 `examples` map 第一个条目的 `value`)作为响应体,
  **导入后 mock 立即返回真实数据**;只有没写 example 时 body 才退回为 schema 对象(不适合联调)
- 注意 example 的位置:写在 `content.application/json` 下(与 `schema` 平级),
  **不是** `schema` 对象内部(导入器不读 `schema.example`)
- example 数据由你(vibecoding 出接口文档的 agent)直接生成:贴合业务语义、字段覆盖完整、
  列表接口给 3-10 条记录;也可用第 5 步的 AI 生成后再补写
- 路径参数用 `{id}` 风格(ApiMock 内部会转成 `:id` 匹配)
- 参考格式:`examples/openapi-minimal.yaml`(本 skill 目录下)

### 第 2 步:创建(或复用)项目

```bash
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name": "订单服务", "slug": "order-service"}' \
  "$APIMOCK_BASE_URL/api/projects"
```

- 成功 201,从响应 `data` 里记下 **`id`** 和 **`slug`**(后续所有操作要用)
- slug 只能用英文小写/数字/连字符;中文 name 不会自动生成 slug,必须显式给
- 409 = slug 已被占用 → 换个 slug 或复用已有项目(`GET /api/projects` 列表查 id)

### 第 3 步:导入 OpenAPI

```bash
curl -s -X POST -H "$AUTH" \
  -F "file=@/tmp/api-doc.yaml" \
  "$APIMOCK_BASE_URL/api/projects/$PROJECT_ID/import"
```

响应解读:
- **201**:全部导入成功。`data: {total, created, skipped, errors, parseErrors}`;`skipped` 是 (method, path) 已存在被跳过(幂等,重复导入安全)
- **207**:部分失败,看 `errors` 数组逐条排查
- **400 `INVALID_OPENAPI`**:文档解析零产出(格式错/循环引用),检查 YAML
- **413**:文件 >5MB,拆分导入

导入后每个接口有了响应:**写了 `example` 的接口,mock 已可直接联调**;没写 example 的 body 是 schema 对象,需在第 4/5 步补真实数据。第一个 200 自动设为默认响应。需要更多场景(变体/错误/超时),继续往下。

### 第 4 步:设计 mock 场景

场景 = endpoint 下的 response 规则。匹配逻辑:**query/header 精确等值匹配**,多个匹配时 `priority` 大者优先;无匹配时返回 `isDefault` 的响应。

先查端点 id:

```bash
curl -s -H "$AUTH" "$APIMOCK_BASE_URL/api/projects/$PROJECT_ID/endpoints"
# 响应 data 数组,按 method+path 找到目标端点的 id
```

**正常变体场景**(如 `?status=vip` 返回不同数据):

```bash
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "name": "VIP 用户",
    "statusCode": 200,
    "contentType": "application/json",
    "matchRules": {"query": {"status": "vip"}},
    "priority": 10,
    "body": {"code": 0, "data": {"list": [{"id": 1, "name": "VIP 张三", "level": "gold"}]}}
  }' \
  "$APIMOCK_BASE_URL/api/projects/$PROJECT_ID/endpoints/$ENDPOINT_ID/responses"
```

**错误场景**(500/401/404/429,换 statusCode 和 body 即可):

```bash
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "name": "服务器错误",
    "statusCode": 500,
    "contentType": "application/json",
    "matchRules": {"header": {"x-debug-scenario": "error"}},
    "priority": 10,
    "body": {"code": 500, "message": "Internal Server Error"}
  }' \
  "$APIMOCK_BASE_URL/api/projects/$PROJECT_ID/endpoints/$ENDPOINT_ID/responses"
```

**超时场景**:只能在**端点级**设置延迟(不能按场景):

```bash
curl -s -X PUT -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"delayMs": 3000}' \
  "$APIMOCK_BASE_URL/api/projects/$PROJECT_ID/endpoints/$ENDPOINT_ID"
```

注意:
- `matchRules` 只有精确等值,**不支持正则/范围**;query 和 header 可同时给(都要满足)
- 设 `isDefault: true` 会清掉该端点其它响应的默认标记
- body 上限 1MB

### 第 5 步(可选):AI 生成更真实的数据

第 1 步手写 example 已能保证基本可用;这步用于批量生成更丰富/更随机的数据,或给没写 example 的接口补数据。第 4 步的场景 body 是手写的真实数据,不受此限。

```bash
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"prompt": "生成 10 条电商订单数据,包含订单号、商品名、金额、状态", "count": 10}' \
  "$APIMOCK_BASE_URL/api/ai/generate"
```

返回 `data` 即生成的 JSON(固定形状 `{code, message, data: {list, total}}`)。注意要把**生成结果**(API 响应里的 `data` 字段)包装成更新 payload 再写回端点:

```bash
# 构造 /tmp/body.json,内容为:
# {"responseBody": <上一步 generate 响应中的 data 字段>}
curl -s -X PUT -H "$AUTH" -H "Content-Type: application/json" \
  -d @/tmp/body.json \
  "$APIMOCK_BASE_URL/api/projects/$PROJECT_ID/endpoints/$ENDPOINT_ID"
```

没有配置 AI provider 时会自动降级为本地模板生成,依然可用。限流 10 次/分钟/IP。

### 第 6 步:验证并交付

```bash
# 默认响应
curl -s "$APIMOCK_BASE_URL/$SLUG/users"

# 场景命中(query 精确匹配)
curl -s "$APIMOCK_BASE_URL/$SLUG/users?status=vip"

# header 场景
curl -s -H "x-debug-scenario: error" -o /dev/null -w "%{http_code}\n" "$APIMOCK_BASE_URL/$SLUG/users"
```

确认各场景命中正确后,把结果汇报给用户:
- **Mock URL**:`$APIMOCK_BASE_URL/$SLUG/<path>`(免登录,直接可调)
- 各场景触发方式(query 参数 / header)
- 管理入口:`$APIMOCK_BASE_URL/projects/$PROJECT_ID`(浏览器,需 MANAGE_TOKEN 登录)

## 错误速查

| 状态码 | 含义 | 处理 |
|--------|------|------|
| 401 | token 错/未带 | 检查 `APIMOCK_TOKEN` |
| 503 | 服务器未配 MANAGE_TOKEN | 让运维配置后重启 |
| 409 | (method, path) 或 slug 已存在 | 换 slug / 复用已有资源 |
| 207 | 导入部分失败 | 看响应 `errors` 逐条修 |
| 400 | 参数校验失败/文档无法解析 | 看响应 `error` 字段 |
| 413 | 文件 >5MB 或 body >1MB | 拆分 |
| 429 | 限流(AI 10/min) | 等 1 分钟 |

## 深入参考

- 字段级 schema(endpoints/responses/matchRules 选择语义/AI generate 形状):`reference/api-fields.md`
- 最小 OpenAPI 示例:`examples/openapi-minimal.yaml`

## 安装本 skill

- Kimi Code:复制本目录到项目的 `.agents/skills/apimock/`(项目级)或 `~/.agents/skills/apimock/`(用户级)
- Claude Code:复制到 `.claude/skills/apimock/`
- Codex:暂不支持 skill,把本文件内容贴进 AGENTS.md 或会话上下文亦可按同样流程操作
