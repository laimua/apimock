/**
 * Mock 热路径 benchmark(只测,不做缓存实现)
 *
 * 模拟 mock 命中全链路中"project/endpoint 缓存命中之后"的那一段:
 *   responses 直查(按 endpoint_id,priority desc / created_at asc)
 *   → selectResponse 规则匹配(matchRules 解析 + query/header 匹配 + fallback)
 *   → 响应装配(headers 解析/sanitize + body JSON 序列化)
 * 外加 handleMockCore 前置的 query/headers map 构建,凑成"整条请求"的近似耗时。
 * HTTP/Next.js 框架开销不在测量范围(两种存储共享同一框架,不影响对比结论)。
 *
 * 判定门槛:MySQL 下 responses 直查 p95 占整条请求 p95 的比例
 *   < 50% → 直查不是耗时大头,加缓存(失效/一致性/TTL 复杂度)收益覆盖不了成本,
 *           裁定不做 responses 缓存;≥ 50% 再议缓存方案。
 *
 * 用法:
 *   pnpm bench:mock-hotpath [--n=5000] [--skip-mysql]
 * MySQL 用 .env 的 MYSQL_* 连接,建独立库 apimock_bench(不动业务库);
 * SQLite 用临时文件库。造数据:endpoints 100 × responses 5 × matchRules 3 条。
 */

import { performance } from 'node:perf_hooks';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
// 经 tsx 运行,直接复用生产选择逻辑(而非在 benchmark 里复刻一份,防漂移)。
// tsx 对无 "type":"module" 包内的 .ts 按 CJS 转换,命名导入会报
// "does not provide an export named",故用命名空间导入 + interop 解析。
import * as selectorModule from '../src/lib/mock-response-selector.ts';
const selectResponse = selectorModule.selectResponse ?? selectorModule.default?.selectResponse;

dotenv.config();

// ============================================
// 参数
// ============================================
const args = new Map(process.argv.slice(2).map((a) => [a.split('=')[0], a.split('=')[1] ?? '']));
const N = Math.max(1000, Number(args.get('--n')) || 1000);
const WARMUP = 200;
const SKIP_MYSQL = args.has('--skip-mysql');

// ============================================
// 数据规模与造数
// ============================================
const ENDPOINT_COUNT = 100;
const RESPONSES_PER_ENDPOINT = 5; // 3 条带规则 + 1 条 is_default + 1 条无规则
const RULE_KEYS_PER_RESPONSE = 3;

const SAMPLE_BODY = JSON.stringify({
  code: 0,
  message: 'ok',
  data: Array.from({ length: 12 }, (_, k) => ({ id: k + 1, name: `item-${k}`, stock: k * 7, price: (k + 1) * 9.9 })),
  pagination: { page: 1, size: 12, total: 128 },
});

/** 造 1 个 endpoint 的 5 条 responses(j: 0-4) */
function makeResponseRows(endpointId, endpointIdx) {
  const rows = [];
  for (let j = 0; j < RESPONSES_PER_ENDPOINT; j++) {
    const hasRules = j < 3; // 前 3 条带 matchRules(3 个 query 条件),后 2 条无规则
    rows.push({
      id: `r-${endpointIdx}-${j}`,
      endpointId,
      name: `resp-${j}`,
      statusCode: 200,
      headers: JSON.stringify({ 'X-Bench-Resp': String(j) }),
      body: SAMPLE_BODY,
      contentType: 'application/json',
      matchRules: hasRules
        ? JSON.stringify({ query: { ver: 'v1', tenant: 'acme', case: `c${j}` } })
        : '{}',
      isDefault: j === 3 ? 1 : 0,
      priority: 3 - j,
      createdAt: endpointIdx * 100 + j,
      updatedAt: endpointIdx * 100 + j,
    });
  }
  return rows;
}

function makeEndpoints() {
  const endpoints = [];
  for (let i = 0; i < ENDPOINT_COUNT; i++) {
    endpoints.push({
      id: `e-${i}`,
      // 精确路径与参数路径混合,模拟真实 endpoint 形态
      path: i % 3 === 0 ? `/api/items/:id/entry-${i}` : `/api/v1/items/entry-${i}`,
      method: i % 4 === 0 ? 'POST' : 'GET',
    });
  }
  return endpoints;
}

// ============================================
// 统计辅助
// ============================================
function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function stats(samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    mean,
  };
}

/**
 * 跑 N 次模拟热路径,返回 { queryNs[], totalNs[] }。
 * queryFn(endpointId) → responses 行(snake_case 原始行),与生产 drizzle 查询等价:
 *   SELECT * FROM responses WHERE endpoint_id = ? ORDER BY priority DESC, created_at ASC
 */
async function runBench(label, queryFn, log) {
  const endpoints = makeEndpoints();
  const endpointMeta = new Map(endpoints.map((e) => [e.id, e]));

  // 热身:触发索引/连接池/ JIT 预热,不计入样本
  for (let i = 0; i < WARMUP; i++) {
    await queryFn(endpoints[i % endpoints.length].id);
  }

  const queryNs = new Array(N);
  const totalNs = new Array(N);

  for (let i = 0; i < N; i++) {
    const ep = endpoints[i % endpoints.length];
    const meta = endpointMeta.get(ep.id);
    const rawQuery = { ver: 'v1', tenant: 'acme', case: i % 5 === 0 ? 'c1' : 'zz' };
    const rawHeaders = {
      'user-agent': 'apimock-bench',
      accept: 'application/json',
      'x-request-id': `req-${i}`,
      'x-tenant': 'acme',
    };

    const t0 = performance.now();

    // —— handleMockCore 前置:query/headers map 构建(URLSearchParams.forEach 等价物)
    const query = { ...rawQuery };
    const requestHeaders = { ...rawHeaders };

    // —— responses 直查(计时)
    const tq0 = performance.now();
    const rows = await queryFn(ep.id);
    const tq1 = performance.now();
    queryNs[i] = tq1 - tq0;

    // —— selectResponse 规则匹配(与 route.ts buildEndpointResponse 等价)
    const sel = selectResponse(
      { responseBody: null, statusCode: 200, contentType: 'application/json', delayMs: 0 },
      rows.map((r) => ({
        statusCode: r.status_code,
        contentType: r.content_type,
        headers: r.headers,
        body: r.body,
        isDefault: r.is_default,
        priority: r.priority,
        matchRules: r.match_rules,
      })),
      query,
      requestHeaders,
    );

    // —— 响应装配(headers sanitize + body 序列化,与 route.ts 尾段等价)
    const outHeaders = { 'Access-Control-Allow-Origin': '*', 'X-Mock-Endpoint': meta.path, ...sel.headers, 'Content-Type': sel.contentType };
    for (const k of Object.keys(outHeaders)) outHeaders[k] = String(outHeaders[k]).replace(/[^\x00-\xff]/g, '?');
    const bodyText = sel.body === undefined ? '{}' : JSON.stringify(sel.body);

    const t1 = performance.now();
    totalNs[i] = t1 - t0;
    // 防止 V8 把纯计算优化掉:消费结果
    if (bodyText.length === 0 && outHeaders['X-Mock-Endpoint'] === '') throw new Error('unreachable');
  }

  const q = stats(queryNs);
  const t = stats(totalNs);
  log(`${label}: query p50=${q.p50.toFixed(3)}ms p95=${q.p95.toFixed(3)}ms mean=${q.mean.toFixed(3)}ms`);
  return { label, query: q, total: t };
}

// ============================================
// SQLite(better-sqlite3 直连)
// ============================================
async function benchSqlite(log) {
  const { default: Database } = await import('better-sqlite3');
  const tmpDir = mkdtempSync(join(tmpdir(), 'apimock-bench-'));
  const dbPath = join(tmpDir, 'bench.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE endpoints (
    id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, path TEXT NOT NULL, method TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE responses (
    id TEXT PRIMARY KEY NOT NULL, endpoint_id TEXT NOT NULL, name TEXT,
    status_code INTEGER NOT NULL DEFAULT 200, headers TEXT DEFAULT '{}', body TEXT,
    content_type TEXT DEFAULT 'application/json', match_rules TEXT DEFAULT '{}',
    is_default INTEGER DEFAULT 0, priority INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  db.exec(`CREATE INDEX responses_endpoint_idx ON responses(endpoint_id)`);

  const seed = db.transaction(() => {
    db.prepare(`INSERT INTO projects VALUES ('p-bench', 'bench', 'bench', 1, 0, 0)`).run();
    const insEp = db.prepare(`INSERT INTO endpoints VALUES (?, 'p-bench', ?, ?, 1, 0, 0)`);
    const insResp = db.prepare(`INSERT INTO responses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const [i, ep] of makeEndpoints().entries()) {
      insEp.run(ep.id, ep.path, ep.method);
      for (const r of makeResponseRows(ep.id, i)) {
        insResp.run(r.id, r.endpointId, r.name, r.statusCode, r.headers, r.body, r.contentType, r.matchRules, r.isDefault, r.priority, r.createdAt, r.updatedAt);
      }
    }
  });
  seed();

  const SQL = `SELECT * FROM responses WHERE endpoint_id = ? ORDER BY priority DESC, created_at ASC`;
  // 每次迭代重新 prepare,与生产 drizzle(better-sqlite3 driver)行为一致
  const result = await runBench('sqlite', async (id) => db.prepare(SQL).all(id), log);

  db.close();
  for (let i = 0; i < 3; i++) {
    try { rmSync(tmpDir, { recursive: true, force: true }); break; } catch { /* Windows EBUSY 重试 */ }
  }
  return result;
}

// ============================================
// MySQL(mysql2,独立库 apimock_bench)
// ============================================
const MYSQL_DDL = [
  `CREATE TABLE projects (
    id VARCHAR(36) PRIMARY KEY, name VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL,
    is_active TINYINT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`,
  `CREATE TABLE endpoints (
    id VARCHAR(36) PRIMARY KEY, project_id VARCHAR(36) NOT NULL, path VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL, is_active TINYINT NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`,
  `CREATE TABLE responses (
    id VARCHAR(36) PRIMARY KEY, endpoint_id VARCHAR(36) NOT NULL, name VARCHAR(255),
    status_code BIGINT NOT NULL DEFAULT 200, headers TEXT, body LONGTEXT,
    content_type VARCHAR(100) DEFAULT 'application/json', match_rules TEXT,
    is_default TINYINT DEFAULT 0, priority BIGINT DEFAULT 0,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
    INDEX responses_endpoint_idx (endpoint_id))`,
];

async function benchMysql(log) {
  const mysql = await import('mysql2/promise');
  const admin = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  });
  await admin.query(`CREATE DATABASE IF NOT EXISTS apimock_bench`);
  await admin.end();

  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: 'apimock_bench',
  });

  await conn.query(`DROP TABLE IF EXISTS responses, endpoints, projects`);
  for (const ddl of MYSQL_DDL) await conn.query(ddl);

  await conn.query(`INSERT INTO projects VALUES ('p-bench', 'bench', 'bench', 1, 0, 0)`);
  const endpoints = makeEndpoints();
  for (const [i, ep] of endpoints.entries()) {
    await conn.query(`INSERT INTO endpoints VALUES (?, 'p-bench', ?, ?, 1, 0, 0)`, [ep.id, ep.path, ep.method]);
    const rows = makeResponseRows(ep.id, i);
    await conn.query(
      `INSERT INTO responses VALUES ?`,
      [rows.map((r) => [r.id, r.endpointId, r.name, r.statusCode, r.headers, r.body, r.contentType, r.matchRules, r.isDefault, r.priority, r.createdAt, r.updatedAt])]
    );
  }

  const SQL = `SELECT * FROM responses WHERE endpoint_id = ? ORDER BY priority DESC, created_at ASC`;
  // execute = 预编译语句,与生产 drizzle(mysql2 driver)行为一致
  const result = await runBench('mysql', async (id) => {
    const [rows] = await conn.execute(SQL, [id]);
    return rows;
  }, log);

  await conn.query(`DROP TABLE IF EXISTS responses, endpoints, projects`);
  await conn.end();
  return result;
}

// ============================================
// 主流程:双引擎跑分 → 对比表 → 缓存判定
// ============================================
async function main() {
  const log = (msg) => console.log(msg);
  console.log(`[bench] mock 热路径 benchmark:N=${N} 次/引擎,数据 ${ENDPOINT_COUNT} endpoints × ${RESPONSES_PER_ENDPOINT} responses(${RULE_KEYS_PER_RESPONSE} 条规则/条)`);

  const results = [];
  results.push(await benchSqlite(log));
  if (!SKIP_MYSQL) {
    try {
      results.push(await benchMysql(log));
    } catch (err) {
      console.error(`[bench] MySQL 失败(可用 --skip-mysql 只跑 SQLite):${err?.message ?? err}`);
      process.exitCode = 1;
    }
  }

  console.log('\n== 对比表(ms)==');
  console.log('引擎    | responses 直查 p50 / p95 / mean | 整条请求 p50 / p95 / mean | p95 占比');
  console.log('--------|----------------------------------|---------------------------|---------');
  for (const r of results) {
    const ratio = r.total.p95 > 0 ? (r.query.p95 / r.total.p95) * 100 : NaN;
    console.log(
      `${r.label.padEnd(7)} | ${r.query.p50.toFixed(3)} / ${r.query.p95.toFixed(3)} / ${r.query.mean.toFixed(3)}`.padEnd(0)
      + ` | ${r.total.p50.toFixed(3)} / ${r.total.p95.toFixed(3)} / ${r.total.mean.toFixed(3)}`
      + ` | ${ratio.toFixed(1)}%`
    );
  }

  const mysqlResult = results.find((r) => r.label === 'mysql');
  if (mysqlResult) {
    const ratio = mysqlResult.query.p95 / mysqlResult.total.p95;
    if (ratio < 0.5) {
      console.log(`\n[结论] MySQL responses 直查 p95 占整条请求 ${(ratio * 100).toFixed(1)}% (<50%)`);
      console.log('[结论] 直查 responses 不是耗时大头 —— 裁定:不做 responses 缓存。');
      console.log('[结论] 理由:加缓存需引入失效(project/endpoint/response 写路径)与一致性成本,收益上限不足整条请求耗时的一半,不划算。');
    } else {
      console.log(`\n[结论] MySQL responses 直查 p95 占整条请求(模拟链路)${(ratio * 100).toFixed(1)}% (>=50%),直查是模拟链路的耗时大头。`);
      console.log(`[结论] 但绝对耗时 p95=${mysqlResult.query.p95.toFixed(3)}ms(亚毫秒);整条 HTTP 请求还含 Next.js 框架/网络/限流等未建模开销。`);
      console.log('[结论] 本轮只记录数据不实现缓存(第 3 轮定稿范围);若后续要上缓存,先在生产形态部署下复测端到端占比。');
    }
  }
}

// 直接执行时才跑(被 import 时不自动执行)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
