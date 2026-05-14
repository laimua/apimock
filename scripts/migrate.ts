/**
 * 数据库迁移脚本
 * 使用 Drizzle ORM + SQLite
 */

import Database from 'better-sqlite3';

// ============================================
// 数据库连接
// ============================================
const sqlite = new Database(process.env.SQLITE_PATH || './data/apimock.db');

// ============================================
// 迁移函数
// ============================================
function migrate() {
  console.log('🔄 Starting database migration...');

  try {
    // 创建表（如果不存在）
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        base_path TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        settings TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    console.log('✅ projects table created');

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS endpoints (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        path TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'GET',
        name TEXT,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        delay_ms INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        status_code INTEGER DEFAULT 200,
        content_type TEXT DEFAULT 'application/json',
        response_body TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE(project_id, method, path)
      )
    `);
    console.log('✅ endpoints table created');

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        endpoint_id TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        query TEXT,
        headers TEXT,
        body TEXT,
        response_status INTEGER,
        response_time INTEGER,
        ip TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ requests table created');

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS responses (
        id TEXT PRIMARY KEY,
        endpoint_id TEXT NOT NULL,
        name TEXT,
        description TEXT,
        status_code INTEGER NOT NULL DEFAULT 200,
        headers TEXT DEFAULT '{}',
        body TEXT,
        body_template TEXT,
        content_type TEXT DEFAULT 'application/json',
        match_rules TEXT DEFAULT '{}',
        is_default INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ responses table created');

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS ai_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        base_url TEXT,
        api_key TEXT NOT NULL,
        models TEXT NOT NULL,
        default_model TEXT,
        system_prompt TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    console.log('✅ ai_providers table created');

    // 创建索引
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS endpoints_lookup_idx ON endpoints(project_id, method, path)
    `);
    console.log('✅ indexes created');

    console.log('🎉 Migration completed successfully!');
    sqlite.close();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    sqlite.close();
    process.exit(1);
  }
}

// 运行迁移
migrate();