/**
 * 数据库检查脚本
 */

const _dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();

if (_dbType === 'mysql') {
  checkMySQL();
} else {
  checkSQLite();
}

function checkSQLite() {
  const Database = require('better-sqlite3');
  const sqlite = new Database(process.env.SQLITE_PATH || './data/apimock.db');
  const result: any[] = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").all();
  console.log('SQLite Tables:');
  result.forEach((row: any) => console.log('  - ' + row.name));
  const check: any[] = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_providers';").all();
  console.log(check.length > 0 ? 'ai_providers exists' : 'ai_providers missing');
  sqlite.close();
}

async function checkMySQL() {
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'apimock',
  });
  const [rows]: any[] = await connection.query('SHOW TABLES');
  console.log('MySQL Tables:');
  (rows as any[]).forEach((row: any) => console.log('  - ' + Object.values(row)[0]));
  const [check]: any[] = await connection.query('SHOW TABLES LIKE ?', ['ai_providers']);
  console.log((check as any[]).length > 0 ? 'ai_providers exists' : 'ai_providers missing');
  await connection.end();
}
