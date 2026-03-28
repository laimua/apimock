import { createClient } from '@libsql/client';
import { db } from '@/lib/db';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function checkTables() {
  const result = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
  console.log('Tables in database:');
  result.rows.forEach((row: any) => console.log(`  - ${row.name}`));

  // 检查 ai_providers 表是否存在
  const aiProvidersCheck = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_providers';");
  if (aiProvidersCheck.rows.length > 0) {
    console.log('\n✅ ai_providers table exists!');
  } else {
    console.log('\n❌ ai_providers table does NOT exist!');
  }
}

checkTables().catch(console.error);
