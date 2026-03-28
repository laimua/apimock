import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const sql = readFileSync(join(__dirname, 'add-requests-table.sql'), 'utf-8');

try {
  await client.execute(sql);
  console.log('Requests table created successfully!');
} catch (err) {
  console.error('Error creating requests table:', err);
  process.exit(1);
} finally {
  client.close();
}
