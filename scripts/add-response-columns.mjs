/**
 * 添加响应配置列到 endpoints 表
 */

import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

try {
  // 检查列是否已存在
  const tableInfo = await client.execute("PRAGMA table_info(endpoints)");
  const columns = tableInfo.rows;
  const hasStatusCode = columns.some((col) => col.name === 'status_code');
  const hasContentType = columns.some((col) => col.name === 'content_type');
  const hasResponseBody = columns.some((col) => col.name === 'response_body');

  if (!hasStatusCode) {
    await client.execute('ALTER TABLE endpoints ADD COLUMN status_code INTEGER DEFAULT 200');
    console.log('✓ Added status_code column');
  } else {
    console.log('- status_code column already exists');
  }

  if (!hasContentType) {
    await client.execute('ALTER TABLE endpoints ADD COLUMN content_type TEXT DEFAULT "application/json"');
    console.log('✓ Added content_type column');
  } else {
    console.log('- content_type column already exists');
  }

  if (!hasResponseBody) {
    await client.execute('ALTER TABLE endpoints ADD COLUMN response_body TEXT');
    console.log('✓ Added response_body column');
  } else {
    console.log('- response_body column already exists');
  }

  console.log('\n✓ Migration completed successfully');
} catch (error) {
  console.error('✗ Migration failed:', error.message);
  process.exit(1);
}
