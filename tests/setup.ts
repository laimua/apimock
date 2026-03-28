/**
 * Test database setup
 * Uses in-memory database for testing
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '@/lib/schema';
import { randomUUID } from 'crypto';

/**
 * Get or create test database connection
 * Uses in-memory database with a unique name for each test file
 */
export function getTestDb(dbName?: string) {
  const name = dbName || randomUUID();
  const client = createClient({
    url: `file:memory-${name}.db`,
  });

  return drizzle(client, { schema });
}

/**
 * Setup test database with migrations
 */
export async function setupTestDb(dbName?: string) {
  const db = getTestDb(dbName);

  // Drop tables first to ensure clean schema
  await db.run('DROP TABLE IF EXISTS ai_providers');
  await db.run('DROP TABLE IF EXISTS requests');
  await db.run('DROP TABLE IF EXISTS responses');
  await db.run('DROP TABLE IF EXISTS endpoints');
  await db.run('DROP TABLE IF EXISTS projects');

  // Create tables with updated schema
  await db.run(`
    CREATE TABLE projects (
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

  await db.run(`
    CREATE TABLE endpoints (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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
      UNIQUE(project_id, method, path)
    )
  `);

  await db.run(`
    CREATE TABLE requests (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      query TEXT,
      headers TEXT,
      body TEXT,
      response_status INTEGER,
      response_time INTEGER,
      ip TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE responses (
      id TEXT PRIMARY KEY,
      endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
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
      updated_at INTEGER NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE ai_providers (
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

  return db;
}

/**
 * Clear all tables in test database
 */
export async function clearTestDb(db: ReturnType<typeof getTestDb>) {
  await db.run('DELETE FROM ai_providers');
  await db.run('DELETE FROM responses');
  await db.run('DELETE FROM endpoints');
  await db.run('DELETE FROM projects');
}

// Export types
export type TestDb = ReturnType<typeof getTestDb>;
