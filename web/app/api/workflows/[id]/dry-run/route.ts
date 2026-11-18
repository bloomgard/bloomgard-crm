import { withCtx } from '@/lib/platform/route';
import { getRec } from '@/lib/platform/store';
import { dryRunWorkflow } from '@/lib/platform/workflows';
import type { WorkflowData } from '@/lib/platform/types';

export const maxDuration = 60;

/**
 * POST: what an automation would do today, with no side effects.
 * `/api/workflows/<id>/dry-run` tests a saved one; `/api/workflows/draft/dry-run` with
 * `{ workflow, name? }` tests one still in the builder. Optional `{ limit }` (max 25 samples).
 * Response: `{ scanned, matched, samples: [{ quote_id, qn, client, amount, status, days_quiet, steps: [{ action, outcome, detail }] }] }`.
 */
export const POST = withCtx(async (ctx, _req, body, params) => {
  let workflow: WorkflowData, name: string | undefined;
  if (params.id === 'draft') {
    if (!body?.workflow) throw new Error('Send the automation to test.');
    workflow = body.workflow; name = body.name;
  } else {
    const rec = await getRec<WorkflowData>(ctx.tenantId, 'workflow', params.id);
    if (!rec) throw new Error('No such automation.');
    workflow = rec.data; name = rec.title;
  }
  return dryRunWorkflow(ctx.tenantId, workflow, { limit: Number(body?.limit) || 10, name });
});
