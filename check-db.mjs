import { createClient } from '@libsql/client';

const db = createClient({ url: 'file:./local.db' });

async function main() {
  const result = await db.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'projects'");
  console.log('Projects table schema:');
  console.log(result.rows[0]);
  
  const columns = await db.execute("PRAGMA table_info(projects)");
  console.log('\nProjects columns:');
  console.log(columns.rows);
}

main().catch(console.error);
