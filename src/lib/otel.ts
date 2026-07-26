/**
 * OpenTelemetry APM 初始化
 *
 * 仅当 OTEL_EXPORTER_OTLP_ENDPOINT 配置时启用。否则 SDK 不启动，零开销。
 *
 * 自动 instrument:
 *   - http / https（in/out）
 *   - next.js（App Router）
 *   - better-sqlite3 / mysql2 / ioredis
 *   - undici（fetch）
 *   - process / runtime metrics
 *
 * 关键 span 已通过 auto-instrumentation 覆盖。无需手动 span。
 *
 * 配置：
 *   OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io/...  启用
 *   OTEL_SERVICE_NAME=apimock                                 默认
 *   OTEL_EXPORTER_OTLP_HEADERS=...                            鉴权头
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { logger } from './logger';

let started: NodeSDK | null = null;

export function startOtelIfConfigured(): void {
  if (started) return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    // 未配置 = 不启用，零开销
    return;
  }

  // P2-35: 任何构造/启动错误（坏 OTLP URL、缺鉴权头、NodeSDK 内部抛错）
  // 不向上冒泡，降级为 "OTel 禁用 + error log"，不阻断进程启动。
  try {
    const exporter = new OTLPTraceExporter({
      url: endpoint,
      headers: parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
    });

    const sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME || 'apimock',
      traceExporter: exporter,
      instrumentations: [
        // 自动 instrument。disable fs（ noisy）+ dns（ per-request 太碎）
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    });

    sdk.start();
    started = sdk;
    logger.info({ endpoint, serviceName: process.env.OTEL_SERVICE_NAME || 'apimock' }, 'OTel SDK started');

    // 优雅关闭
    process.on('SIGTERM', () => {
      sdk.shutdown().catch((err) => logger.error({ err }, 'OTel shutdown failed'));
    });
  } catch (err) {
    logger.error({ err, endpoint }, 'OTel startup failed, continuing with OTel disabled');
  }
}

function parseHeaders(raw?: string): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const [k, v] = pair.split('=').map((s) => s.trim());
    if (k && v) out[k] = v;
  }
  return out;
}
