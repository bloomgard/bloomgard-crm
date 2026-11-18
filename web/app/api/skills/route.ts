import { withCtx } from '@/lib/platform/route';
import { listSaved, removeSaved, saveSaved } from '@/lib/platform/savedItems';

/** Saved skills: shared ones and your own. */
export const GET = withCtx(async (ctx) => ({ items: await listSaved(ctx, 'skill'), can_share: ctx.isManager }));

/** { id?, name, data } — create or update. */
export const POST = withCtx(async (ctx, _req, body) => saveSaved(ctx, 'skill', body));

/** ?id= */
export const DELETE = withCtx(async (ctx, req) => removeSaved(ctx, 'skill', new URL(req.url).searchParams.get('id') || ''));
