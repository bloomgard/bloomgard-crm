import { authenticate } from '@/lib/agent/core';
import { createQuoteFromAnalysis } from '@/lib/quoteFromEmail';

/**
 * One-click: turn an analysed inbound enquiry into a quotation, for the signed-in user's own
 * workspace. Body: { emailId?, analysis: { lead_gen_quote, summary } }. The workspace and the
 * owner come from the caller's token, never from the body.
 */
export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return Response.json({ error: 'Not signed in' }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  if (body?.tenantId && body.tenantId !== ctx.tenantId) return Response.json({ error: 'That is not your workspace.' }, { status: 403 });
  if (!body?.analysis?.lead_gen_quote) return Response.json({ error: 'Missing analysis.lead_gen_quote' }, { status: 400 });
  try {
    const out = await createQuoteFromAnalysis({ tenantId: ctx.tenantId, emailId: body.emailId || null, analysis: body.analysis, agentEmail: ctx.email });
    return Response.json(out);
  } catch (e: any) {
    console.error('quote-from-email error:', e);
    return Response.json({ error: e.message || 'Could not create the quote.' }, { status: 500 });
  }
}
