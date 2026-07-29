# 架构审查共识报告 — 2026-07-29

> **多模型协作产物**：kimi（架构分析）→ codex（独立验收挑刺）→ kimi（回应质疑）→ ZCode（总控仲裁）→ **cc（第三轮独立评审，纠正 1 处重大误判 + 补 5 条盲区）**。
> 四方就所有实质问题达成共识。本文件是合并后的最终结论。

## 一、审查方式

| 阶段 | 角色 | 产出 |
|------|------|------|
| 1 | kimi | 143 行架构报告（每条带 file:line 证据，Top 5 重构） |
| 2 | codex | 129 行独立验收（逐条裁决 + 挑刺 + 重排 Top 5） |
| 3 | ZCode | 用真实源码仲裁 codex 的"证据不足"质疑，剔除伪分歧 |
| 4 | kimi | 回应 3 个真质疑，撤回 1 个硬伤方案，接受重排 |
| 5 | **cc** | **112 行第三轮独立评审，逐条源码复核 + 纠正 P0-1 误判 + 5 条新发现** |
| 6 | **kimi** | **41 行正式回应 cc 的 7 条意见，全盘接受、零反驳，补 2 条深化（灰色地带 + 错误码稳定性）** |
| 7 | ZCode | 将 kimi 深化写入报告，确认四方闭环 |

**关键发现**：
- codex 标记的"证据不足"经 ZCode 源码核验，绝大多数是 kimi **判断正确**（因证据包未含那些文件，codex 没看到）。
- **cc 第三轮纠正了三方共同的一处重大误判**（P0-1 413/429）——三方都只读了契约的错误码表，漏读了顶部 scope 条款。**第三方无"共识包袱"，反而读得更细**，这正是多轮交叉的额外价值。

## 二、确认的真问题（已坐实，可立即修）

### ⚠️ 已被 cc 第三轮推翻的误判（原 P0-1）

**~~413/429 错误形状不对齐契约~~** —— **此条作废，详见第八节"误判纠正"。**
原报告（kimi/codex/ZCode 三方共识）认为 mock 路由的 413/429 应走契约工厂，但 cc 读出 `docs/API-ERROR-SHAPE.md:3-4` 顶部 scope 条款**显式排除** mock 服务 `/{project}/{...path}`（其 error 字段是被模拟接口的内容）。三方只读了错误码表、漏读 scope，把一个 out-of-scope 的一致性观察误升为 P0 契约违背。ZCode 已复核契约原文确认 cc 正确。**Top 5 #1 相应撤下或降为可选一致性建议。**

### 真问题 1：ai/generate（及 test）错误码 + 文案泄露

**ai/generate**（`src/app/api/ai/generate/route.ts:296, 301`）+ **test**（`src/app/api/ai/providers/[id]/test/route.ts:142, 150`）：
- ai/generate 上游 OpenAI 错误用 `INTERNAL_ERROR`（语义固定 500，却配合 4xx 透传，自相矛盾）。
- **两个路由都泄露 `${msg}`**：`body = \`...${msg}\`` / `Errors.internal(...${msg})` 把上游错误细节（如 OpenAI "Incorrect API key provided: sk-xxx"）透传给客户端。
- ⚠️ **cc 纠正**：原报告把 test/route.ts 当"正确范例"是错的——它只换对了 code（`PROVIDER_ERROR`），**msg 照样泄露**。实现者若照抄会留泄露。
- 改：两个路由一并整改，共用"固定对外文案 + 原始 msg 只进日志"的 helper。

### P1-级：行为不一致 + 误导

3. **TOCTOU 唯一约束正则不一致 + 列名硬编码**
   - `endpoints/[endpointId]/route.ts:203` 用宽正则 `/unique|constraint/i`（误吞 CHECK/FK 约束失败）；`projects/route.ts:122`、`projects/[id]/route.ts:115` 用精确版但硬编码 `projects\.slug`（未来加新唯一约束会静默漏判转 500）。
   - 改：统一精确版 + 改为"错误码/约束名映射"，去掉列名硬编码。

4. **schema.ts 误导注释**（`src/lib/schema.ts:1-4`）
   - 注释写"根据 DB_TYPE 选择方言"，实际无条件 `export * from "./schema-sqlite"`。
   - 改：删误导注释，写明真实机制（应用层统一用 sqlite 类型，仅 db-mysql 引 mysql schema）。

5. **死依赖 hono + @hono/zod-validator**（`package.json:32,44`）
   - src 零引用（三方确认）。删前跑 build 验证即可。

## 三、战略决策项（非 fix，需先决策）

### MySQL 双栈的身份问题

项目"声称双栈、实际 mysql 半边裸奔"，需先决策"是否正式支持 MySQL"：

- **若不支持**：`docs/DEPLOY.md` 明确降级为实验性，删 mysql 相关死代码。
- **若支持**，验收标准含：
  - 版本化迁移（`drizzle/` 现只有 sqlite 一套 0000-0004，mysql 靠 `@deprecated` 的 `scripts/migrate.ts` 手写 CREATE TABLE 兜底，无版本追踪）。
  - 缓存统一走 KV 接口（`project-cache.ts`、`endpoint-cache.ts` 现各自用进程内 Map，多副本失效不传播——注释已自述靠 TTL 兜底）。
  - 双栈 CI（现整个 MySQL 栈零测试，CI 只跑 sqlite）。
  - `as unknown as Db` ×2（`db.ts:18,21`）+ `TxLike = any`（`db-transaction.ts:33`）的类型裸奔，靠双栈 CI 兜住。
  - `isMysql`/`useMysql` 模块加载期求值（`db.ts:16`、`db-transaction.ts:18`），改为惰性求值——否则测试动态切 DB_TYPE 会静默用错库。

> **共识**：这条不应当 fix 排第一（会卡死），应作为"决策 + spike"。

## 四、共识版 Top 5 重构（按确定性 × 改动成本排，cc 第三轮后修订）

1. **ai/generate + test 错误文案整改**（已坐实，真泄露）：两路由共用"固定对外文案 + 原始 msg 只进日志"helper；ai/generate 改 `PROVIDER_ERROR`。**勿照抄 test 路由——它也泄露 msg（cc 纠正）。**
2. **TOCTOU 统一整改**：cc 建议用错误码映射（mysql `.code===1062`/`ER_DUP_ENTRY` + sqlite 消息解析）替代正则，比"精确正则"更稳，且去掉 `projects\.slug` 列名硬编码。
3. **卫生包**（零风险即时收益）：
   - 删 hono + @hono/zod-validator 死依赖（删前 grep scripts/configs + 跑 build）。
   - **修 schema.ts 注释 + 修 `kv-store.ts:4` 注释**（cc 补：两者同类"谎称"——schema.ts 谎称按 DB_TYPE 切方言、kv-store.ts 谎称 project/endpoint-cache 调 kv 接口，实际都不然）。
   - `runInTransaction` 加 thenable 运行时守卫（仅 sqlite 分支，防 async 回调静默部分提交）。
   - **`useMysql`/`isMysql` 改惰性求值**（cc 建议：从 MySQL 战略项拆出，独立可前置修，消除"测试动态切 DB_TYPE 静默用错库"风险）。
4. **清理死代码**（cc 补）：`getDb()`（`db.ts:20`、`db-sqlite.ts:36`、`db-mysql.ts:21`）全 src 无调用点，是死代码——顺带消掉它身上的 `as unknown as Db` 强转。`drizzle/schema.ts`、`drizzle/relations.ts`（introspect 历史产物）零引用，可删。
5. **MySQL 身份问题**（战略决策项，非 fix）：先决策"是否正式支持双栈"；可立即做的 spike——加 mysql CI job（哪怕只跑 schema 同步冒烟），用测试兜住 `as unknown as Db` 爆炸半径。

> ~~原 #1「413/429 对齐契约」已撤下~~（cc 第三轮证伪，详见第八节）。

## 五、已被澄清的"伪问题"（避免误改）

- **三个 mock-* 文件不重叠**：`mock-templates.ts`（UI 预设库）/ `mock-data-templates.ts`（AI 伪数据生成）/ `mock-response-selector.ts`（运行时选择）职责不同、引用方不同。**不合并**，仅建议重命名去歧义（`response-presets.ts` / `mock-data-generator.ts`）。
- **api.ts vs api-client.ts 不重叠**：server 响应工厂 vs client DTO+fetch。**不能合并**（会把 next/server 拖进客户端 bundle）。
- **核心 mock 路由 530 行不算上帝文件**：分层清晰（handleMock → findEndpoint → buildEndpointResponse → selectResponse 纯函数），选择逻辑已抽离。
- **db.ts 类型强转是"知情取舍"非"溃败"**（已降级 P2）：作者 5 行注释解释清楚，爆炸半径限于 db.ts，无运行时故障证据。真正消解靠双栈 CI，不是删强转。

## 六、本次协作的过程教训

- **codex 的"证据不足"不等于"kimi 错"**：本轮 codex 因证据包未含部分文件，把多条 kimi 正确的结论标为"证据不足"。总控必须用源码逐条核验，区分"真分歧"vs"信息不对称"。
- **多模型交叉真正发挥作用的地方**：codex 抓出了 kimi 1.4 的技术硬伤（better-sqlite3 同步约束，kimi 的"单一 async 回调"方案会破坏事务原子性）——这是单模型自查发现不了的盲区。
- **不同模型关注不同维度**：kimi 聚焦架构/代码质量，codex（另一会话）额外点出"安全审计是独立维度，本次零覆盖"。多轮交叉能补单一视角的盲区。

## 七、补充：安全审计缺口（cc 第三轮已关闭 2 条）

> 本轮 kimi/codex 聚焦架构与代码质量，安全面未系统审计。经 ZCode + cc 核实，项目安全设施较扎实，缺口收窄。

**已核实无问题（cc 第三轮用源码关闭）**：
- AI provider key 加密存储（`encryption.ts`：salt+iv+authTag，AES-256-GCM）。
- SSRF 防护、body size 限制、敏感 header 脱敏、rate limit + TRUST_PROXY 开关。
- **管理 API 鉴权覆盖完整**（原七.2 问句，cc 已答）：`src/proxy.ts`（Next.js 16 把 `middleware.ts` 改名为 `proxy.ts`）matcher 覆盖 `/api/projects/*`、`/api/ai/*`；backup（ADMIN_TOKEN）、metrics（METRICS_TOKEN）各自 header token；health/share/login 故意公开。上轮 `CODE-REVIEW-2026-07-25.md:9` 亦结论"鉴权层扎实，未发现绕过/IDOR"。
- **管理 API 无宽松 CORS**（原七.3 问句，cc 已答）：`Access-Control-Allow-Origin` 仅 mock 路由 `:279` 设 `*`；管理 API 全部无 CORS 头 = 默认同源，浏览器跨域读不到。

**仍需补审**：
1. **share slug 可预测性**（低-中危）：`share/[slug]` slug 从项目名生成（非随机 nanoid），且未鉴权返回 `responseBody`。但有 `eq(endpoints.isShareable, 1)` 过滤——owner 逐端点 opt-in，属有意公开。建议：若 share 敏感数据，改用独立随机 share-token（非项目 slug）。
2. **better-sqlite3 同步 I/O 阻塞 event loop**：架构级性能约束（非 bug），应在 `docs/DEPLOY.md` 声明为已知取舍。
3. **import / backup 攻击面**：文件解析（恶意内容/格式注入）、backup（磁盘耗尽/全库数据泄露）是经典攻击向量，建议专项审。

> 结论：鉴权与 CORS 无需复审；安全面只需补审 share slug 随机化 + import/backup 攻击面，无需起完整一轮。

## 八、cc 第三轮 + kimi 回应：误判纠正 + 四方闭环

> cc（claude）作为第四方独立评审，逐条读源码核实了报告的 11 条事实声明（10 条完全属实、1 条半属实），抓出 1 处重大误判 + 5 条盲区。**ZCode 对 cc 每条新发现独立复核，全部成立；kimi 作为原报告作者正式回应，全盘接受、零反驳，并补 2 条深化。至此四方（kimi/codex/cc/ZCode）闭环。**

### 8.1 重大纠正：P0-1（413/429 契约违背）是误判

- **原报告论断**：mock 路由 413/429 返回 `{error, message}` 裸字符串违背契约，应走 `error('PAYLOAD_TOO_LARGE'/...)` 工厂。
- **cc 反驳（ZCode 已复核契约原文确认）**：`docs/API-ERROR-SHAPE.md:3-4` 顶部 scope 条款**显式排除** mock 服务 `/{project}/{...path}`——其 error 字段是被模拟接口的内容，契约本就不管它。
- **三方共同的盲区**：kimi/codex/ZCode 都只读了契约的错误码表（第 50+ 行有 `PAYLOAD_TOO_LARGE`/`RATE_LIMITED`），**漏读了顶部 scope 条款**。把一个 out-of-scope 的一致性观察误升为 P0。
- **裁决**：cc 正确。P0-1 撤下。若追求一致性，应**先改契约把它纳入**（而非改代码），且范围还要含同路由的 404（`route.ts:382`，同样是字符串形状）。最多 P2 可选建议，绝非 P0。
- **kimi 回应 cc 后的深化（四方共识）**：kimi 全盘接受纠正，并指出一个 cc/ZCode 都没说透的灰色地带——mock 路由其实有**两类响应**：(a) endpoint 配置的模拟内容（契约明确排除）、(b) 框架自身的拒绝响应（413/429/404，非"被模拟内容"）。契约排除条款目前只覆盖 (a)，(b) 处于灰色地带。**这正是"先改契约而非先改代码"的精确理由**：应先在契约 scope 条款里明确"框架级拒绝响应是否遵循标准形状"，再决定代码动不动。否则下次审查还会有人在同一个坑里摔。

### 8.2 cc 的 5 条新发现（ZCode 全部复核成立）

1. **`test/route.ts` 也泄露 `${msg}`**（`ai/providers/[id]/test/route.ts:142, 150`）：原报告把它当"正确范例"是错的——它只换对了 code（`PROVIDER_ERROR`），`body = \`Provider API request failed: ${msg}\`` 和 `Errors.internal(\`...${msg}\`)` **同样泄露上游细节**。实现者照抄会留泄露。→ 已并入"真问题 1"，两路由一并整改。
2. **`kv-store.ts:4` docstring 撒谎**（与 schema.ts 同类）：声称"project-cache / endpoint-cache 调 kv.* 接口"，实际两者各自 `new Map` 完全不调。→ 已并入卫生包。
3. **`getDb()` 是死代码**：全 src 无调用点（仅 db.ts:20 / db-sqlite.ts:36 / db-mysql.ts:21 三处定义）。它身上的 `as unknown as Db` 强转爆炸半径因此更小。→ 已并入"清理死代码"项。
4. **`useMysql`/`isMysql` 可独立前置修**：不必卡在"MySQL 是否正式支持"的决策上，改成惰性求值即可消除"测试动态切 DB_TYPE 静默用错库"风险。→ 已从战略项拆出并入卫生包。
5. **TOCTOU 用错误码映射优于正则**：mysql2/drizzle 暴露 `.code===1062`/`ER_DUP_ENTRY`，sqlite 抛 `UNIQUE constraint failed: <table>.<col>`。抽 `isUniqueViolation(err)` 按驱动 code/消息判定，比"精确正则"更稳且去列名硬编码。→ 已并入 Top 5 #2。**kimi 进一步论证**（四方共识）：错误消息文本不是 API，驱动版本升级可能改文案；**错误码才是稳定契约**。MySQL 侧有码必用码；sqlite 侧 better-sqlite3 无稳定机器码，消息解析是不得已，应收窄为"判断含 UNIQUE constraint"的粗匹配 + 用 constraint 名定位，而非精确全句正则。

### 8.3 cc 核实为"非问题"（记录，避免误改）

- **proxy matcher 与 mock slug 碰撞**：cc 曾疑心 `/projects/:path*` matcher 会误拦 slug=projects 的 mock 项目，读 `slug.ts:17` 发现 `RESERVED_SLUGS` 已预留 `projects`/`settings` 等，碰撞被预堵。设计扎实，非问题。

### 8.4 四方闭环确认

kimi 作为原报告作者，对 cc 的 7 条意见（1 重大纠正 + 5 新发现 + 1 非问题核实）逐条正式回应：

| cc 意见 | kimi 立场 |
|---|---|
| 1. P0-1 降级 | **全盘接受**，诚实承认"漏读 scope 条款"，并补"框架拒绝 vs 模拟内容"灰色地带深化 |
| 2. test 路由非范例 | 接受，承认是"code 对了就当整句对了"的偷懒核对 |
| 3. kv-store docstring 谎言 | 纳入，指出危害比 schema.ts 更实际（误导多副本排查） |
| 4. getDb 死代码 | 纳入，强调"该删除而非修正"，改变整改建议本身 |
| 5. isMysql 惰性化拆出 | 同意，惰性化不依赖 MySQL 战略结论 |
| 6. TOCTOU 错误码映射 | 接受，补"错误码是稳定契约、消息文本不是"的深层论证 |
| 7. 安全问句关闭 | 认可，顺带确认 Next.js 16 middleware→proxy 改名 |

**kimi 明确表态**："cc 这轮评审显著提升了最终报告质量，没有我要反驳的地方。" kimi 还主动把教训固化进审查流程：**引用契约文件做判据时，必须全文读一遍再逐条套，不能只检索关键词**——意见 1 的失误根源是三方复核全漏了同一条 scope，说明这是流程盲区不是个人疏忽。

> 四方（kimi/codex/cc/ZCode）对所有实质问题已达成共识，无未决分歧。

## 九、净结论（四方共识）

**应做**：真问题 1（ai/generate + test 文案泄露）、TOCTOU 错误码映射、卫生包（hono + schema/kv-store 注释 + runInTransaction 守卫 + isMysql 惰性化）、清理死代码（getDb 等）。

**应决策**：MySQL 双栈是否正式支持（非 fix，含版本化迁移/缓存统一走 KV/双栈 CI）。

**驳回/撤下**：~~P0-1（413/429 契约违背）~~ —— 契约显式排除 mock 路由，非违背。

**总评（四方一致）**：项目底子不差——KV 抽象、错误契约落地度、鉴权层（proxy.ts）、类型安全（0 个 any）都在水准之上。问题集中在"MySQL 双栈故事的半边"和"审查运动留下的残骸"，定向可清，非架构溃败。多轮交叉的真正价值在：codex 抓 kimi 的 better-sqlite3 同步硬伤、cc 抓三方共同的契约 scope 误判——都是单模型自查发现不了的盲区。
