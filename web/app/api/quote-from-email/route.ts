import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const pick = (obj: any, keys: string[]) => {
  for (const k of keys) if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  return '';
};

/**
 * One-click: turn an analysed inbound inquiry email into a real quotation.
 * Body: { tenantId, emailId?, analysis: { lead_gen_quote, summary }, agentEmail? }
 */
export async function POST(request: Request) {
  try {
    const { tenantId, emailId, analysis, agentEmail } = await request.json();
    if (!tenantId || !analysis?.lead_gen_quote) {
      return NextResponse.json({ error: 'Missing tenantId or analysis.lead_gen_quote' }, { status: 400 });
    }

    const lgq: Record<string, any[]> = analysis.lead_gen_quote;
    const sections = Object.keys(lgq);
    const clientSection = sections.find((s) => /client|customer|contact/i.test(s));
    const productSection = sections.find((s) => /product|item|line/i.test(s));

    const clientRow = clientSection ? (lgq[clientSection]?.[0] || {}) : {};
    const productRows = productSection ? (lgq[productSection] || []) : [];

    // Inbound email (for sender fallback + linking)
    let inbound: any = null;
    if (emailId) {
      ({ data: inbound } = await supabase.from('inbound_emails').select('*').eq('id', emailId).single());
    }

    const companyName = pick(clientRow, ['client_name', 'company_name', 'customer_name']) || 'Unknown Client';
    const clientEmail =
      pick(clientRow, ['email_id', 'email', 'email_address']) || inbound?.sender_email || '';

    // Upsert client
    let clientId: string | null = null;
    const clientPayload = {
      tenant_id: tenantId,
      company_name: companyName,
      contact_person: pick(clientRow, ['contact_person', 'contact', 'person']),
      email_id: clientEmail,
      phone_number: pick(clientRow, ['phone_number', 'phone', 'mobile']),
      billing_address: pick(clientRow, ['billing_address', 'address']),
      source_ref: 'Inbound Email',
    };
    const { data: existingClient } = await supabase
      .from('clients').select('id').eq('tenant_id', tenantId).eq('company_name', companyName).maybeSingle();
    if (existingClient) {
      clientId = existingClient.id;
      await supabase.from('clients').update(clientPayload).eq('id', clientId);
    } else {
      const { data: nc } = await supabase.from('clients').insert([clientPayload]).select('id').single();
      clientId = nc?.id || null;
    }

    // Next QN number for this tenant
    const { data: existingQuotes } = await supabase
      .from('quotations').select('qn_number').eq('tenant_id', tenantId);
    let maxNum = 0;
    (existingQuotes || []).forEach((q) => {
      const m = q.qn_number?.match(/QN-\d+-(\d+)/i);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    const qn = `QN-${new Date().getFullYear()}-${(maxNum + 1).toString().padStart(3, '0')}`;

    const quoteId = crypto.randomUUID();
    const followUp = new Date();
    followUp.setDate(followUp.getDate() + 3);

    const meta = {
      ...lgq,
      source: 'inbound_email',
      source_summary: analysis.summary || '',
      source_email_id: emailId || null,
    };

    const { error: qErr } = await supabase.from('quotations').insert([{
      id: quoteId,
      tenant_id: tenantId,
      client_id: clientId,
      qn_number: qn,
      date: new Date().toISOString().split('T')[0],
      status: 'Inquiry',
      custom_metadata: meta,
      created_by_email: agentEmail || 'system@bloomgard.co',
      follow_up_due_date: followUp.toISOString().split('T')[0],
    }]);
    if (qErr) throw qErr;

    // Product line items
    const items = productRows
      .map((row: any, i: number) => ({
        quotation_id: quoteId,
        tenant_id: tenantId,
        display_order: i,
        item_name: pick(row, ['item_name', 'name', 'product', 'description']) || `Item ${i + 1}`,
        item_code: pick(row, ['item_code', 'code', 'hsn', 'sku']),
        quantity: Number(pick(row, ['quantity', 'qty']) || 0),
        uom: pick(row, ['uom', 'unit']),
        item_rate: Number(pick(row, ['item_rate', 'rate', 'price']) || 0),
        item_br: Number(pick(row, ['item_br', 'amount', 'line_total']) || 0),
        custom_metadata: row,
      }))
      .filter((it: any) => it.item_name || it.item_code);
    if (items.length) await supabase.from('quotation_items').insert(items);

    // Link the source email to a triage thread
    if (emailId && inbound) {
      await supabase.from('email_threads').insert({
        tenant_id: tenantId,
        quote_id: quoteId,
        triage_status: 'incoming',
        last_updated: new Date().toISOString(),
      });
    }

    await supabase.from('status_logs').insert([{
      quotation_id: quoteId,
      old_status: 'Inquiry',
      new_status: 'Inquiry',
      comments: `Quote auto-created from inbound email${inbound?.sender_email ? ` (${inbound.sender_email})` : ''}.`,
    }]);

    return NextResponse.json({ success: true, quoteId, qn_number: qn, itemCount: items.length });
  } catch (error: any) {
    console.error('quote-from-email error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
