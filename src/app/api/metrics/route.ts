/**
 * Prometheus metrics endpoint
 * GET /api/metrics
 *
 * 仅支持头鉴权：Authorization: Bearer <METRICS_TOKEN>
 * 不接受 ?token= query 参数鉴权 —— query 会进入反代 access log / 浏览器历史 /
 * Referer 头，存在泄露风险。
 *
 * 不带 token 返 401。空 METRICS_TOKEN 环境变量时返 503（避免无 token 暴露）。
 */

import { NextResponse } from 'next/server';
import { metricsOutput, register } from '@/lib/metrics';
import { logger } from '@/lib/logger';
import { safeEqual } from '@/lib/crypto-utils';
import { Errors } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) {
    logger.warn('METRICS_TOKEN not set, metrics endpoint disabled');
    return NextResponse.json(
      { success: false, error: 'METRICS_TOKEN not configured' },
      { status: 503 }
    );
  }

  const bearer = request.headers.get('authorization');
  const gotHeader = bearer?.startsWith('Bearer ') ? bearer.slice(7) : null;

  if (!gotHeader || !safeEqual(gotHeader, expected)) {
    logger.warn({ ip: request.headers.get('x-forwarded-for') }, 'metrics unauthorized');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: string;
  try {
    body = await metricsOutput();
  } catch (err) {
    logger.error({ err }, 'metrics output failed');
    return Errors.internal('Failed to render metrics');
  }
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': register.contentType,
      'Cache-Control': 'no-store',
    },
  });
}
