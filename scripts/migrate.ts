/**
 * 数据库迁移脚本
 * 支持 SQLite 和 MySQL
 */

const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();

if (dbType === 'mysql') {
  migrateMySQL();
} else {
  migrateSQLite();
}

function migrateSQLite() {
  const Database = require('better-sqlite3');
  const sqlite = new Database(process.env.SQLITE_PATH || './data/apimock.db');

  try {
    console.log('Starting SQLite migration...');
    sqlite.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT, base_path TEXT, is_active INTEGER NOT NULL DEFAULT 1, settings TEXT DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS endpoints (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, path TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'GET', name TEXT, description TEXT, is_active INTEGER NOT NULL DEFAULT 1, delay_ms INTEGER DEFAULT 0, tags TEXT DEFAULT '[]', status_code INTEGER DEFAULT 200, content_type TEXT DEFAULT 'application/json', response_body TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE, UNIQUE(project_id, method, path))`);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, endpoint_id TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, query TEXT, headers TEXT, body TEXT, response_status INTEGER, response_time INTEGER, ip TEXT, user_agent TEXT, created_at INTEGER NOT NULL, FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE)`);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS responses (id TEXT PRIMARY KEY, endpoint_id TEXT NOT NULL, name TEXT, description TEXT, status_code INTEGER NOT NULL DEFAULT 200, headers TEXT DEFAULT '{}', body TEXT, body_template TEXT, content_type TEXT DEFAULT 'application/json', match_rules TEXT DEFAULT '{}', is_default INTEGER DEFAULT 0, priority INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE)`);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS ai_providers (id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL, base_url TEXT, api_key TEXT NOT NULL, models TEXT NOT NULL, default_model TEXT, system_prompt TEXT, is_active INTEGER NOT NULL DEFAULT 1, is_default INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    sqlite.exec('CREATE INDEX IF NOT EXISTS endpoints_lookup_idx ON endpoints(project_id, method, path)');
    console.log('SQLite migration completed!');
    sqlite.close();
  } catch (error) {
    console.error('Migration failed:', error);
    sqlite.close();
    process.exit(1);
  }
}

async function migrateMySQL() {
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  });

  try {
    console.log('Starting MySQL migration...');
    const database = process.env.MYSQL_DATABASE || 'apimock';
    await connection.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    await connection.query('USE ??', [database]);

    await connection.query('CREATE TABLE IF NOT EXISTS projects (id VARCHAR(36) PRIMARY KEY, name VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL UNIQUE, description TEXT, base_path VARCHAR(500), is_active TINYINT NOT NULL DEFAULT 1, settings TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, INDEX projects_slug_idx (slug)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    await connection.query('CREATE TABLE IF NOT EXISTS endpoints (id VARCHAR(36) PRIMARY KEY, project_id VARCHAR(36) NOT NULL, path VARCHAR(500) NOT NULL, method VARCHAR(10) NOT NULL DEFAULT "GET", name VARCHAR(255), description TEXT, is_active TINYINT NOT NULL DEFAULT 1, delay_ms BIGINT DEFAULT 0, tags TEXT, status_code BIGINT DEFAULT 200, content_type VARCHAR(100) DEFAULT "application/json", response_body LONGTEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE, UNIQUE INDEX endpoints_project_method_path_idx (project_id, method, path)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    await connection.query('CREATE TABLE IF NOT EXISTS requests (id VARCHAR(36) PRIMARY KEY, endpoint_id VARCHAR(36) NOT NULL, method VARCHAR(10) NOT NULL, path VARCHAR(500) NOT NULL, query TEXT, headers TEXT, body LONGTEXT, response_status BIGINT, response_time BIGINT, ip VARCHAR(45), user_agent TEXT, created_at BIGINT NOT NULL, FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    await connection.query('CREATE TABLE IF NOT EXISTS responses (id VARCHAR(36) PRIMARY KEY, endpoint_id VARCHAR(36) NOT NULL, name VARCHAR(255), description TEXT, status_code BIGINT NOT NULL DEFAULT 200, headers TEXT, body LONGTEXT, body_template LONGTEXT, content_type VARCHAR(100) DEFAULT "application/json", match_rules TEXT, is_default TINYINT DEFAULT 0, priority BIGINT DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    await connection.query('CREATE TABLE IF NOT EXISTS ai_providers (id VARCHAR(36) PRIMARY KEY, name VARCHAR(255) NOT NULL, provider VARCHAR(30) NOT NULL, base_url VARCHAR(500), api_key TEXT NOT NULL, models TEXT NOT NULL, default_model VARCHAR(100), system_prompt LONGTEXT, is_active TINYINT NOT NULL DEFAULT 1, is_default TINYINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

    console.log('MySQL migration completed!');
    await connection.end();
  } catch (error) {
    console.error('Migration failed:', error);
    await connection.end();
    process.exit(1);
  }
}
