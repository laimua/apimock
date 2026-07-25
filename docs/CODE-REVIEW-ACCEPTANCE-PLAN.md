# 修复执行与验收计划(2026-07-26)

> 基于 `docs/CODE-REVIEW-2026-07-25.md` 的修复分工、批次、验收标准。
> 总控:ZCode | 后端:cc(Claude Code) | 前端:kimi | 验收:codex

---

## 一、角色与边界

| 角色 | 职责 | 不做 |
|------|------|------|
| ZCode(总控) | 分配任务、串联协作、裁决分歧、把关方向、跑实证 | 不亲自写实现 |
| cc(后端) | P0-1、P1-1~P1-10、P1-18、P1-19、后端 P2 | 不动前端组件 |
| kimi(前端) | P1-11~P1-17、前端 P2、P2-53(error.tsx) | 不动后端 route/逻辑 |
| codex(验收) | 对照报告逐项验、跑门禁、签字 | 不写代码 |

---

## 二、通用门禁(每批必须全绿,Node 22)

| 门禁 | 命令 | 要求 |
|------|------|------|
| 类型检查 | `pnpm typecheck` | 0 error |
| 测试类型 | `pnpm typecheck:tests`(若有) | 0 error |
| Lint | `pnpm lint` | 0 error,warning ≤ 基线(基线 1) |
| 全量单测 | `pnpm test` | 文件数 + 通过数 ≥ baseline,只增不减 |
| 构建 | `pnpm build` | 仅改 route/middleware/config 时要求 |
| E2E | `pnpm exec playwright test` | 本轮不强制;P0-1/P1-1/P1-2/P1-3 建议手动跑相关 spec |

**Node 版本**:本机默认 Node 16 跑不了 pnpm/vitest,**必须用 Node 22**(`/d/software/nvm/v22.22.1/node.exe`)。

**双栈声明**:触及 `db-sqlite.ts` / `schema-sqlite.ts` / `db-mysql.ts` / `schema-mysql.ts` / SQL 的修复,交付时必须声明 SQLite/MySQL 两边都验证过(测试双跑或读代码对照,写清对照了哪几行)。涉及项:P1-4、P1-5、P1-7、P2-1~7、P2-12~14、P2-40。

---

## 三、批次划分

### 第一批(后端核心,cc,逐段 codex 验收)

| 段 | 项 | 说明 |
|----|----|------|
| A | P0-1 | 流式 body 守卫,独立 |
| B | P1-1 + P1-2 + P1-3 | 导入链三件套,**端到端一起验**(导入 OpenAPI → 打 mock → 返回真实示例体) |
| C | P1-4 | 外键 pragma + 孤儿清理迁移,独立 |
| D | P1-19 | 限流 fail-open,独立 |

### 第二批(cc + kimi 并行)

- **cc 前置**(P1-11 的协作前提):统一服务端错误形状 —— `/api/ai/generate:173-174` 的字符串 error、`projects/[id]/route.ts:140-146` 的 demo 保护 error,统一为 `{success,error:{code,message,details}}` 对象形状(以 `src/lib/api.ts:40-46` 为准)。
- **cc**:P1-5、P1-6、P1-7、P1-8、P1-9、P1-10、P1-18
- **kimi**:P1-11、P1-12、P1-13、P1-14、P1-15、P1-16、P1-17、P2-53(error.tsx)、前端 P2

### 第三批

- P2 批量收尾
- 待验证项(报告末尾列表)清理

---

## 四、每项交付物(缺任一件不签字)

每项修复必须附:

1. **逐项说明**:报告编号 → 改了哪些文件哪些行 → 引用报告"修复"段确认一致 → 新增测试文件 → 双栈声明
2. **diff**:对每个改动文件贴 `git diff`(不要只贴文件名)
3. **测试输出**:新测试 vitest 结果 + 全量 `pnpm test` 末尾摘要
4. **门禁结果**:`pnpm typecheck` + `pnpm lint` 尾部输出;改 route/middleware 的附 `pnpm build`

**签字粒度**:codex 按"段"签字(A/B/C/D),段内全绿才进下一段。

---

## 五、codex 验收重点关注项

### ① P1-1 — `$ref` root 参数 + 循环 guard 的副作用
循环 guard(WeakSet 按节点对象记)可能**误杀 DAG 共享引用**。OpenAPI 里同一 schema 被多个属性 `$ref` 引用是常态(树形 DAG,非环)。
**必测**:
- `#/components/schemas/Pet` 被 Cat 和 Dog 同时 `$ref` → 两者都解析出完整 Pet(第二次不能变空)
- 真环 `#/A→#/A` 才触发 guard
- 区分**环**(断)和**共享引用**(不断);按"指针路径"记 visited 而非节点对象

### ② P1-2 — 实证测试断言翻转
`src/lib/__tests__/p1-2-import-return-proof.test.ts` 是 bug 复现测试(断言"返回 `{}`")。修复后**必须翻转断言为"返回导入示例体"**,不能删/跳过测试掩盖。保留实证注释作为防回退证据。

### ③ P1-3 — isDefault 兜底不破坏 matched 优先级
整体语义是 `matched(规则命中) > fallback`。改 fallback 内部顺序时不能动 matched 优先级。
**必测**:
- 有规则响应命中 → 仍返回规则响应(不被 isDefault 抢)
- 无规则命中 → 进 fallback,fallback 内 isDefault 优先

### ④ P0-1 — 流式 reader 的资源释放与 body 消费
- 超限 413 时 `reader.cancel()` 正确,不泄漏句柄
- 多字节 UTF-8 跨 chunk:推荐只数字节不解码(避免半字符截断)
- **Next route handler 里 `request.body` 只能消费一次** —— 流式读完下游拿不到。必须用 `request.clone()` 或 `request.tee()` 保证下游 `request.json()` 仍可用

### ⑤ P1-4 — 外键 pragma 连接级生效 + 迁移可重入
- `PRAGMA foreign_keys = ON` 按连接生效,必须设在连接创建处(better-sqlite3 每次 new 都设),不是某次查询前
- 孤儿清理迁移必须 **idempotent**(已跑过的库再跑不报错不二次删)
- **顺序:先清孤儿 → 再开 FK**(否则开 FK 后旧孤儿还在,下次 DELETE 不连带清理它们)

---

## 六、其它风险提示

1. **测试基线数字**:报告说"40 文件/371 测试"对不上(单元测试实际 17 文件)。验收以实际 `pnpm test` 输出为准,要求"修复后 ≥ 修复前"。第一批开工前先跑干净 baseline 钉死数字。
2. **P1-2 实证测试历史**:三方分歧已用机器实证终结(见报告"P1-2 机器实证"章节),cc 修改测试时保留实证注释,只翻断言。
3. **P0-1 × P2-28 协同**:P0-1 修完后,直连部署下 X-Real-IP 伪造仍可绕限流。P2 阶段抬高 P2-28 优先级(加 TRUST_PROXY 开关 + DEPLOY 标注)。不影响 P0 验收。
4. **P1-11 跨前后端**:唯一需要 cc+kimi 联合交付的项。第二批 cc 先统一服务端错误形状,kimi 据此写前端,不为 bug 妥协写 `typeof === 'string'`。
5. **drizzle/0001+ 迁移同步性**:P1-4 新增迁移时,顺手 `drizzle-kit generate` 空跑对比 schema 与迁移,清掉这条待验证项。

---

## 七、执行进度

| 段/批 | 项 | 责任 | 状态 | 验收 |
|-------|----|----|------|------|
| 段 A | P0-1 | cc | ⏳ 待开工 | — |
| 段 B | P1-1/2/3 | cc | ⏳ 待开工 | — |
| 段 C | P1-4 | cc | ⏳ 待开工 | — |
| 段 D | P1-19 | cc | ⏳ 待开工 | — |
| 二批 | P1-5~10/18 + 错误形状 | cc | ⏳ | — |
| 二批 | P1-11~17 + P2-53 | kimi | ⏳ | — |
| 三批 | P2 收尾 | cc/kimi | ⏳ | — |
