import { withCtx } from '@/lib/platform/route';
import { addComment, listComments, quoteForCtx } from '@/lib/platform/comments';

/** Team notes on a quote: internal, never sent to the client. GET ?quote_id */
export const GET = withCtx(async (ctx, req) => {
  const quoteId = new URL(req.url).searchParams.get('quote_id') || '';
  const quote = await quoteForCtx(ctx, quoteId);
  if (!quote) throw new Error('No such quote.');
  return { notes: await listComments(ctx.tenantId, quote.id) };
});

/** Add a note: { quote_id, body }. @mentions notify the people named. */
export const POST = withCtx(async (ctx, _req, body) => {
  const quote = await quoteForCtx(ctx, body?.quote_id);
  if (!quote) throw new Error('No such quote.');
  const note = await addComment(ctx.tenantId, {
    quote_id: quote.id, body: body?.body, author_id: ctx.userId, author_email: ctx.email,
    author_name: ctx.profile?.full_name || null, qn: quote.qn_number,
  });
  return { note };
});
