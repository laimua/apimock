import { success } from '@/lib/api';
import { getBudgetStatus } from '@/lib/ai-budget';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await getBudgetStatus();
  return success(status);
}
