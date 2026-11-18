import { withCtx } from '@/lib/platform/route';
import { listRecs } from '@/lib/platform/store';
import type { WorkflowRunData } from '@/lib/platform/types';

/**
 * GET: the most recent automation runs, newest first (`?workflow_id=` for one automation,
 * `?limit=` up to 100). Agents see only runs on quotes they own, plus runs with no quote.
 * Response: `{ runs: [{ id, created_at, workflow_id, workflow_name, event, quote_id, qn, outcome, steps }] }`.
 */
export const GET = withCtx(async (ctx, req) => {
  const url = new URL(req.url);
  const workflowId = url.searchParams.get('workflow_id');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 100);
  const rows = await listRecs<WorkflowRunData>(ctx.tenantId, 'workflow_run', { match: workflowId ? { workflow_id: workflowId } : undefined, limit: ctx.isManager ? limit : 200 });
  let runs = rows.filter((r) => !r.data.dry_run);
  if (!ctx.isManager) {
    const { db } = await import('@/lib/agent/core');
    const ids = [...new Set(runs.map((r) => r.data.quote_id).filter(Boolean))] as string[];
    const { data } = ids.length ? await db.from('quotations').select('id').eq('tenant_id', ctx.tenantId).ilike('created_by_email', ctx.email).in('id', ids) : { data: [] as any[] };
    const mine = new Set((data || []).map((q: any) => q.id));
    runs = runs.filter((r) => !r.data.quote_id || mine.has(r.data.quote_id)).slice(0, limit);
  }
  return { runs: runs.map((r) => ({ id: r.id, created_at: r.created_at, ...r.data })) };
});
