/**
 * Share API Route
 * 获取公开的项目信息和端点列表（无需认证）
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, endpoints } from '@/lib/schema';
import { eq, asc, and } from 'drizzle-orm';
import { Errors } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // 查询项目
    const projectList = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        description: projects.description,
      })
      .from(projects)
      .where(and(eq(projects.slug, slug), eq(projects.isActive, 1)));

    if (projectList.length === 0) {
      return Errors.notFound('Project');
    }

    const project = projectList[0];

    // 查询端点列表（包含详细信息用于展示），仅返回在分享页可见的端点
    const endpointList = await db
      .select({
        id: endpoints.id,
        method: endpoints.method,
        path: endpoints.path,
        name: endpoints.name,
        description: endpoints.description,
        statusCode: endpoints.statusCode,
        contentType: endpoints.contentType,
        delayMs: endpoints.delayMs,
        tags: endpoints.tags,
        responseBody: endpoints.responseBody,
      })
      .from(endpoints)
      .where(and(eq(endpoints.projectId, project.id), eq(endpoints.isShareable, 1), eq(endpoints.isActive, 1)))
      .orderBy(asc(endpoints.method), asc(endpoints.path));

    // 构建基础 URL
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}/${project.slug}`;

    // 返回公开数据（不包含敏感信息）
    return NextResponse.json({
      project: {
        name: project.name,
        slug: project.slug,
        description: project.description,
      },
      endpoints: endpointList,
      baseUrl,
    });
  } catch (error) {
    console.error('Share API error:', error);
    return Errors.internal();
  }
}
