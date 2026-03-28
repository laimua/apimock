import { createClient } from '@libsql/client';

const db = createClient({ url: 'file:./local.db' });

async function main() {
  try {
    const result = await db.execute(
      `INSERT INTO projects (id, name, slug, description, base_path, is_active, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['test-id-456', 'Test Project 2', 'test-project-2', 'Test description', null, 1, '{}', Date.now(), Date.now()]
    );
    console.log('Insert result:', result);
    console.log('Last insert rowid:', result.lastInsertRowid);
  } catch (error) {
    console.error('Insert error:', error);
  }
}
main();
