import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

try {
  // Use sqlite_master correctly
  const res = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
  console.log('Tables:', res.rows.map(r => r.name).join(', '));
  const hasRequests = res.rows.some(r => r.name === 'requests');
  console.log('Requests table exists:', hasRequests);
} catch (err) {
  console.error('Error:', err.message);
} finally {
  client.close();
}
