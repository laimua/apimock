/**
 * 数据库检查脚本
 */

import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';

type TableRow = { name: string };

const _dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();

if (_dbType === 'mysql') {
  void checkMySQL();
} else {
  checkSQLite();
}

function checkSQLite() {
  const sqlite = new Database(process.env.SQLITE_PATH || './data/apimock.db');
  const result = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").all() as TableRow[];
  console.log('SQLite Tables:');
  result.forEach((row) => console.log('  - ' + row.name));
  const check = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_providers';").all() as TableRow[];
  console.log(check.length > 0 ? 'ai_providers exists' : 'ai_providers missing');
  sqlite.close();
}

async function checkMySQL() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'apimock',
  });
  const [rows] = await connection.query('SHOW TABLES') as [TableRow[], unknown];
  console.log('MySQL Tables:');
  rows.forEach((row) => console.log('  - ' + Object.values(row)[0]));
  const [check] = await connection.query('SHOW TABLES LIKE ?', ['ai_providers']) as [TableRow[], unknown];
  console.log(check.length > 0 ? 'ai_providers exists' : 'ai_providers missing');
  await connection.end();
}
