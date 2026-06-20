/**
 * Prometheus metrics endpoint
 * GET /api/metrics
 *
 * 头：Authorization: Bearer <METRICS_TOKEN>
 * 或 ?token=<METRICS_TOKEN>（不推荐，会进 access log）
 *
 * 不带 token 返 401。空 METRICS_TOKEN 环境变量时返 503（避免无 token 暴露）。
 */

import { NextResponse } from 'next/server';
import { metricsOutput } from '@/lib/metrics';
import { logger } from '@/lib/logger';

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
  const url = new URL(request.url);
  const gotQuery = url.searchParams.get('token');

  if (gotHeader !== expected && gotQuery !== expected) {
    logger.warn({ ip: request.headers.get('x-forwarded-for') }, 'metrics unauthorized');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await metricsOutput();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': registerContentType(),
      'Cache-Control': 'no-store',
    },
  });
}

function registerContentType(): string {
  return 'text/plain; version=0.0.4; charset=utf-8';
}
