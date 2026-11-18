import { withCtx } from '@/lib/platform/route';
import { convertLead, getLead, replyToLead, updateLead } from '@/lib/platform/leads';

export const maxDuration = 60;
const shape = (r: any) => ({ id: r.id, title: r.title, created_at: r.created_at, ...r.data });

export const GET = withCtx(async (ctx, _req, _body, params) => ({ lead: shape(await getLead(ctx, params.id)) }));

/** { status?, owner_email?, notes?, requirements?, reply_draft?, discarded_reason?, contact? } */
export const PATCH = withCtx(async (ctx, _req, body, params) => ({ lead: shape(await updateLead(ctx, params.id, body)) }));

/** { action: 'convert' } makes the quotation; { action: 'reply', subject?, body? } sends the reply. */
export const POST = withCtx(async (ctx, _req, body, params) => {
  if (body.action === 'convert') return convertLead(ctx, params.id);
  if (body.action === 'reply') return replyToLead(ctx, params.id, { subject: body.subject, body: body.body });
  throw new Error('Action must be convert or reply.');
});
