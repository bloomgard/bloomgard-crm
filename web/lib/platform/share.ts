import crypto from 'crypto';
import { db, AgentCtx, metaPlan, quoteValue, clientName } from '@/lib/agent/core';
import { mirrorStatusIntoMetadata } from '@/lib/statusLog';
import { createRec, deleteRec, listRecs, updateRec } from './store';
import { notify } from './notify';
import type { Rec } from './types';

/**
 * A quote the client can open in a browser: no login, no attachment to download. They see the
 * quote, and can Accept it or ask for changes. Opening, accepting and asking are written to the
 * Status Log, the owner is told, and automations hear about it.
 *
 * The link carries a random token; only its SHA-256 is stored, so the database alone cannot be
 * used to rebuild a link. One live link per quote: making a new one retires the old.
 */
export type ShareData = {
  quote_id: string;
  qn: string;
  token_hash: string;
  created_by: string;
  views: number;
  first_viewed_at?: string | null;
  last_viewed_at?: string | null;
  response?: { action: 'accept' | 'changes'; name: string; note?: string; at: string } | null;
};

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const ACCEPT_STAGE = /^(approved|accepted|won|po received|order received|confirmed|order confirmed)$/i;
const isSpecial = (m: any) => m && (m.is_ai_settings || m.is_agent_config || m.is_branding);

export async function createShareLink(ctx: AgentCtx, quoteId: string) {
  let q: any = db.from('quotations').select('id, qn_number, created_by_email').eq('tenant_id', ctx.tenantId).eq('id', quoteId);
  const { data: quote } = await q.maybeSingle();
  if (!quote) throw new Error('No such quote in this workspace.');
  if (!ctx.isManager && String(quote.created_by_email || '').toLowerCase() !== ctx.email.toLowerCase()) throw new Error('Only the quote owner or a manager can share it.');
  const old = await listRecs<ShareData>(ctx.tenantId, 'share', { match: { quote_id: quoteId }, limit: 20 });
  for (const r of old) await deleteRec(ctx.tenantId, 'share', r.id);
  const token = crypto.randomBytes(24).toString('base64url');
  await createRec<ShareData>(ctx.tenantId, 'share', quote.qn_number || quoteId, {
    quote_id: quoteId, qn: quote.qn_number, token_hash: sha(token), created_by: ctx.email, views: 0, response: null,
  });
  return { token };
}

/** The share a token opens, across all workspaces (the token is the only key). */
export async function findShare(token: string): Promise<Rec<ShareData> | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) return null;
  const { data } = await db.from('master_data').select('*').eq('category', 'share').contains('metadata', { token_hash: sha(token) }).limit(1);
  const row = data?.[0];
  return row ? { id: row.id, tenant_id: row.tenant_id, kind: 'share', title: row.label, data: row.metadata, created_at: row.created_at } : null;
}

/** What the client sees: their quote and nothing else of the workspace. */
export async function publicQuote(share: Rec<ShareData>) {
  const t = share.tenant_id;
  const [{ data: q }, { data: tenant }, { data: schema }] = await Promise.all([
    db.from('quotations').select('id, qn_number, status, date, created_at, created_by_email, custom_metadata, clients(company_name, contact_person, email_id), quotation_items(item_code, item_name, quantity, uom, item_rate, item_br, display_order)').eq('tenant_id', t).eq('id', share.data.quote_id).maybeSingle(),
    db.from('tenants').select('company_name, custom_email_sender').eq('id', t).maybeSingle(),
    db.from('tenant_schemas').select('schema_config').eq('tenant_id', t).maybeSingle(),
  ]);
  if (!q) return null;
  const config: any[] = Array.isArray(schema?.schema_config) ? schema!.schema_config : [];
  const branding = config.find((m) => m?.is_branding);
  // only plain single-value modules: never tables (attachments live there), logs or internal notes
  const sections = config.filter((m) => !isSpecial(m) && !m.is_log && !m.allow_multiple).map((m) => {
    const vals = (q.custom_metadata || {})[m.title] || {};
    const fields = (m.fields || [])
      .filter((f: any) => !['master_status', 'logged_in', 'file', 'attachment'].includes(f.type))
      .map((f: any) => ({ label: f.label, value: vals[f.name] }))
      .filter((f: any) => f.value != null && String(f.value).trim() !== '' && typeof f.value !== 'object');
    return { title: m.title, fields };
  }).filter((s) => s.fields.length);
  const items = [...(q.quotation_items || [])].sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((i: any) => ({ code: i.item_code, name: i.item_name, qty: i.quantity, unit: i.uom, rate: i.item_rate, amount: i.item_br || (Number(i.quantity) || 0) * (Number(i.item_rate) || 0) }));
  return {
    company: tenant?.company_name || 'Bloomgard',
    logo: branding?.logo_url || null,
    qn: q.qn_number,
    date: q.date || String(q.created_at).slice(0, 10),
    status: q.status,
    client: clientName(q) || (q as any).clients?.company_name || '',
    sections,
    items,
    total: quoteValue(q),
    currency: String((q.custom_metadata || {})['Quote Details']?.currency || 'INR'),
    response: share.data.response || null,
  };
}

async function owner(tenantId: string, quoteId: string) {
  const { data } = await db.from('quotations').select('created_by_email').eq('tenant_id', tenantId).eq('id', quoteId).maybeSingle();
  return data?.created_by_email || null;
}

/** Count an opening; the first one goes in the Status Log and tells the owner. */
export async function recordView(share: Rec<ShareData>) {
  const now = new Date().toISOString();
  const first = !share.data.views;
  await updateRec<ShareData>(share.tenant_id, 'share', share.id, { views: (share.data.views || 0) + 1, last_viewed_at: now, ...(first ? { first_viewed_at: now } : {}) });
  if (!first) return;
  const { data: q } = await db.from('quotations').select('status').eq('id', share.data.quote_id).maybeSingle();
  await db.from('status_logs').insert([{ quotation_id: share.data.quote_id, old_status: q?.status || null, new_status: q?.status || null, changed_by: null, comments: 'The client opened the quote link.' }]);
  const who = await owner(share.tenant_id, share.data.quote_id);
  if (who) await notify(share.tenant_id, [who], { title: `${share.data.qn} was opened by the client`, link: { view: 'pipeline', quote_id: share.data.quote_id } });
}

/** Accept, or ask for changes. Once answered, the link shows the answer instead of the buttons. */
export async function respond(share: Rec<ShareData>, action: 'accept' | 'changes', name: string, note?: string) {
  const who = String(name || '').trim().slice(0, 120);
  if (!who) throw new Error('Please add your name.');
  if (share.data.response) throw new Error('This quote has already been answered.');
  const text = String(note || '').trim().slice(0, 2000);
  if (action === 'changes' && !text) throw new Error('Tell us what you would like changed.');
  const t = share.tenant_id, quoteId = share.data.quote_id;
  const { data: q } = await db.from('quotations').select('status, custom_metadata, created_by_email').eq('tenant_id', t).eq('id', quoteId).single();
  const at = new Date().toISOString();
  const by = `${who} (client, via quote link)`;
  let movedTo: string | null = null;

  if (action === 'accept') {
    const plan = await metaPlan(t);
    const stage = plan.statuses.find((s) => ACCEPT_STAGE.test(String(s).trim()));
    if (stage && stage !== q?.status) {
      const { data: schema } = await db.from('tenant_schemas').select('schema_config').eq('tenant_id', t).maybeSingle();
      const modules = (Array.isArray(schema?.schema_config) ? schema!.schema_config : []).filter((m: any) => !isSpecial(m));
      await db.from('quotations').update({ status: stage, custom_metadata: mirrorStatusIntoMetadata(q?.custom_metadata, modules, stage), last_contact_date: at }).eq('tenant_id', t).eq('id', quoteId);
      movedTo = stage;
    } else {
      await db.from('quotations').update({ last_contact_date: at }).eq('tenant_id', t).eq('id', quoteId);
    }
    await db.from('status_logs').insert([{ quotation_id: quoteId, old_status: q?.status || null, new_status: movedTo || q?.status || null, changed_by: by, comments: text ? `Accepted: ${text}` : 'Accepted the quote online.' }]);
  } else {
    await db.from('quotations').update({ last_contact_date: at }).eq('tenant_id', t).eq('id', quoteId);
    await db.from('status_logs').insert([{ quotation_id: quoteId, old_status: q?.status || null, new_status: q?.status || null, changed_by: by, comments: `Asked for changes: ${text}` }]);
  }
  await updateRec<ShareData>(t, 'share', share.id, { response: { action, name: who, note: text || undefined, at } });

  const ownerEmail = q?.created_by_email || null;
  const title = action === 'accept' ? `${who} accepted ${share.data.qn}` : `${who} asked for changes to ${share.data.qn}`;
  await notify(t, ownerEmail ? [ownerEmail] : 'managers', { title, body: text || undefined, link: { view: 'pipeline', quote_id: quoteId } });
  if (action === 'accept') await notify(t, 'managers', { title, link: { view: 'pipeline', quote_id: quoteId } });
  if (action === 'changes') {
    const { createTask } = await import('./tasks');
    await createTask(t, { title: `Revise ${share.data.qn}: client asked for changes`, type: 'todo', note: text, source: 'user', source_label: 'Client, via quote link', quote_id: quoteId, qn: share.data.qn, assigned_to: ownerEmail, created_by: by }).catch(() => {});
  }
  try {
    const { emit } = await import('./events');
    if (movedTo) await emit({ type: 'quote.status_changed', tenantId: t, quoteId, actorEmail: null, data: { from: q?.status, to: movedTo, via: 'quote_link' } });
    await emit({ type: 'log.added', tenantId: t, quoteId, actorEmail: null, data: { module: 'Status Log', via: 'quote_link', action } });
  } catch { /* the answer is recorded */ }
  return { action, moved_to: movedTo };
}
