/**
 * SQLite schema parity 门禁固化测试
 *
 * 验收标准(见 2026-08-15 round2 方案):
 * 1. 干净库:drizzle-kit push 与 migrate-standalone 语义一致 → 脚本 exit 0
 * 2. 故意改 schema-sqlite.ts 一列 → 比对失败
 * 3. 故意改 migrate DDL 一列 → 比对失败
 * 4. 比对器本体:等价 schema(仅格式不同)不误报;各维度差异能逐字段定位
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import {
  extractSchema,
  diffSchemas,
  validateSchemaCoverage,
} from '../scripts/check-sqlite-schema-parity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRIZZLE_KIT_BIN = join(REPO_ROOT, 'node_modules', 'drizzle-kit', 'bin.cjs');

const tmpDir = mkdtempSync(join(tmpdir(), 'parity-test-'));
/** 临时产物写在仓库内(schema 变体要能解析 node_modules),测试后清理。
 * 注意 drizzle-kit 只认相对 cwd 的 schema 路径,统一用相对路径。 */
const tmpSchemaVariantRel = 'tmp-parity-schema-variant.ts';
const tmpMigrateVariantRel = join('scripts', 'tmp-parity-migrate-variant.mjs');
const tmpSchemaVariant = join(REPO_ROOT, tmpSchemaVariantRel);
const tmpMigrateVariant = join(REPO_ROOT, tmpMigrateVariantRel);

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(tmpSchemaVariant, { force: true });
  rmSync(tmpMigrateVariant, { force: true });
});

function runNode(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  expect(r.error).toBeUndefined();
  return r;
}

function drizzlePush(schemaPath: string, dbPath: string) {
  const r = runNode([
    DRIZZLE_KIT_BIN, 'push',
    '--dialect', 'sqlite',
    '--schema', schemaPath,
    '--url', pathToFileURL(dbPath).href,
    '--force',
  ]);
  expect(r.status).toBe(0);
}

function runMigrate(scriptPath: string, dbPath: string) {
  const r = runNode([scriptPath], { SQLITE_PATH: dbPath });
  expect(r.status).toBe(0);
}

// ============================================
// 验收 1/2/3:两条建库链路 + 反向用例
// ============================================
describe('schema parity 门禁(验收固化)', () => {
  it('干净库:门禁脚本 exit 0', () => {
    const r = runNode([join('scripts', 'check-sqlite-schema-parity.mjs')]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/OK/);
  }, 120_000);

  it('故意改 schema-sqlite.ts 一列(tags text→integer)→ 比对失败', () => {
    const source = readFileSync(join(REPO_ROOT, 'src/lib/schema-sqlite.ts'), 'utf8');
    expect(source).toContain("tags: text('tags').default('[]')");
    writeFileSync(
      tmpSchemaVariant,
      source.replace("tags: text('tags').default('[]')", "tags: integer('tags').default('[]')")
    );

    const dbA = join(tmpDir, 'schema-variant.db');
    const dbB = join(tmpDir, 'migrate-ref.db');
    drizzlePush(tmpSchemaVariantRel, dbA);
    runMigrate(join('scripts', 'migrate-standalone.mjs'), dbB);

    const connA = new Database(dbA);
    const connB = new Database(dbB);
    const diffs = diffSchemas(extractSchema(connA), extractSchema(connB));
    connA.close();
    connB.close();

    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.some((d) => d.includes('tags.type'))).toBe(true);
  }, 120_000);

  it('故意改 migrate DDL 一列(description TEXT→INTEGER)→ 比对失败', () => {
    const source = readFileSync(join(REPO_ROOT, 'scripts/migrate-standalone.mjs'), 'utf8');
    expect(source).toContain('description TEXT,');
    writeFileSync(
      tmpMigrateVariant,
      source.replace(/description TEXT,/g, 'description INTEGER,')
    );

    const dbA = join(tmpDir, 'drizzle-ref.db');
    const dbB = join(tmpDir, 'migrate-variant.db');
    // drizzle-kit 在 Windows 上只认正斜杠 schema 路径,不用 path.join
    drizzlePush('src/lib/schema-sqlite.ts', dbA);
    runMigrate(tmpMigrateVariantRel, dbB);

    const connA = new Database(dbA);
    const connB = new Database(dbB);
    const diffs = diffSchemas(extractSchema(connA), extractSchema(connB));
    connA.close();
    connB.close();

    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.some((d) => d.includes('description.type'))).toBe(true);
  }, 120_000);
});

// ============================================
// 比对器本体:不误报 + 各维度差异定位
// ============================================
describe('diffSchemas 比对器', () => {
  function schemaOf(ddl: string[]) {
    const db = new Database(':memory:');
    for (const sql of ddl) db.exec(sql);
    const schema = extractSchema(db);
    db.close();
    return schema;
  }

  const OWNERS_DDL = `CREATE TABLE owners (id TEXT PRIMARY KEY NOT NULL, label TEXT)`;
  const BASE_DDL = [
    `CREATE TABLE items (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      owner_id TEXT,
      count INTEGER DEFAULT 0,
      FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
    )`,
    OWNERS_DDL,
    `CREATE UNIQUE INDEX items_name_idx ON items(name)`,
    `CREATE INDEX items_count_idx ON items(count)`,
  ];

  it('等价 schema(仅大小写/空白/引号格式不同)→ 无差异', () => {
    const variant = [
      `create table "items" (
        "id" text primary key  not null ,
        "name" text not null,
        "owner_id" text,
        "count" integer default 0,
        foreign key ("owner_id") references "owners"("id") on delete cascade
      )`,
      `create table owners (id text primary key not null, label text)`,
      `create unique index items_name_idx on items(name)`,
      `create index items_count_idx on items(count)`,
    ];
    expect(diffSchemas(schemaOf(BASE_DDL), schemaOf(variant))).toEqual([]);
  });

  it('表集合差异(缺一张表)能定位', () => {
    const diffs = diffSchemas(schemaOf(BASE_DDL), schemaOf(BASE_DDL.slice(0, 1)));
    expect(diffs.some((d) => d.includes('owners'))).toBe(true);
  });

  it('列差异逐字段定位(类型/default)', () => {
    const variant = [
      `CREATE TABLE items (
        id TEXT PRIMARY KEY NOT NULL,
        name VARCHAR(50) NOT NULL,
        owner_id TEXT,
        count INTEGER DEFAULT 1,
        FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
      )`,
      ...BASE_DDL.slice(1),
    ];
    const diffs = diffSchemas(schemaOf(BASE_DDL), schemaOf(variant));
    expect(diffs.some((d) => d.includes('name.type'))).toBe(true);
    expect(diffs.some((d) => d.includes('count.default'))).toBe(true);
  });

  it('缺列能定位', () => {
    const variant = [
      `CREATE TABLE items (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        owner_id TEXT,
        FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
      )`,
      ...BASE_DDL.slice(1, 3),
    ];
    const diffs = diffSchemas(schemaOf(BASE_DDL), schemaOf(variant));
    expect(diffs.some((d) => d.includes('列 count'))).toBe(true);
  });

  it('外键 on_delete 差异能定位', () => {
    const variant = [
      `CREATE TABLE items (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        owner_id TEXT,
        count INTEGER DEFAULT 0,
        FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE SET NULL
      )`,
      ...BASE_DDL.slice(1),
    ];
    const diffs = diffSchemas(schemaOf(BASE_DDL), schemaOf(variant));
    expect(diffs.some((d) => d.includes('外键差异'))).toBe(true);
  });

  it('索引差异(唯一→非唯一)能定位', () => {
    const variant = [
      ...BASE_DDL.slice(0, 3),
      // items_name_idx 原为唯一索引,变体改成非唯一
      `CREATE INDEX items_count_idx ON items(count)`,
      `CREATE INDEX items_name_idx2 ON items(name)`,
    ];
    const diffs = diffSchemas(schemaOf(BASE_DDL), schemaOf(variant));
    expect(diffs.some((d) => d.includes('索引差异'))).toBe(true);
  });

  it('AUTOINCREMENT 表属性差异能定位', () => {
    const variant = [
      `CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        owner_id TEXT,
        count INTEGER DEFAULT 0,
        FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
      )`,
      ...BASE_DDL.slice(1),
    ];
    const diffs = diffSchemas(schemaOf(BASE_DDL), schemaOf(variant));
    expect(diffs.some((d) => d.includes('autoincrement'))).toBe(true);
  });
});

// ============================================
// 新维度变异测试:复合 FK / index_xinfo / CHECK / collation /
// generated column / view / trigger / 覆盖防呆
// ============================================
describe('diffSchemas 新维度(变异测试)', () => {
  function schemaOf(ddl: string[]) {
    const db = new Database(':memory:');
    for (const sql of ddl) db.exec(sql);
    const schema = extractSchema(db);
    db.close();
    return schema;
  }

  const PAIRS_DDL = `CREATE TABLE pairs (a TEXT NOT NULL, b TEXT NOT NULL, PRIMARY KEY (a, b))`;
  const compositeFkItems = (fkClause: string) => [
    `CREATE TABLE items (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      pa TEXT,
      pb TEXT,
      ${fkClause}
    )`,
    PAIRS_DDL,
  ];

  it('复合 FK 与拆成两个单列 FK 能区分(按 id 分组)', () => {
    const base = compositeFkItems('FOREIGN KEY (pa, pb) REFERENCES pairs(a, b)');
    const variant = compositeFkItems(
      'FOREIGN KEY (pa) REFERENCES pairs(a), FOREIGN KEY (pb) REFERENCES pairs(b)'
    );
    const diffs = diffSchemas(schemaOf(base), schemaOf(variant));
    expect(diffs.some((d) => d.includes('外键差异'))).toBe(true);
  });

  it('复合 FK 列序颠倒能区分(保留 seq)', () => {
    const base = compositeFkItems('FOREIGN KEY (pa, pb) REFERENCES pairs(a, b)');
    const variant = compositeFkItems('FOREIGN KEY (pb, pa) REFERENCES pairs(b, a)');
    const diffs = diffSchemas(schemaOf(base), schemaOf(variant));
    expect(diffs.some((d) => d.includes('外键差异'))).toBe(true);
  });

  const idxItems = (indexDdl: string) => [
    `CREATE TABLE items (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, count INTEGER DEFAULT 0)`,
    indexDdl,
  ];

  it('索引列 DESC 变化能定位', () => {
    const base = idxItems(`CREATE INDEX items_count_idx ON items(count)`);
    const variant = idxItems(`CREATE INDEX items_count_idx ON items(count DESC)`);
    expect(diffSchemas(schemaOf(base), schemaOf(variant)).some((d) => d.includes('索引差异'))).toBe(true);
  });

  it('索引列 collation 变化能定位', () => {
    const base = idxItems(`CREATE INDEX items_count_idx ON items(count)`);
    const variant = idxItems(`CREATE INDEX items_count_idx ON items(count COLLATE NOCASE)`);
    expect(diffSchemas(schemaOf(base), schemaOf(variant)).some((d) => d.includes('索引差异'))).toBe(true);
  });

  it('表达式索引与普通列索引能区分', () => {
    const base = idxItems(`CREATE INDEX items_count_idx ON items(count)`);
    const variant = idxItems(`CREATE INDEX items_count_idx ON items(abs(count))`);
    expect(diffSchemas(schemaOf(base), schemaOf(variant)).some((d) => d.includes('索引差异'))).toBe(true);
  });

  it('partial 索引 WHERE 谓词差异能定位', () => {
    const base = idxItems(`CREATE INDEX items_count_idx ON items(count) WHERE count > 0`);
    const variant = idxItems(`CREATE INDEX items_count_idx ON items(count) WHERE count > 10`);
    expect(diffSchemas(schemaOf(base), schemaOf(variant)).some((d) => d.includes('索引差异'))).toBe(true);
  });

  const checkItems = (check: string) => [
    `CREATE TABLE items (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      count INTEGER DEFAULT 0 ${check}
    )`,
  ];

  it('CHECK constraint 缺失能定位', () => {
    const base = checkItems('CHECK (count >= 0)');
    const variant = checkItems('');
    expect(diffSchemas(schemaOf(base), schemaOf(variant)).some((d) => d.includes('CHECK 差异'))).toBe(true);
  });

  it('CHECK 表达式差异能定位', () => {
    const base = checkItems('CHECK (count >= 0)');
    const variant = checkItems('CHECK (count > 0)');
    expect(diffSchemas(schemaOf(base), schemaOf(variant)).some((d) => d.includes('CHECK 差异'))).toBe(true);
  });

  it('列 collation 差异能定位', () => {
    const base = schemaOf([
      `CREATE TABLE items (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL)`,
    ]);
    const variant = schemaOf([
      `CREATE TABLE items (id TEXT PRIMARY KEY NOT NULL, name TEXT COLLATE NOCASE NOT NULL)`,
    ]);
    expect(
      diffSchemas(base, variant).some((d) => d.includes('name.collate'))
    ).toBe(true);
  });

  const generatedItems = (colDef: string) => [
    `CREATE TABLE items (
      id TEXT PRIMARY KEY NOT NULL,
      count INTEGER DEFAULT 0${colDef ? ',' + colDef : ''}
    )`,
  ];

  it('generated column(VIRTUAL)新增能定位', () => {
    const base = schemaOf(generatedItems(''));
    const variant = schemaOf(
      generatedItems(`dbl INTEGER GENERATED ALWAYS AS (count * 2)`)
    );
    expect(
      diffSchemas(base, variant).some((d) => d.includes('列 dbl'))
    ).toBe(true);
  });

  it('generated column VIRTUAL vs STORED 能区分', () => {
    const base = schemaOf(
      generatedItems(`dbl INTEGER GENERATED ALWAYS AS (count * 2)`)
    );
    const variant = schemaOf(
      generatedItems(`dbl INTEGER GENERATED ALWAYS AS (count * 2) STORED`)
    );
    expect(
      diffSchemas(base, variant).some((d) => d.includes('dbl.hidden'))
    ).toBe(true);
  });

  const ITEMS_MIN = `CREATE TABLE items (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL)`;
  const VIEW_DDL = `CREATE VIEW v_items AS SELECT id FROM items`;
  const TRIGGER_DDL = `CREATE TRIGGER t_items AFTER INSERT ON items BEGIN UPDATE items SET name = name WHERE id = NEW.id; END`;

  it('view 缺失/SQL 差异能定位', () => {
    const base = schemaOf([ITEMS_MIN, VIEW_DDL]);
    expect(
      diffSchemas(schemaOf([ITEMS_MIN]), base).some((d) => d.includes('view v_items'))
    ).toBe(true);
    const variant = schemaOf([
      ITEMS_MIN,
      `CREATE VIEW v_items AS SELECT id, name FROM items`,
    ]);
    expect(
      diffSchemas(base, variant).some((d) => d.includes('SQL 差异'))
    ).toBe(true);
  });

  it('trigger 缺失/SQL 差异能定位', () => {
    const base = schemaOf([ITEMS_MIN, TRIGGER_DDL]);
    expect(
      diffSchemas(schemaOf([ITEMS_MIN]), base).some((d) => d.includes('trigger t_items'))
    ).toBe(true);
    const variant = schemaOf([
      ITEMS_MIN,
      `CREATE TRIGGER t_items AFTER UPDATE ON items BEGIN UPDATE items SET name = name WHERE id = NEW.id; END`,
    ]);
    expect(
      diffSchemas(base, variant).some((d) => d.includes('SQL 差异'))
    ).toBe(true);
  });

  it('validateSchemaCoverage:空 schema / 缺已知表 报错,5 表齐全通过', () => {
    expect(validateSchemaCoverage({}, 'X')).toHaveLength(1);
    const partial: Record<string, never> = { projects: {} as never };
    const errors = validateSchemaCoverage(partial, 'X');
    expect(errors.some((e) => e.includes('endpoints'))).toBe(true);

    const full = Object.fromEntries(
      ['projects', 'endpoints', 'requests', 'responses', 'ai_providers'].map((t) => [t, {}])
    );
    expect(validateSchemaCoverage(full as Record<string, never>, 'X')).toEqual([]);
  });
});
