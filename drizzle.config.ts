import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

// 加载 .env 文件
dotenv.config();

const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();

// Windows 绝对路径(如 D:\work\apimock\data\x.db)直接作为 sqlite url 传给
// drizzle-kit 时,会被 libsql 按 URL scheme 解析而报 URL_SCHEME_NOT_SUPPORTED。
// 仅当是绝对路径且非 file: 协议时归一为 file:// URL;相对路径(./data/x.db)
// 与 :memory: 原样透传,由 drizzle-kit 自行解析。
function toSqliteUrl(p: string): string {
  if (!isAbsolute(p) || p.startsWith('file:')) return p;
  return pathToFileURL(p).href;
}

export default defineConfig({
  // drizzle-kit 按方言过滤 schema 导出:dialect=mysql 时必须喂 schema-mysql。
  // 若喂 schema.ts(无条件 re-export schema-sqlite,sqlite-core 的表定义会被
  // 过滤成 0 张表),push 会静默 "No changes detected",空库不建表
  // (MySQL CI job 曾因此全挂)。应用层类型统一入口仍是 src/lib/schema.ts。
  schema: dbType === 'mysql' ? './src/lib/schema-mysql.ts' : './src/lib/schema-sqlite.ts',
  out: './drizzle',
  dialect: dbType === 'mysql' ? 'mysql' : 'sqlite',
  dbCredentials: dbType === 'mysql'
    ? {
        host: process.env.MYSQL_HOST || 'localhost',
        port: Number(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'apimock',
      }
    : {
        url: toSqliteUrl(process.env.SQLITE_PATH || './data/apimock.db'),
      },
});