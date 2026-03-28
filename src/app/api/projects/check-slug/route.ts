/**
 * Slug 唯一性检查 API
 * GET /api/projects/check-slug?slug=xxx
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';

// ============================================
// Schema
// ============================================
const CheckSlugSchema = z.object({
  slug: z.string().min(1).max(255),
});

// ============================================
// GET /api/projects/check-slug
// ============================================
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');

    if (!slug) {
      return Errors.badRequest('slug parameter is required');
    }

    // 验证 slug 格式
    const validated = CheckSlugSchema.parse({ slug });

    // 检查 slug 是否已存在
    const db = getDb();
    const existingProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.slug, validated.slug));

    const isAvailable = existingProjects.length === 0;

    return success({
      slug: validated.slug,
      available: isAvailable,
    });
  } catch (err: any) {
    console.error('Check slug API error:', err);
    if (err.name === 'ZodError') {
      return Errors.validation(err.issues);
    }
    return Errors.internal(err.message || String(err));
  }
}
