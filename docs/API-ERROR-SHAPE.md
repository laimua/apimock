# 服务端错误响应形状契约

> 适用范围:`/api/**` 下所有业务 API 路由(`src/app/api/**`)。
> 不适用:健康检查 `/api/health*`(自有 `{status, checks}` 协议)、mock 服务 `/{project}/{...path}`(返回客户端模拟数据,其 `error` 字段是被模拟接口的内容)。
>
> 本契约是 [docs/CODE-REVIEW-2026-07-25.md](./CODE-REVIEW-2026-07-25.md) P1-11 的前置:统一服务端形状后,前端可干净地读取 `json.error?.message`,无需为字符串/对象两种形态写兼容代码。

## 1. 标准形状

所有业务错误响应统一为:

```ts
{
  success: false,
  error: {
    code: string,        // 机器可读的错误码,SCREAMING_SNAKE_CASE
    message: string,     // 人类可读的错误描述(可直显)
    details?: unknown    // 可选,补充细节(如 Zod 校验 issues、冲突字段等)
  }
}
```

成功响应:

```ts
{ success: true, data: T }
```

来源定义:`src/lib/api.ts` 的 `ApiResponse<T>`、`success()`、`error()`、`Errors` 工厂。

## 2. HTTP 状态码

错误形状与状态码独立:状态码走 HTTP 语义(400/401/403/404/409/429/500/503),`error.code` 走业务语义。前端**不要**只靠 `code` 区分场景,应优先看 HTTP 状态码。

## 3. 错误码命名规范

- 风格:`SCREAMING_SNAKE_CASE`
- 表"业务/资源类别",不表 HTTP 状态码(例:用 `NOT_FOUND` 而非 `404_ERROR`,用 `RATE_LIMITED` 而非 `429_ERROR`)
- 已注册的 code(保持一致,新 code 不要撞名):

| code                       | 含义                                  | 典型状态码 |
| -------------------------- | ------------------------------------- | ---------- |
| `NOT_FOUND`                | 资源不存在                            | 404        |
| `BAD_REQUEST`              | 请求参数/语义错误(非校验型)         | 400        |
| `VALIDATION_ERROR`         | Zod 校验失败,`details` 为 issues 数组 | 400        |
| `UNAUTHORIZED`             | 未登录 / token 无效                   | 401        |
| `FORBIDDEN`                | 已登录但无权限                        | 403        |
| `DEMO_PROTECTED`           | demo 项目受保护,禁止改动             | 403        |
| `CONFLICT`                 | 唯一约束冲突(如 slug 重复)          | 409        |
| `PAYLOAD_TOO_LARGE`        | 上传文件超大小上限(如 OpenAPI 导入) | 413        |
| `INVALID_OPENAPI`          | OpenAPI 文档无法解析(含循环引用等)  | 400        |
| `RATE_LIMITED`             | 触发限流                              | 429        |
| `PROVIDER_ERROR`           | 上游 AI Provider 返回错误(透传状态码) | 上游状态码 |
| `INTERNAL_ERROR`           | 服务端内部错误                        | 500        |
| `MANAGE_TOKEN_NOT_CONFIGURED` | 管理面未配置 token,端点禁用       | 503        |
| `ADMIN_TOKEN_NOT_CONFIGURED` | 备份端点未配置 ADMIN_TOKEN,端点禁用 | 503        |

新增 code 时:先 grep 全库确认无重名,在本表登记,语义贴近已有项优先复用。

## 4. 后端使用指引(写路由时)

**推荐:始终走 `src/lib/api.ts` 的工厂函数,不要手写 `NextResponse.json({ error: ... })`。**

```ts
import { success, Errors, error, validate } from '@/lib/api';

// 好:工厂函数,形状自动正确
return Errors.notFound('Project');         // 404 NOT_FOUND
return Errors.badRequest('slug too long'); // 400 BAD_REQUEST
return Errors.forbidden();                 // 403 FORBIDDEN
return Errors.conflict('Slug in use');     // 409 CONFLICT
return Errors.internal(msg);               // 500 INTERNAL_ERROR
return Errors.validation(issues);          // 400 VALIDATION_ERROR
return error('RATE_LIMITED', '...', 429);  // 自定义 code+状态码
```

**禁止:返回字符串 error。**

```ts
// 错 — 前端拿不到 .message,会渲染成 "[object Object]" 或白屏
return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

// 对
return NextResponse.json(
  { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  { status: 429 },
);
```

**例外:需要带自定义 response header(如限流的 `X-RateLimit-*`)时,工厂函数不支持 header,这种情况下手写 `NextResponse.json`,但 `error` 必须是对象形状。**

## 5. 前端使用指引(kimi P1-11 据此实现)

服务端形状已统一为对象,前端**只需一种读取方式**,无需兼容字符串形态:

```ts
const json = await res.json();
if (!json.success) {
  // message 一定是 string(后端契约保证)
  const message = json.error?.message ?? 'Unknown error';
  const code = json.error?.code;           // 可选,用于精细化分支
  showToast(message);
  return;
}
// json.data 是成功数据
```

要点:
- **不要**写 `typeof json.error === 'string' ? json.error : json.error?.message` —— 这是历史包袱,后端已清理干净。
- `json.error?.message` 永远是 `string`(或 `undefined` —— 仅当响应非标准形状,理论上不会出现)。
- 需要按错误类型分支时,看 HTTP 状态码 + `json.error.code`,不要靠 `message` 文本匹配。

## 6. 形状一致性测试

关键路由的 429 / 受保护 / 401 / 403 分支均有"形状契约"测试,断言 `error` 是对象且含 `code`/`message`:

- `tests/api/ai-generate.test.ts` — AI generate 429 形状
- `tests/api/ai-providers.test.ts` — AI test 429 形状
- `tests/api/projects-demo-protection.test.ts` — demo 保护 403 形状

新增带错误响应的路由时,请同步加形状断言,防回退。
