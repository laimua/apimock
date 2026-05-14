import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

// 加载 .env 文件
dotenv.config();

const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();

export default defineConfig({
  schema: './src/lib/schema.ts',
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
        url: process.env.SQLITE_PATH || './data/apimock.db',
      },
});