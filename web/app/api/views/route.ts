import { withCtx } from '@/lib/platform/route';
import { listSaved, removeSaved, saveSaved } from '@/lib/platform/savedItems';

/** Saved views: shared ones and your own. */
export const GET = withCtx(async (ctx) => ({ items: await listSaved(ctx, 'view'), can_share: ctx.isManager }));

/** { id?, name, data } — create or update. */
export const POST = withCtx(async (ctx, _req, body) => saveSaved(ctx, 'view', body));

/** ?id= */
export const DELETE = withCtx(async (ctx, req) => removeSaved(ctx, 'view', new URL(req.url).searchParams.get('id') || ''));
