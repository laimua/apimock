import { createClient } from '@libsql/client';

const db = createClient({ url: 'file:./local.db' });

async function main() {
  const result = await db.execute('SELECT * FROM projects LIMIT 1');
  console.log('Sample row:', result.rows[0]);
}
main();
