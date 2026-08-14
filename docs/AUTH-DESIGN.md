# G1 鉴权方案设计文档

> 状态：**四方共识**（codex + kimi + 主控 agent + CC 独立审查）
> 日期：2026-07-24
> 目的：解决原报告 P0 级缺陷 G1（全站无鉴权），给出可落地的鉴权设计
>
> **v2 修订**（CC 审查后）：裁决3 改判为拆分 MANAGE_TOKEN；补 login timing-safe（漏洞A）；
> session 7 天缩至 1 天（漏洞B）；补 token 熵/开放重定向/secure flag 要求。

---

## 一、背景

ApiMock 当前**全站无鉴权**：无 proxy.ts/middleware.ts，所有 API 对匿名开放，包括：
- DELETE 项目（含数据面破坏）
- AI provider 增删改（含加密 apiKey 替换、SSRF 攻击面）
- PII 读取（requests 表的 ip / userAgent）

前面修复的 token 时间安全、SSRF、share 过滤等都是"墙上的补丁"，没有鉴权这堵墙，价值打折。本方案堵上这个最大的安全洞。

## 二、三方共识（8 项一致）

| 项 | 决策 | 理由 |
|----|------|------|
| 用户模型 | 单 token 单用户（无 users 表） | ApiMock 是开发者内部工具，非多租户 SaaS。多用户是 YAGNI |
| 凭证载体 | Cookie | 前端零改动（api-client 无需自定义 header），浏览器自动携带 |
| 登录页 | 加 `/login`（密码框表单） | 比 Basic Auth / 手动调 API 体验好，成本极低 |
| 保护粒度 | 全部管理 API + 管理页面（含 GET） | GET 含 PII（ip/userAgent）和 provider 配置，只保护写会漏敏感读 |
| 未配置 token | fail-closed 503 | 对齐 metrics/backup 现有约定；未配置=未启用=更安全 |
| matcher | 正向白名单（非排除式） | mock 在根级动态路由 `/[project]/[...path]`，排除式会误拦核心功能 |
| 公开路由 | mock / share / health / metrics / backup 保持公开 | 核心功能不能拦 |
| 登录保护 | rateLimit（10/min/IP） | 防暴力撞 token |

## 三、分歧裁决（3 项，主控 agent 裁决）

### 分歧1：文件名 middleware.ts vs proxy.ts
- codex：middleware.ts
- kimi：proxy.ts
- **裁决：proxy.ts**
- **依据**：Next.js 16.0.0 官方文档明确"Middleware is deprecated and renamed to Proxy. Proxy defaults to the Node.js runtime"。本仓库 next@16.1.6，应使用新约定（middleware.ts 仍可工作但已 deprecated，跟随新约定避免未来再迁移）。

### 分歧2：cookie 值存什么
- codex：cookie 直接存 ADMIN_TOKEN 原文
- kimi：cookie 存 HMAC 签名 `<exp>.<HMAC>`
- **裁决：HMAC 签名（kimi 方案）**
- **依据**：cookie 不应含 secret 本身。虽然 httpOnly 防 XSS 读取，但 cookie 泄露途径多（日志、代理、备份）。HMAC 签名方案 cookie 里没有 secret，安全性明显更好，复杂度可控。

### 分歧3：token 复用 vs 新增（详见下文）
- codex：新增 MANAGE_TOKEN
- kimi：复用 ADMIN_TOKEN
- 主控初审：复用 ADMIN_TOKEN（降低门槛）
- **CC 审查反对，主控改判：v1 直接拆分 MANAGE_TOKEN**（管理/cookie）+ ADMIN_TOKEN（仅 backup/header）
- **改判依据**：CC 反驳成立——① demo 部署复用会让任何人带 `X-Admin-Token:demo` 触发 backup dump；② 人的 token 该多轮换、cron 的该少轮换，耦合后按人节奏轮换每次打断 cron；③ "无损可逆"是假命题（fallback `??` 是加有效凭证非平滑迁移）；④ 审计无法区分 cron 还是人。详见第四节。

## 四、分歧3 详解：token 复用 vs 新增

### 4.1 现状

当前仓库有 **3 个独立的 token**，各管一摊：

| token | 位置 | 用途 | 调用方 |
|-------|------|------|--------|
| `ADMIN_TOKEN` | backup route | 备份触发（POST /api/admin/backup） | Railway cron / GitHub Actions（机器） |
| `METRICS_TOKEN` | metrics route | Prometheus 抓取（GET /api/metrics） | Prometheus server（机器） |
| （新增）管理 token | proxy + /login | 管理面鉴权 | 人类用户（浏览器） |

### 4.2 两种选择

**选项 A：复用 ADMIN_TOKEN（v1 推荐）**
- 管理面和备份共用一个 token
- 优点：用户只需配 1 个环境变量，落地简单
- 缺点：职责耦合——轮换管理 token 会同时让备份 cron 失效（反之亦然）；改密码 = 改备份凭证，心智负担

**选项 B：新增 MANAGE_TOKEN（codex 推荐）**
- 管理面用独立的 MANAGE_TOKEN，备份仍用 ADMIN_TOKEN
- 优点：职责分离——人工操作（管理）和基础设施（备份 cron）的凭证独立轮换，互不影响
- 缺点：用户需配 2 个环境变量（ADMIN_TOKEN + MANAGE_TOKEN），首次落地门槛略高

### 4.3 裁决：v1 复用 ADMIN_TOKEN

**理由：**
1. **降低首次落地门槛**：G1 是从"完全无鉴权"起步，v1 的首要目标是堵上洞，不是追求 token 治理的完美。复用让用户只配 1 个变量就能启用。
2. **职责分离是渐进优化**：复用不阻碍未来拆分。当用户真有轮换需求时，加 MANAGE_TOKEN 是纯增量改动（proxy 多读一个 env fallback）。
3. **当前调用方清晰可分**：备份是 cron（机器），管理是人（浏览器），即使共用 token，泄露面也不同（cron 的 token 在 CI 配置里，人的 token 在浏览器 cookie 里）。

**文档标注（必做）**：`.env.example` 和 README 注明——"ADMIN_TOKEN 同时用于备份和管理面鉴权；如需独立轮换，未来可设置 MANAGE_TOKEN 拆分"。

### 4.4 拆分的渐进路径（未来可选）

```
v1（本次）: ADMIN_TOKEN 同时管备份 + 管理
    ↓ (用户有轮换需求时)
v1.5: proxy 改为 process.env.MANAGE_TOKEN ?? process.env.ADMIN_TOKEN
       （有 MANAGE_TOKEN 用它，否则 fallback 到 ADMIN_TOKEN，向后兼容）
    ↓ (完全拆分)
v2:   MANAGE_TOKEN 必填，ADMIN_TOKEN 只管备份
```

这条路径**纯增量、向后兼容**，不会让 v1 的部署被迫改动。

## 五、技术实现要点

### 5.1 src/proxy.ts（Next.js 16 约定）

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'apimock_auth';
const SESSION_MAX_AGE_SEC = 24 * 3600; // 1 天（CC 审查漏洞B:stateless cookie 不可吊销,缩窗口）

// 校验 HMAC 签名 cookie（不存 token 原文）
function validSession(req: NextRequest): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return false;
  const raw = req.cookies.get(COOKIE)?.value;
  if (!raw) return false;
  const [exp, sig] = raw.split('.');
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  const expect = createHmac('sha256', token).update(`apimock-auth:${exp}`).digest();
  // timingSafeEqual 前 length 判断；Buffer.from(x,'hex') 比 32 字节（CC 审查风格清理）
  const sigBuf = Buffer.from(sig, 'hex');
  if (sigBuf.length !== expect.length) return false;
  return timingSafeEqual(sigBuf, expect);
}

export function proxy(req: NextRequest) {
  // fail-closed:未配置 token 时管理面禁用（对齐 metrics/backup 语义）
  if (!process.env.ADMIN_TOKEN) {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: 'ADMIN_TOKEN not configured' }, { status: 503 });
    }
    return NextResponse.redirect(new URL('/login?error=no_token', req.url));
  }

  if (validSession(req)) return NextResponse.next();

  // API → 401 JSON;页面 → 跳登录
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
  }
  const login = req.nextUrl.clone();
  login.pathname = '/login';
  login.searchParams.set('from', req.nextUrl.pathname);
  return NextResponse.redirect(login);
}

// 正向白名单:只匹配管理路径。mock /[project]/[...path]、share、health 等不在 matcher
export const config = {
  matcher: [
    '/projects/:path*',
    '/settings/:path*',
    '/api/projects/:path*',
    '/api/ai/:path*',
  ],
};
```

**关键：默认 Node runtime**（Next.js 16 proxy 约定），可直接用 `node:crypto`，无需 Edge 兼容 hack。

### 5.2 新增文件清单

| 文件 | 作用 |
|------|------|
| `src/proxy.ts` | 鉴权拦截（Next.js 16 proxy 约定） |
| `src/lib/auth.ts` | cookie 签发/校验工具（HMAC），供 proxy + login route 共用 |
| `src/app/api/auth/login/route.ts` | POST 校验 token + 种 cookie（含 rateLimit） |
| `src/app/api/auth/logout/route.ts` | POST 清 cookie |
| `src/app/login/page.tsx` | 登录页 server 壳 |
| `src/app/login/login-form.tsx` | 登录表单 client 组件 |

### 5.3 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/lib/slug.ts` | RESERVED_SLUGS 加 `login`、`auth`（防 slug 撞静态路由） |
| `src/lib/api-client.ts` | request() 遇 401 → 跳 /login（替代抛错） |
| `src/components/layout/GlobalHeader.tsx` | 加"退出"按钮 |
| `.env.example` | ADMIN_TOKEN 段落补说明（兼管鉴权）+ 标注未来可拆 MANAGE_TOKEN |

### 5.4 cookie 设计（HMAC 签名）

```
apimock_auth = <exp>.<HMAC_SHA256(MANAGE_TOKEN, "apimock-auth:" + exp)>

exp = 过期时间戳（ms），1 天
```

- 登录时签发：用 MANAGE_TOKEN 作 HMAC key，对 `"apimock-auth:"+exp` 签名
- 校验：解析 exp（过期则拒）+ 重算 HMAC + timingSafeEqual 比对
- 改 MANAGE_TOKEN → 所有 cookie 立即失效（签名对不上）= 单用户工具的"全员登出"语义

**不存 token 原文**：cookie 泄露（日志/代理/备份）不暴露 secret 本身。

**stateless 代价（CC 审查漏洞B）**：cookie 到 exp（1 天）前一直有效，`/logout` 只清浏览器本地 cookie，偷到的 cookie 在别处仍有效到过期。缩到 1 天是已知 tradeoff；要即时吊销需服务端吊销列表（v2）。

## 六、风险与对策

| 风险 | 对策 |
|------|------|
| 鉴权误拦 mock 服务 | 正向白名单 matcher；回归测试 curl /demo-project/users 必须 200 |
| demo 站管理面被锁（破坏性） | 破坏性变更，需 changelog 强提示；demo 站可设 MANAGE_TOKEN=demo 演示（拆分后 demo 的 backup 仍可单独禁用） |
| cookie 泄露 | HMAC 签名（不含 secret）+ httpOnly + sameSite=lax + secure(prod) |
| 暴力撞 token | 登录路由 rateLimit(10/min/IP) + token 最小熵 ≥20 字符随机（见下方"token 熵要求"） |
| 现有 metrics/backup header-token | 不统一（它们是机器调用，cookie 不适用）；保持现状，不在 matcher 内互不干扰 |
| **login token 比对计时侧信道（漏洞A，CC 审查）** | **`/api/auth/login` 校验必须用 `safeEqual(input, expected)`（crypto-utils），禁止 `===`。这是 CRITICAL** |
| **logout 不可吊销（漏洞B）** | session 缩至 1 天；文档标注 stateless 限制；v2 加服务端吊销列表 |
| **`from` 开放重定向（漏洞D，CC 审查）** | login 页跳转前校验 `from` 是同站 path（`/` 开头且非 `//host`），否则忽略 |
| CSRF（漏洞E） | cookie 锁 `sameSite=lax`（lax 拦跨站 POST 的 cookie）；v2 加 CSRF token 强化 |

### token 熵要求（CC 审查漏洞C）

`MANAGE_TOKEN` / `ADMIN_TOKEN` / `METRICS_TOKEN` 必须是高熵随机串，**最小 20 字符**（建议 32+）。文档与 `.env.example` 标注。

demo 演示用 `MANAGE_TOKEN=demo` 仅限本地/演示，**生产禁用**——弱 token + 限流 10/min/IP 仍可被分布式撞破。`.env.example` 加警告注释。

## 七、回归测试（必做）

```
curl /demo-project/users                 → 200（mock 不受影响）
curl -X DELETE /api/projects/<demoId>     → 401（无 cookie）+ demo-project 规则保留
curl /api/projects                        → 401（无 cookie）
curl /api/share/<slug>                    → 200（share 公开）
curl /api/health                          → 200（health 公开）
curl /api/metrics                         → 401（现状不变，header token）
登录后 curl /api/projects（带 cookie）    → 200
```

## 八、渐进升级路径

- **v1（本次）**：单 token + HMAC cookie + proxy + /login 页
- **v1.5**：token 拆分（MANAGE_TOKEN fallback ADMIN_TOKEN）
- **v2**：登录限流强化 + CSRF token + token 轮换 UI
- **v3（仅当确有多人）**：users 表 + 密码哈希 + session；proxy 改查 DB
- **v4**：SSO（GitHub OAuth）

## 九、补充：机器客户端 Bearer 直通（2026-08)

proxy 在 cookie 校验之前增加 `Authorization: Bearer <MANAGE_TOKEN>` 通道(`safeEqual` timing-safe 比对),供 agent / 脚本 / CI 直接调管理 API,无需登录拿 cookie(配套 `skills/apimock/`)。

- **与 cookie 并行**:Bearer 错不破坏合法 cookie 会话(继续走 cookie 校验);fail-closed 语义不变(未配 MANAGE_TOKEN 一律 503)
- **失败限流(2026-08-14 A2 修订)**:Bearer 失败按双桶计数——per-IP `bearer:<ip>`(30/min)
  + 全局 `bearer:__global`(300/min),任一超限返统一 429 `RATE_LIMITED`。正确 Bearer 与
  cookie 路径零额外开销(先验 token、失败才计数);全局桶兜底多 IP 轮换分布式撞库。
  限流走 KV 抽象层,fail-open 语义与其他限流点一致。
- **登录全局桶(2026-08-14 A3 修订)**:login 在 10/min/IP 之外补全局桶
  `login:__global`(100/min),与 per-IP 独立额度,多 IP 撞库时总量仍有上限。
- **MANAGE_TOKEN 强度校验(2026-08-14 A3 修订)**:短于 32 字符时启动(proxy 首次执行)
  warn 一次、不致命(对齐 ENCRYPTION_KEY P2-29 范式);文档建议 ≥32 字符 CSPRNG
  随机串(`openssl rand -hex 32`)。
- **风险对齐**:Bearer token 出现在 header 里,可能被反向代理访问日志记录——与现有 `X-Admin-Token`(backup)/ `Authorization: Bearer <METRICS_TOKEN>`(metrics)先例一致,部署侧按既有 token 保护实践处理

---

*本方案经 codex（后端架构）+ kimi（前端/产品）+ 主控 agent（裁决）+ CC（独立审查）四方共识。*
*CC 审查后修订：裁决3 改判拆分 MANAGE_TOKEN；补 login timing-safe（漏洞A）；session 缩至 1 天（漏洞B）；补 token 熵/开放重定向/secure 要求。*
