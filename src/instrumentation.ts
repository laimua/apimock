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

  // OTel 必须最先启动（在其它模块 import 之前 patch HTTP/DB driver）
  // P2-35: OTLP 配置错误（坏 URL / 构造 exporter 抛错）不能让整个启动失败，
  // 降级为 "OTel 禁用 + error log"，其余功能继续起。
  try {
    const { startOtelIfConfigured } = await import('./lib/otel');
    startOtelIfConfigured();
  } catch (err) {
    const { logger } = await import('./lib/logger');
    logger.error({ err }, 'OTel startup failed, continuing with OTel disabled');
  }

  const { startCleanup } = await import('./lib/rate-limit');
  startCleanup();

  // 启动请求记录保留策略清理（每 10 分钟跑一次，每端点保留最近 N 条）
  const { startRequestRetention } = await import('./lib/request-retention');
  startRequestRetention();

  // Auto-seed demo-project on first boot (production only)
  const { autoSeedIfNeeded } = await import('./lib/demo-seed');
  const { db } = await import('./lib/db');
  await autoSeedIfNeeded(db);
}
