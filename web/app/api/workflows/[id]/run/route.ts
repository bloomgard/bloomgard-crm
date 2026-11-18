import { withCtx } from '@/lib/platform/route';
import { runWorkflowNow } from '@/lib/platform/workflows';

export const maxDuration = 60;

/**
 * POST (managers): run an automation now. `{ quote_id }` runs it on that quote (its conditions
 * still apply); without it, on every quote it matches today, at most 25. Emails still only reach
 * the OK list. Response: `{ runs, results: WorkflowRunData[] }`.
 */
export const POST = withCtx(async (ctx, _req, body, params) => {
  return runWorkflowNow(ctx.tenantId, params.id, { quoteId: body?.quote_id || null, actorEmail: ctx.email });
}, { managerOnly: true });
