/**
 * Health check endpoint
 * GET /api/health → 200 { status: 'ok', timestamp }
 *
 * Used by Railway healthcheck + uptime monitoring
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
