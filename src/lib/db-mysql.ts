/**
 * MySQL 数据库连接
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema-mysql';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'apimock',
  waitForConnections: true,
  connectionLimit: 10,
});

export const db = drizzle(pool, { schema, mode: 'default' });
