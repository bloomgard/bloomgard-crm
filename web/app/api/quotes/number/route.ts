import { callerTenant, nextQuoteNumber, settleQuoteNumber, todayIST } from '@/lib/quoteNumber';

/**
 * POST { action: 'next' }                 → { qn, today }   the next free quote number
 * POST { action: 'settle', quote_id }     → { qn, renumbered, was? }   after saving: fix a clash
 * The workspace comes from the caller's sign-in, never from the body.
 */
export async function POST(request: Request) {
  const tenantId = await callerTenant(request);
  if (!tenantId) return Response.json({ error: 'Not signed in' }, { status: 401 });
  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  try {
    if (body.action === 'settle') return Response.json(await settleQuoteNumber(tenantId, String(body.quote_id || '')));
    return Response.json({ qn: await nextQuoteNumber(tenantId), today: todayIST() });
  } catch (e: any) {
    return Response.json({ error: e.message || 'Could not number the quote.' }, { status: 400 });
  }
}
