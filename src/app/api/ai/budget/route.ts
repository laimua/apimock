import { success, Errors } from '@/lib/api';
import { getBudgetStatus } from '@/lib/ai-budget';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getBudgetStatus();
    return success(status);
  } catch (err) {
    return Errors.internal(err instanceof Error ? err.message : 'Unknown error');
  }
}
