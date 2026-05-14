import Database from 'better-sqlite3';
import { db } from '@/lib/db';

const sqlite = new Database(process.env.SQLITE_PATH || './data/apimock.db');

function checkTables() {
  const result = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").all();
  console.log('Tables in database:');
  result.forEach((row: any) => console.log(`  - ${row.name}`));

  // 检查 ai_providers 表是否存在
  const aiProvidersCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_providers';").all();
  if (aiProvidersCheck.length > 0) {
    console.log('\n✅ ai_providers table exists!');
  } else {
    console.log('\n❌ ai_providers table does NOT exist!');
  }
}

try {
  checkTables();
} catch (error) {
  console.error(error);
}