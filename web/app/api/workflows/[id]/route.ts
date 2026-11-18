import { withCtx } from '@/lib/platform/route';
import { deleteRec, getRec, replaceRec } from '@/lib/platform/store';
import { validateWorkflow, validationEnv } from '@/lib/platform/workflows';
import { describeWorkflow } from '@/lib/platform/workflowTemplates';
import type { WorkflowData } from '@/lib/platform/types';

const shape = (r: any) => ({ id: r.id, name: r.title, created_at: r.created_at, ...r.data, sentence: describeWorkflow(r.data) });

/** GET one automation. */
export const GET = withCtx(async (ctx, _req, _body, params) => {
  const rec = await getRec<WorkflowData>(ctx.tenantId, 'workflow', params.id);
  if (!rec) throw new Error('No such automation.');
  return { workflow: shape(rec) };
});

/**
 * PATCH (managers): `{ enabled }` to switch it on or off, `{ name }` to rename, `{ workflow }` to
 * replace its trigger, conditions and steps. Run counts and its author are kept.
 */
export const PATCH = withCtx(async (ctx, _req, body, params) => {
  const rec = await getRec<WorkflowData>(ctx.tenantId, 'workflow', params.id);
  if (!rec) throw new Error('No such automation.');
  const cur = rec.data;
  let next: WorkflowData = { ...cur };
  if (body?.workflow) {
    next = validateWorkflow({ ...body.workflow, enabled: body.workflow.enabled ?? cur.enabled, created_by: cur.created_by, source: cur.source, runs: cur.runs, last_run_at: cur.last_run_at }, await validationEnv(ctx.tenantId));
  }
  if (typeof body?.enabled === 'boolean') next.enabled = body.enabled;
  next.updated_at = new Date().toISOString();
  const name = body?.name != null ? String(body.name).trim().slice(0, 120) : undefined;
  if (name === '') throw new Error('Give the automation a name.');
  await replaceRec<WorkflowData>(ctx.tenantId, 'workflow', rec.id, next, name);
  return { workflow: shape({ ...rec, title: name ?? rec.title, data: next }) };
}, { managerOnly: true });

/** DELETE (managers). Its run history is kept. */
export const DELETE = withCtx(async (ctx, _req, _body, params) => {
  const rec = await getRec<WorkflowData>(ctx.tenantId, 'workflow', params.id);
  if (!rec) throw new Error('No such automation.');
  await deleteRec(ctx.tenantId, 'workflow', rec.id);
  return { ok: true };
}, { managerOnly: true });
