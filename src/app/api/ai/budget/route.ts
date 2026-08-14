import { success, internalError } from '@/lib/api';
import { getBudgetStatus } from '@/lib/ai-budget';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getBudgetStatus();
    return success(status);
  } catch (err) {
    // B1:err.message 只进日志,对外固定 500 文案
    return internalError(err, 'GET /api/ai/budget');
  }
}
