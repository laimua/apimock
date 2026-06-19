#!/usr/bin/env tsx
/**
 * 手动 seed demo-project 脚本
 * 用法：pnpm tsx scripts/seed-demo.ts
 *
 * 幂等：demo-project 已存在则跳过
 */

import { db } from '../src/lib/db';
import { runSeed, DEMO_ENDPOINTS, DEMO_PROJECT_SLUG } from '../src/lib/demo-seed';

async function main() {
  console.log(`Seeding ${DEMO_PROJECT_SLUG} with ${DEMO_ENDPOINTS.length} endpoints...`);
  const result = await runSeed(db);
  if (result.seeded) {
    console.log('✓ Demo project seeded successfully');
    console.log('  Endpoints:');
    for (const ep of DEMO_ENDPOINTS) {
      console.log(`    ${ep.method} ${ep.path} - ${ep.name}`);
    }
  } else {
    console.log(`Skipped: ${result.reason}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
