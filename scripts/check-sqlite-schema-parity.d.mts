/**
 * check-sqlite-schema-parity.mjs 的类型声明(测试 import 用)
 * 实现与注释见 scripts/check-sqlite-schema-parity.mjs
 */

export interface ParityColumn {
  name: string;
  type: string;
  notnull: boolean;
  default: string | null;
  pk: number;
  /** 0=普通列,1=VIRTUAL 生成列,2=STORED 生成列 */
  hidden: number;
  collate: string | null;
}

/** 复合 FK 按 id 分组后的一组外键(from/to 为逗号连接的列序) */
export interface ParityForeignKey {
  table: string;
  from: string;
  to: string;
  onUpdate: string;
  onDelete: string;
}

export interface ParityTableDescription {
  columns: ParityColumn[];
  fks: ParityForeignKey[];
  /** `name/origin/unique/partial-where/col:desc:coll,...` 形式的 key */
  indexes: string[];
  /** CHECK 表达式列表(normalized + 排序) */
  checks: string[];
  attrs: { autoincrement: boolean; strict: boolean; withoutRowid: boolean };
}

export interface SchemaDescription {
  tables: Record<string, ParityTableDescription>;
  /** view 名 → normalized SQL */
  views: Record<string, string>;
  /** trigger 名 → normalized SQL */
  triggers: Record<string, string>;
}

export declare const REQUIRED_TABLES: string[];

export declare function extractSchema(
  db: import('better-sqlite3').Database
): SchemaDescription;

export declare function diffSchemas(
  a: SchemaDescription,
  b: SchemaDescription,
  labelA?: string,
  labelB?: string
): string[];

export declare function validateSchemaCoverage(
  tables: Record<string, ParityTableDescription>,
  label: string
): string[];
