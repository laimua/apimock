# 代码审查修复完成报告 — 2026-07-26

> 基于 `docs/CODE-REVIEW-2026-07-25.md`(P0×1 + P1×19 + P2×55)的全量修复收尾。
> 分工:ZCode(总控)/ cc(Claude Code,后端)/ kimi(前端)/ codex(验收)。
> 验收标准:`docs/CODE-REVIEW-ACCEPTANCE-PLAN.md`。

---

## 总览

| 级别 | 总数 | 已修复 | 跳过(backlog/可接受) | 待验证 |
|------|------|--------|----------------------|--------|
| **P0** | 1 | **1** | 0 | 0 |
| **P1** | 19 | **19** | 0 | 0 |
| **P2** | 55 | **40** | 15(根治需大改/可接受近似/纯 UX 中等活) | 见末节 |
| **合计** | 75 | **60** | 15 | 9 项待验证 |

**所有 P0 + P1 全部修复**(阻断性与功能性 bug 清零);**P2 修复 40/55(72%)**,剩余 15 项是"根治需大改/可接受近似/纯 UX 中等活",留 backlog。

## 5 个 PR(全部合并 master,CI 全绿含 E2E)

| PR | 标题 | 范围 |
|----|------|------|
| [#16](https://github.com/laimua/apimock/pull/16) | 第一批(后端核心) | P0-1 + P1-1/2/3/4/19 |
| [#17](https://github.com/laimua/apimock/pull/17) | 第二批(后端) | P1-5/6/7/8/9/10/18 + P2-9 + 错误形状统一(P1-11 前置) |
| [#18](https://github.com/laimua/apimock/pull/18) | 第二批(前端) | P1-11~17 + P2-53 |
| [#19](https://github.com/laimua/apimock/pull/19) | 第三批(后端 P2) | P2-1/2/3/4/5/6/15/16/17/21/22/23/29/31/32/33/34/35/36/38/39 |
| [#20](https://github.com/laimua/apimock/pull/20) | 第三批(前端 P2) | P2-46/49 |
| [#21](https://github.com/laimua/apimock/pull/21) | 收尾1 | P2-8/25/36/44/55 + P1-9 regex 收紧 + drizzle 同步核验 |
| [#22](https://github.com/laimua/apimock/pull/22) | 收尾2 | P2-10/12/13/27/43/48/50 |
| [#23](https://github.com/laimua/apimock/pull/23) | 收尾3 | P2-24(limit 1) |

## 测试增长

- 起点:41 文件 / 374 测试(报告基线)
- 终点:**64 文件 / 640 测试全绿**(+23 文件 +266 测试)
- CI:Lint + Unit + Build ✅,E2E(Playwright)✅
- Node 22 必需;**测试门禁用空库 `SQLITE_PATH=/tmp/clean-test.db` 验证**(吸取第二批 CI 失败教训)

---

## P0(1/1 全修复)

| 项 | PR | 说明 |
|----|----|------|
| **P0-1** | #16 | mock 路由 body 守卫改流式 `getReader()`,堵 chunked 绕过 fast-path 的未鉴权内存 DoS。fire-and-forget cancel(undici tee body 上 await 挂起,实测确认不泄漏) |

## P1(19/19 全修复)

| 项 | PR | 说明 |
|----|----|------|
| P1-1 | #16 | OpenAPI `$ref` 解析:root 参数透传 + 解析栈循环 guard(不误杀 DAG) |
| P1-2 | #16 | 导入端点 responseBody 置 null(原 `'{}'` 恒抢占 fallback)。**注**:修复仅对**新导入**生效;老库里 P1-2 修复前 import 写入的 `response_body='{}'` 存量数据**无法自动迁移**(DB 无来源标记,无法区分 import 产生 vs UI 用户主动设 `'{}'`,强迁移会误伤用户数据)。老库用户需重新导入或手动改端点。 |
| P1-3 | #16 | isDefault 选择拆 defaultResp/firstNoRule 优先 |
| P1-4 | #16 | SQLite `PRAGMA foreign_keys=ON` + 孤儿清理迁移(注:better-sqlite3 驱动层默认 ON,生产未实际触发,防御性修复) |
| P1-5 | #17 | prune 归桶 NULL endpointId 行,404 记录不再无限增长 |
| P1-6 | #17 | 项目删除/停用/改名后缓存失效(invalidateProjectCache 0→3 调用点) |
| P1-7 | #17 | requests 分页参数校验(page≥1, pageSize∈[1,200]) |
| P1-8 | #17 | GET /api/projects 分页 NaN 兜底 + try/catch |
| P1-9 | #17 | 端点路径 regex(必 `/` 开头、拒尾斜杠) |
| P1-10 | #17 | malformed-json 走原始文本分支(不经 JSON 序列化) |
| P1-11 | #18 | 前端统一读 `json.error?.message`(无字符串兼容)+ settings 401 跳登录 |
| P1-12 | #18 | share 页 `parseTags`(try/catch + Array.isArray) |
| P1-13 | #18 | 标签输入独立 string state(尾逗号不吞) |
| P1-14 | #18 | models textarea 字符串 state + 行内错误 |
| P1-15 | #18 | 列表 `reqIdRef` 竞态防护 |
| P1-16 | #18 | unsaved-changes 注册表 + GlobalHeader guard + 新建页 beforeunload |
| P1-17 | #18 | CT 切换仅 body 空/模板才替换 |
| P1-18 | #17 | SSRF 拦截 fe80::/10(`/^fe[89ab]/` 完整 /10) |
| P1-19 | #16 | 限流 KV 故障 fail-open(放行 + logger + 指标) |
| (P1-11 前置) | #17 | 服务端错误形状统一 + `docs/API-ERROR-SHAPE.md` 契约 |

## P2(23/55 修复,32 项跳过)

### 已修复(23 项)

**功能性 bug(10)**:P2-4(slug 409)、P2-15(import 文件上限+分块)、P2-16(YAML 循环 400)、P2-17(import 207/500)、P2-22(models parse 降级)、P2-23(test 前置校验)、P2-38(mock 非 Latin-1 头)、P2-39(contentType media type)、P2-46(删除防重复)、P2-49(share fullUrl/toast)

**数据一致性/资源(7)**:P2-1/2/3(AI providers 事务)、P2-5(getKv 并发)、P2-6(backup 冲突)、P2-32(Redis incrby TTL)、P2-33(BACKUP_KEEP=0)、P2-35(OTel 启动)

**纵深防御(6)**:P2-21(health 信息泄露)、P2-29(encryption LRU+KEY校验)、P2-31(脱敏名单)、P2-34(busy_timeout)、P2-36(console.error→logger)、P2-53(error.tsx,在 #18)

**顺带做**:P2-9(PUT 重复预检,在 #17)、P2-18(`$ref` 空指针,在 #16)、P2-20(demo error 形状,在 #17)、P2-54(消 lint warning,在 #18)

### 跳过(32 项,留 backlog 或文档说明)

- **纯风格/可接受近似**:P2-7(count-then-delete 非原子,报告自标可接受)、P2-11(LIKE 通配符)、P2-25(排序方向)、P2-37(resetAt 不精确)、P2-55(query last-wins 文档说明)
- **边缘/低危**:P2-8(check-slug 上限)、P2-10(responses body 大小)、P2-12/13(排序不确定)、P2-14(inactive 屏蔽 active,设计权衡)、P2-19(Errors.internal 透 message,管理面已登录)、P2-24(select count)、P2-30(Host 头污染)
- **待验证(根治需大改)**:P2-26(SSRF DNS rebinding,需连接层 pin)、P2-27(内网段缺口,按需)、P2-28(X-Real-IP,已在 DEPLOY 标注待 TRUST_PROXY)、P2-52(JsonEditor Firefox linter)
- **性能/缓存优化(可接受)**:P2-40(prune O(N²))、P2-41(endpoint-cache 含 responseBody)、P2-42(不缓存负结果,有限流兜底)
- **前端 UX 改进(非 bug)**:P2-44(setError 清零,已被 P1-15 覆盖)、P2-45(api-client 超时/from)、P2-47(导入关窗 Abort)、P2-48(visibility 闪白)、P2-50(下拉框重拉)、P2-51(弹窗 a11y + 原生 confirm)

---

## 待验证项(报告末节,本轮处理)

| 项 | 处理 |
|----|------|
| MySQL `count(*)` 返回类型 | 未验证(无 MySQL CI,逻辑层面 mysql2 默认转 number) |
| drizzle `.offset(NaN)` 行为 | P1-7/8 已兜底,无论原行为如何都安全 |
| Next 尾斜杠 308 行为 | P1-9 拒尾斜杠,无论 Next 行为都安全 |
| X-Real-IP 反代覆写 | P2-28 已在 DEPLOY 标注,待 TRUST_PROXY |
| 多副本缓存窗口 | P1-6 已在 DEPLOY + project-cache 注释标注 |
| undici 跨 origin 重定向剥 Authorization | P2-26 待验证,短期注释标注 |
| OTel auto-instrumentation 覆盖 | P2-35 已加 try/catch 降级,排序风险待验 |
| OpenAI APIError 含 apiKey | 未验证(logger redact 已覆盖) |
| JsonEditor Firefox linter | P2-52 待验证 |

---

## 工程亮点与教训

### 亮点
1. **cc 主动捅出 better-sqlite3 默认 FK=ON**(P1-4)— 没有为显得修了 bug 装作默认 OFF,诚实报告"生产未实际触发",修复按防御性接受
2. **循环 guard 用解析栈而非 WeakSet**(P1-1)— 正确回应 codex 重点关注,DAG 共享不误杀,7 场景实测验证
3. **P2-38 只编码非 Latin-1 字符**(修 E2E)— 原 encodeURIComponent 把 `/` 编成 `%2F` 破坏 E2E 断言,改为只编码 `>0xFF` 字符,常见路径可读性不变
4. **codex 多次独立实测**(fire-and-forget cancel、DAG、media type、循环检测)— 不光读 diff

### 教训(已固化到流程)
1. **subagent 共享主工作区,不能并行 git** — 第二批曾让 cc 的 `git add -A` 卷入 kimi 半成品,后续严格串行
2. **测试门禁必须空库验证** — 第二批 CI 因测试依赖生产 db 残留表失败,本地"全绿"是假象;后续所有验收用 `SQLITE_PATH=/tmp/clean-test.db`
3. **两个 tsc 都要跑** — 主 tsc + test tsc(`-p tsconfig.test.json`),曾漏跑 test tsc 导致 CI 失败
4. **E2E 是真实裁判** — Unit 绿不代表 E2E 绿,P2-38 破坏 E2E 断言就是例证

---

## 后续建议(backlog)

1. **TRUST_PROXY 开关**(P2-28):直连部署 IP 伪造,加显式开关 + DEPLOY 标注
2. **SSRF DNS rebinding 根治**(P2-26):需把解析结果 pin 到连接层
3. **prune 窗口函数优化**(P2-40):表大后 O(N²) 变慢
4. **endpoint-cache 剥离 responseBody**(P2-41):内存膨胀
5. **前端 UX 批**(P2-45/47/48/50/51):api-client 健壮性、导入 Abort、visibility 闪白、下拉框缓存、弹窗 a11y
6. **统一 console.warn → logger**(P2-36 遗留):kv-store/encryption/ssrf 的 warn

---

## 文档产出

- `docs/CODE-REVIEW-2026-07-25.md`(审查报告,含三方复核 + P1-2 机器实证 + P1-4 复核注记)
- `docs/CODE-REVIEW-ACCEPTANCE-PLAN.md`(验收计划与标准)
- `docs/API-ERROR-SHAPE.md`(服务端错误形状契约)
- `docs/DEPLOY.md`(补充限流语义 + 缓存一致性章节)

**所有 P0 + P1 阻断性与功能性 bug 已清零,P2 功能性项全部完成,代码审查报告闭环。**
