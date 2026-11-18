import { withCtx } from '@/lib/platform/route';
import { applyChangeset, discardChangeset, rollbackChangeset } from '@/lib/platform/changesets';
import { getRec } from '@/lib/platform/store';

export const GET = withCtx(async (ctx, _req, _body, params) => {
  const r = await getRec(ctx.tenantId, 'changeset', params.id);
  if (!r) throw new Error('No such change set.');
  return { id: r.id, title: r.title, created_at: r.created_at, ...r.data, snapshot: undefined };
});

/** { action: 'apply' | 'rollback' | 'discard' } */
export const POST = withCtx(async (ctx, _req, body, params) => {
  const action = String(body.action || '');
  const r = action === 'apply' ? await applyChangeset(ctx, params.id)
    : action === 'rollback' ? await rollbackChangeset(ctx, params.id)
    : action === 'discard' ? await discardChangeset(ctx, params.id)
    : null;
  if (!r) throw new Error('Action must be apply, rollback or discard.');
  return { id: r.id, status: r.data.status, refresh: r.data.ops.some((o: any) => o.type === 'form.replace') ? ['form'] : [] };
});
