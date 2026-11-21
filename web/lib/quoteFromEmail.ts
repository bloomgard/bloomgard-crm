import { createClient } from '@supabase/supabase-js';
import { nextQuoteNumber, settleQuoteNumber, todayIST } from '@/lib/quoteNumber';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const pick = (obj: any, keys: string[]) => {
  for (const k of keys) if (obj && obj[k] != null && obj[k] !== '') return obj[k];
  return '';
};


const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'nic']);
/** "buyer@mail.acme-steel.co.in" -> "Acme Steel". Returns '' when there is nothing sensible to show. */
function companyFromEmail(address: string): string {
  const m = String(address || '').match(/@([a-z0-9.-]+)/i);
  if (!m) return '';
  const labels = m[1].toLowerCase().split('.').filter(Boolean);
  if (labels.length < 2) return '';
  labels.pop(); // top-level domain
  if (labels.length > 1 && SECOND_LEVEL.has(labels[labels.length - 1]) ) labels.pop(); // co.in, com.au ...
  const name = labels[labels.length - 1] || '';
  if (['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'proton', 'rediffmail'].includes(name)) return '';
  return name.split(/[-_]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Deterministically fill a product row from the Master Data parent -> child
 * chain. Given any one known value in the chain (e.g. item_code), fills the
 * blank sibling fields (item_name, uom, item_rate, …) using parent_value_id.
 */
async function enrichRowsFromMasterData(tenantId: string, rows: any[]) {
  if (!rows.length) return rows;
  const { data: entries } = await supabase
    .from('master_data_entries')
    .select('id, key_name, parent_id')
    .eq('tenant_id', tenantId)
    .eq('tab_type', 'manual');
  if (!entries || entries.length === 0) return rows;

  const { data: values } = await supabase
    .from('master_data_values')
    .select('id, entry_id, value_text, parent_value_id')
    .in('entry_id', entries.map((e) => e.id));
  if (!values || values.length === 0) return rows;

  // Ordered chain of entries (root first).
  const byId = new Map(entries.map((e) => [e.id, e]));
  const roots = entries.filter((e) => !e.parent_id || !byId.has(e.parent_id));
  const chain: any[] = [];
  let node: any = roots[0];
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    chain.push(node);
    node = entries.find((e) => e.parent_id === node.id);
  }
  if (chain.length < 2) return rows;

  const valsByEntry = new Map<string, any[]>();
  values.forEach((v) => {
    if (!valsByEntry.has(v.entry_id)) valsByEntry.set(v.entry_id, []);
    valsByEntry.get(v.entry_id)!.push(v);
  });
  const norm = (s: any) => String(s || '').trim().toLowerCase();

  return rows.map((row) => {
    const out = { ...row };
    // Walk the chain from the root, narrowing the candidate values at each level by what the
    // row already says AND by the previous level's choice, so a repeated unit like "PCS" resolves
    // to the one that belongs to this product. Never guess: stop when the text is unknown.
    let prev: string[] | null = null;
    const chosen: any[] = [];
    for (let i = 0; i < chain.length; i++) {
      const key = chain[i].key_name;
      const levelVals = valsByEntry.get(chain[i].id) || [];
      const given = norm(out[key]);
      let cands: any[] = prev ? levelVals.filter((v: any) => prev!.includes(v.parent_value_id)) : levelVals;
      if (given) {
        const matches = cands.filter((v: any) => norm(v.value_text) === given);
        if (matches.length === 0) {
          if (prev) break;            // not under the chosen parent: do not guess further down
          chosen.push(null);          // unknown at the top: later levels may still anchor the row
          continue;
        }
        cands = matches;
      } else if (prev) {
        if (cands.length !== 1) break; // several options: leave it for a person
        out[key] = cands[0].value_text;
      } else {
        chosen.push(null);
        continue;
      }
      prev = cands.map((v: any) => v.id);
      chosen.push(cands.length === 1 ? cands[0] : null);
    }
    // Fill blank ancestors above the first level that resolved to a single value.
    const firstIdx = chosen.findIndex(Boolean);
    if (firstIdx > 0) {
      let cur = chosen[firstIdx];
      for (let i = firstIdx - 1; i >= 0 && cur?.parent_value_id; i--) {
        const parent = values.find((v: any) => v.id === cur.parent_value_id);
        if (!parent) break;
        if (!out[chain[i].key_name]) out[chain[i].key_name] = parent.value_text;
        cur = parent;
      }
    }
    return out;
  });
}

/**
 * Turn an analysed enquiry (an inbound email, a lead, an AI request, the public API) into a real
 * quotation: client upserted, next QN number, line items resolved against Master Data, a triage
 * thread when it came from an email, and quote.created emitted. Server only; the caller has
 * already established which workspace this is.
 */
export async function createQuoteFromAnalysis(o: { tenantId: string; emailId?: string | null; analysis: any; agentEmail?: string | null; source?: string }) {
  const { tenantId, emailId, analysis, agentEmail } = o;
  {
    if (!tenantId || !analysis?.lead_gen_quote) throw new Error('Missing tenantId or analysis.lead_gen_quote');

    const lgq: Record<string, any[]> = analysis.lead_gen_quote;
    const sections = Object.keys(lgq);
    const clientSection = sections.find((s) => /client|customer|contact/i.test(s));
    const productSection = sections.find((s) => /product|item|line/i.test(s));

    const clientRow = clientSection ? (lgq[clientSection]?.[0] || {}) : {};
    let productRows = productSection ? (lgq[productSection] || []) : [];
    productRows = await enrichRowsFromMasterData(tenantId, productRows);

    // Inbound email (for sender fallback + linking)
    let inbound: any = null;
    if (emailId) {
      ({ data: inbound } = await supabase.from('inbound_emails').select('*').eq('id', emailId).eq('tenant_id', tenantId).maybeSingle());
    }

    const clientEmail =
      pick(clientRow, ['email_id', 'email', 'email_address']) || inbound?.sender_email || '';

    // Company name: LLM extraction first, else derived from the sender's email domain
    // (mail.acme-steel.co.in -> "Acme Steel"), else the sender's display name, else a placeholder.
    const senderName = (inbound?.sender_email || '').match(/^"?([^"<]+?)"?\s*</)?.[1]?.trim();
    const companyName =
      pick(clientRow, ['client_name', 'company_name', 'customer_name']) ||
      companyFromEmail(clientEmail) ||
      senderName ||
      'Unknown Client';

    // Upsert client
    let clientId: string | null = null;
    const clientPayload = {
      tenant_id: tenantId,
      company_name: companyName,
      contact_person: pick(clientRow, ['contact_person', 'contact', 'person']) || senderName || '',
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

    // Next QN number for this tenant, allocated from every quote in it (see lib/quoteNumber.ts)
    const qn = await nextQuoteNumber(tenantId);

    const quoteId = crypto.randomUUID();

    const meta = {
      ...lgq,
      source: o.source || 'inbound_email',
      source_summary: analysis.summary || '',
      source_email_id: emailId || null,
    };

    const { error: qErr } = await supabase.from('quotations').insert([{
      id: quoteId,
      tenant_id: tenantId,
      client_id: clientId,
      qn_number: qn,
      date: todayIST(),
      status: 'Inquiry',
      custom_metadata: meta,
      created_by_email: agentEmail || 'system@bloomgard.co',
      follow_up_due_date: todayIST(3),
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

    // every way a quote is made from outside the form (AI, inbound email, the public API) passes here
    try {
      const { emit } = await import('@/lib/platform/events');
      await emit({ type: 'quote.created', tenantId, quoteId, actorEmail: agentEmail || null, data: { qn: qn, source: inbound ? 'email' : 'api' } });
    } catch { /* the quote exists; automations are best effort */ }

    // someone may have taken the same number a moment ago: keep numbers unique
    const settled = await settleQuoteNumber(tenantId, quoteId).catch(() => ({ qn }));
    return { success: true as const, quoteId, qn_number: settled.qn, itemCount: items.length };
  }
}
