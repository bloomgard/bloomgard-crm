import { db } from '@/lib/agent/core';
import { findTenantByInboundToken } from '@/lib/platform/plugins';

export const maxDuration = 30;

/**
 * Inbound API: a website enquiry form or another system creates a quote in a workspace.
 *   POST /api/public/quotes
 *   Authorization: Bearer <token from Settings → Plugins → Inbound API>
 *   { client_name, client_email?, contact_person?, phone?, message?, items?: [{ item_code?, item_name?, quantity? }] }
 * → 200 { qn_number, quote_id }. Items are matched to the catalogue the same way an enquiry email is.
 */
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const hits = new Map<string, number[]>();   // per-token request times, for a simple 30-per-minute limit

function limited(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 30;
}

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const str = (v: any, max = 300) => String(v ?? '').trim().slice(0, max);

export async function POST(request: Request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const tenantId = await findTenantByInboundToken(token);
  if (!tenantId) return bad('Invalid or disabled API token.', 401);
  if (limited(token)) return bad('Too many requests. Try again in a minute.', 429);

  let body: any;
  try { body = await request.json(); } catch { return bad('Send a JSON body.'); }
  const client_name = str(body?.client_name, 200);
  if (!client_name) return bad('client_name is required.');
  const client_email = str(body?.client_email, 200);
  if (client_email && !EMAIL_RE.test(client_email)) return bad(`"${client_email}" is not a valid email address.`);
  if (body.items != null && !Array.isArray(body.items)) return bad('items must be a list.');
  const items = (body.items || []).slice(0, 100).map((i: any) => ({
    item_code: str(i?.item_code, 100), item_name: str(i?.item_name, 200), quantity: Number(i?.quantity) || 0,
  })).filter((i: any) => i.item_code || i.item_name);
  const message = str(body?.message, 4000);

  const analysis = {
    summary: message ? `Enquiry received through the Inbound API: ${message.slice(0, 500)}` : 'Enquiry received through the Inbound API.',
    lead_gen_quote: {
      'Client Information': [{ client_name, email_id: client_email, contact_person: str(body?.contact_person, 200), phone_number: str(body?.phone, 50) }],
      Products: items,
    },
  };

  const { POST: createFromEnquiry } = await import('@/app/api/quote-from-email/route');
  const res = await createFromEnquiry(new Request('http://internal/quote-from-email', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId, analysis, agentEmail: 'api@bloomgard.co' }),
  }));
  const out = await res.json();
  if (!res.ok || !out?.quoteId) return bad(out?.error || 'Could not create the quote.', 500);

  // record where it came from (the enquiry route labels everything as an inbound email)
  const { data: q } = await db.from('quotations').select('custom_metadata').eq('id', out.quoteId).eq('tenant_id', tenantId).single();
  await db.from('quotations').update({ custom_metadata: { ...(q?.custom_metadata || {}), source: 'inbound_api', source_message: message || null } }).eq('id', out.quoteId).eq('tenant_id', tenantId);
  await db.from('status_logs').update({ comments: 'Quote created from the Inbound API.' })
    .eq('quotation_id', out.quoteId).like('comments', 'Quote auto-created from inbound email%');

  // quote.created is emitted by the enquiry route itself, once
  return Response.json({ qn_number: out.qn_number, quote_id: out.quoteId, items: out.itemCount });
}
