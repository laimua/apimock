/**
 * Next.js instrumentation hook
 * Runs once on server boot, before any request
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * 仅 Node.js runtime 执行（Edge runtime 不支持 fs / better-sqlite3）
 */

export async function register() {
  // Edge runtime early return（避免加载 fs / better-sqlite3 失败）
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startCleanup } = await import('./lib/rate-limit');
  startCleanup();

  // Auto-seed demo-project on first boot (production only)
  const { autoSeedIfNeeded } = await import('./lib/demo-seed');
  const { db } = await import('./lib/db');
  await autoSeedIfNeeded(db);
}
