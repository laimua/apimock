# Code Review 第 3 轮后端决议记录(2026-08-15)

分支 `fix/round3-backend`(基于 #37 后 master)。三项定稿范围 + 一项明确不做。

## 1. mock 热路径 benchmark(只测,不实现缓存)

脚本:`pnpm bench:mock-hotpath`(`scripts/benchmark-mock-hotpath.mjs`)。
模拟 project/endpoint 缓存命中后的链路:responses 直查 → selectResponse 规则匹配 →
响应装配。数据:endpoints 100 × responses 5 × matchRules 3 条规则;N=1000/引擎。

本地实测(Windows / 本地 MySQL 127.0.0.1):

| 引擎   | responses 直查 p50/p95/mean (ms) | 整条请求(模拟链路) p50/p95/mean (ms) | p95 占比 |
|--------|----------------------------------|----------------------------------------|----------|
| sqlite | 0.017 / 0.035 / 0.021            | 0.029 / 0.048 / 0.034                  | 73.0%    |
| mysql  | 0.154 / 0.339 / 0.186            | 0.169 / 0.360 / 0.202                  | 94.2%    |

裁定门槛:MySQL 直查 p95 占整条请求比例 <50% → 不做缓存。实测 **94.2%(≥50%)**,
直查是模拟链路的耗时大头;但绝对耗时 p95=0.339ms(亚毫秒),整条 HTTP 请求还含
Next.js 框架/网络/限流等未建模开销,占比会被稀释。**本轮按定稿只记录数据、不实现
缓存**;若后续要上缓存,先在生产形态部署下复测端到端占比再立项。

## 2. drizzle-kit Windows 假错规避

`drizzle.config.ts` 的 sqlite url 为 Windows 绝对路径(`D:\..`)时,libsql 会把
盘符当 URL scheme 解析,报 `URL_SCHEME_NOT_SUPPORTED`。修复:绝对路径且非 `file:`
开头时用 `pathToFileURL` 归一;相对路径与 `:memory:` 原样透传。已验证
`SQLITE_PATH=D:\work\apimock\data\x.db` 空库 `db:push` 建表成功(见 DEPLOY.md)。

## 3. migrate-standalone 版本标记

迁移成功后写 `PRAGMA user_version = 1`(与迁移代数对齐);启动先读再决定跳过/执行。
达标直接跳过整段迁移(建表/补列/清孤儿全免);失败路径在置位前 throw,重跑即恢复。
测试断言:旧库升级后置位、全新库置位、二跑输出跳过标记且数据/schema 不变。

## 4. 不做:env-fallback OpenAI pinned fetch

理由:`base_url` 为代码常量 `api.openai.com`(openai SDK 默认值),不存在用户可控
的 URL 输入,SSRF 攻击面不存在;pinned fetch 只会增加维护成本而无安全收益。据此
记录并关闭该项,不做实现。
