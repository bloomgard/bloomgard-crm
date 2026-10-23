import type { APIRequestContext } from '@playwright/test';
import { admin, Actor, Cleanup } from './db';
import { ENV, protectionHeaders, DUMMY_RECIPIENT } from './env';

let qnCounter = 0;
const nextQn = () => `QN-9999-${String(++qnCounter + Math.floor(Math.random() * 40)).padStart(3, '0')}`;

export type TestQuote = { id: string; qn: string; clientId: string; clientEmail: string };

/**
 * A throwaway quotation (+ client, + optional line items) owned by the E2E user.
 * Numbered QN-9999-xxx so it can never collide with, or be mistaken for, a real quote.
 */
export async function makeQuote(
  actor: Actor, cleanup: Cleanup, tag: string,
  o: {
    clientEmail?: string; status?: string; daysQuiet?: number; withThread?: 'incoming' | 'outgoing';
    items?: Array<{ item_code: string; item_name: string; quantity: number; uom: string; item_rate: number }>;
  } = {}
): Promise<TestQuote> {
  const db = admin();
  const clientEmail = o.clientEmail || DUMMY_RECIPIENT;
  const qn = nextQn();
  const quoteId = crypto.randomUUID();
  const when = new Date(Date.now() - (o.daysQuiet ?? 0) * 86400000).toISOString();

  const { data: client, error: cErr } = await db.from('clients').insert({
    tenant_id: actor.tenantId, company_name: `E2E Co ${tag}`, contact_person: 'E2E Contact',
    email_id: clientEmail, source_ref: 'e2e',
  }).select('id').single();
  if (cErr) throw new Error(`client fixture: ${cErr.message}`);

  const { error: qErr } = await db.from('quotations').insert({
    id: quoteId, tenant_id: actor.tenantId, client_id: client.id, qn_number: qn,
    date: when.slice(0, 10), status: o.status || 'Inquiry', created_by_email: actor.email,
    created_at: when, last_contact_date: when,
    custom_metadata: { 'Client Information': { client_name: `E2E Co ${tag}`, email_id: clientEmail } },
  });
  if (qErr) throw new Error(`quote fixture: ${qErr.message}`);

  cleanup.add(async () => {
    await db.from('status_logs').delete().eq('quotation_id', quoteId);
    await db.from('email_threads').delete().eq('quote_id', quoteId);
    await db.from('quotation_items').delete().eq('quotation_id', quoteId);
    await db.from('quotations').delete().eq('id', quoteId);
    await db.from('clients').delete().eq('id', client.id);
  });

  if (o.items?.length) {
    await db.from('quotation_items').insert(
      o.items.map((it, i) => ({ ...it, quotation_id: quoteId, tenant_id: actor.tenantId, display_order: i }))
    );
  }
  if (o.withThread) {
    await db.from('email_threads').insert({
      tenant_id: actor.tenantId, quote_id: quoteId, agent_id: actor.userId,
      triage_status: o.withThread, last_updated: new Date().toISOString(),
    });
  }
  return { id: quoteId, qn, clientId: client.id, clientEmail };
}

/** Catalogue rows (code, name, unit, rate) loaded through the real bulkImport endpoint, removed afterwards. */
export async function seedCatalogue(
  request: APIRequestContext, actor: Actor, cleanup: Cleanup,
  rows: Array<[string, string, string, string]>
) {
  const res = await request.post(`${ENV.baseUrl}/api/master-data`, {
    headers: protectionHeaders(),
    data: {
      action: 'bulkImport',
      payload: {
        tenant_id: actor.tenantId, tab_type: 'manual',
        columns: [{ key_name: 'item_code' }, { key_name: 'item_name' }, { key_name: 'uom' }, { key_name: 'item_rate' }],
        rows,
      },
    },
  });
  if (!res.ok()) throw new Error(`seedCatalogue failed: ${res.status()} ${await res.text()}`);
  // Deleting a root value cascades to its linked child values (parent_value_id ON DELETE CASCADE).
  const codes = rows.map((r) => r[0]);
  cleanup.add(async () => {
    const { data: entries } = await admin().from('master_data_entries').select('id')
      .eq('tenant_id', actor.tenantId).eq('key_name', 'item_code');
    if (entries?.length) await admin().from('master_data_values').delete()
      .in('entry_id', entries.map((e) => e.id)).in('value_text', codes);
  });
}

/** Remember a profile's current values and restore them afterwards. */
export async function snapshotProfile(actor: Actor, cleanup: Cleanup) {
  const { data } = await admin().from('profiles').select('full_name, job_title, phone, signature, inbound_email')
    .eq('id', actor.userId).single();
  cleanup.add(async () => admin().from('profiles').update(data!).eq('id', actor.userId));
  return data!;
}

/** Snapshot an email_threads row for a quote (if any) so we can put it back. */
export async function snapshotThreads(actor: Actor, cleanup: Cleanup) {
  const { data } = await admin().from('email_threads').select('*').eq('tenant_id', actor.tenantId);
  const before = new Map((data || []).map((t) => [t.id, t]));
  cleanup.add(async () => {
    const { data: now } = await admin().from('email_threads').select('id').eq('tenant_id', actor.tenantId);
    for (const t of now || []) {
      const orig = before.get(t.id);
      if (orig) await admin().from('email_threads').update({
        triage_status: orig.triage_status, ai_draft_text: orig.ai_draft_text, last_updated: orig.last_updated, agent_id: orig.agent_id,
      }).eq('id', t.id);
    }
  });
}

/** Remove fixtures left behind by a crashed earlier run, so numbering and inboxes stay clean. */
export async function purgeLeftovers(actor: Actor) {
  const db = admin();
  const { data: qs } = await db.from('quotations').select('id, client_id').eq('tenant_id', actor.tenantId).like('qn_number', 'QN-9999-%');
  const ids = (qs || []).map((q) => q.id);
  if (ids.length) {
    await db.from('status_logs').delete().in('quotation_id', ids);
    await db.from('email_threads').delete().in('quote_id', ids);
    await db.from('quotation_items').delete().in('quotation_id', ids);
    await db.from('quotations').delete().in('id', ids);
  }
  await db.from('clients').delete().eq('tenant_id', actor.tenantId).like('company_name', 'E2E Co %');
  await db.from('inbound_emails').delete().eq('tenant_id', actor.tenantId).like('sender_email', '%@e2e-%.test');
}
