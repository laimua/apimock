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
}

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
  indexes: string[];
  attrs: { autoincrement: boolean; strict: boolean; withoutRowid: boolean };
}

export type SchemaDescription = Record<string, ParityTableDescription>;

export declare function extractSchema(
  db: import('better-sqlite3').Database
): SchemaDescription;

export declare function diffSchemas(
  a: SchemaDescription,
  b: SchemaDescription,
  labelA?: string,
  labelB?: string
): string[];
