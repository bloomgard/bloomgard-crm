import { db, AgentCtx } from '@/lib/agent/core';
import { domainOfEmail, isFreeEmailDomain } from '@/lib/emailDomain';
import { createRec, getRec, listRecs, updateRec, teamMembers } from './store';
import { notify } from './notify';
import type { Rec } from './types';

/**
 * Leads: enquiries that are not quotes yet. Every client email that is not a reply on an existing
 * quote is read once by the AI, which decides whether it is an enquiry, pulls the sender's details
 * out of the signature, lists what they asked for and matches it against the real catalogue. The
 * reading is kept on the lead (one per email), so the Inbox and Leads never ask the AI twice.
 *
 * Nothing here contacts the client. A reply is drafted, and sent only when a person sends it.
 */

export type LeadStatus = 'new' | 'qualified' | 'contacted' | 'converted' | 'discarded';
export type Requirement = {
  text: string;
  item_code?: string | null;
  item_name?: string | null;
  quantity?: number | null;
  uom?: string | null;
  rate?: number | null;
  match: 'code' | 'name' | 'none';
};
export type LeadData = {
  status: LeadStatus;
  kind: 'enquiry' | 'reply' | 'spam' | 'newsletter' | 'other';
  source: 'email' | 'manual' | 'api';
  email_id?: string | null;
  subject?: string;
  received_at?: string;
  from_email: string;
  contact: { name?: string; company?: string; designation?: string; phone?: string; gstin?: string; city?: string; country?: string; website?: string };
  summary: string;
  intent?: string;
  urgency?: 'high' | 'normal' | 'low';
  deadline?: string | null;
  requirements: Requirement[];
  score: number;
  temperature: 'hot' | 'warm' | 'cold';
  score_reasons: string[];
  existing_client?: { id: string; name: string; last_qn?: string | null; quotes: number } | null;
  reply_draft?: string;
  owner_email?: string | null;
  quote_id?: string | null;
  qn?: string | null;
  discarded_reason?: string | null;
  notes?: string;
  contacted_at?: string | null;
  updated_at?: string;
};

const MODEL = process.env.LEADS_MODEL || 'anthropic/claude-haiku-5.5';
const norm = (s: any) => String(s ?? '').trim().toLowerCase();

/* ------------------------------------------------------------------ catalogue */

type CatalogueItem = { code: string; name: string; uom: string; rate: number | null };

/** Leaf rows of the manual Master Data, flattened to code / name / unit / rate. */
export async function catalogueItems(tenantId: string): Promise<CatalogueItem[]> {
  const { data: entries } = await db.from('master_data_entries').select('id, key_name').eq('tenant_id', tenantId).eq('tab_type', 'manual');
  if (!entries?.length) return [];
  const { data: values } = await db.from('master_data_values').select('id, entry_id, value_text, parent_value_id').in('entry_id', entries.map((e) => e.id));
  const keyOf = new Map(entries.map((e: any) => [e.id, e.key_name]));
  const byId = new Map((values || []).map((v: any) => [v.id, v]));
  const hasChild = new Set((values || []).map((v: any) => v.parent_value_id).filter(Boolean));
  const out: CatalogueItem[] = [];
  for (const leaf of values || []) {
    if (hasChild.has(leaf.id)) continue;
    const row: Record<string, string> = {};
    for (let cur: any = leaf, n = 0; cur && n < 10; cur = byId.get(cur.parent_value_id), n++) row[String(keyOf.get(cur.entry_id))] = cur.value_text;
    if (!row.item_code && !row.item_name) continue;
    const rate = parseFloat(String(row.item_rate ?? '').replace(/[^0-9.]/g, ''));
    out.push({ code: row.item_code || '', name: row.item_name || '', uom: row.uom || '', rate: Number.isFinite(rate) ? rate : null });
  }
  return out;
}

/** Hold the AI to the catalogue: a requirement counts as matched only if the item really exists. */
export function matchRequirements(reqs: any[], items: CatalogueItem[]): Requirement[] {
  return (Array.isArray(reqs) ? reqs : []).slice(0, 30).map((r) => {
    const qty = parseFloat(String(r?.quantity ?? '').replace(/[^0-9.]/g, ''));
    const base: Requirement = { text: String(r?.text || r?.item_name || r?.item_code || '').slice(0, 300), quantity: Number.isFinite(qty) ? qty : null, uom: r?.uom || null, match: 'none' };
    const byCode = r?.item_code ? items.find((i) => i.code && norm(i.code) === norm(r.item_code)) : null;
    const byName = !byCode && r?.item_name ? items.find((i) => i.name && norm(i.name) === norm(r.item_name))
      || items.find((i) => i.name && norm(r.item_name).length > 4 && (norm(i.name).includes(norm(r.item_name)) || norm(r.item_name).includes(norm(i.name)))) : null;
    const hit = byCode || byName;
    if (!hit) return { ...base, item_name: r?.item_name || null, item_code: null } as Requirement;
    return { ...base, item_code: hit.code || null, item_name: hit.name || r?.item_name || null, uom: base.uom || hit.uom || null, rate: hit.rate, match: byCode ? 'code' : 'name' } as Requirement;
  }).filter((r) => r.text || r.item_name || r.item_code);
}

/* ------------------------------------------------------------------ scoring */

/** 0–100 from plain signals, each one listed so a person can see why. */
export function scoreLead(l: Pick<LeadData, 'from_email' | 'contact' | 'requirements' | 'urgency' | 'deadline' | 'intent' | 'existing_client' | 'kind'>) {
  const reasons: string[] = [];
  let s = 10;
  const domain = domainOfEmail(l.from_email);
  if (domain && !isFreeEmailDomain(domain)) { s += 15; reasons.push('writes from a company domain'); }
  const withQty = l.requirements.filter((r) => r.quantity);
  if (withQty.length) { s += 15; reasons.push(`gives quantities for ${withQty.length} item${withQty.length === 1 ? '' : 's'}`); }
  const matched = l.requirements.filter((r) => r.match !== 'none');
  if (matched.length) { s += Math.min(20, 10 + matched.length * 5); reasons.push(`${matched.length} item${matched.length === 1 ? ' is' : 's are'} in your catalogue`); }
  if (l.urgency === 'high' || l.deadline) { s += 12; reasons.push(l.deadline ? `needs it by ${l.deadline}` : 'says it is urgent'); }
  if (l.existing_client) { s += 15; reasons.push(`returning client (${l.existing_client.quotes} earlier quote${l.existing_client.quotes === 1 ? '' : 's'})`); }
  if (l.contact?.phone || l.contact?.gstin) { s += 5; reasons.push(l.contact.gstin ? 'gave a GSTIN' : 'gave a phone number'); }
  if (l.intent === 'reorder') { s += 8; reasons.push('a repeat order'); }
  if (l.intent === 'price_check') { s -= 5; reasons.push('asking prices only'); }
  if (l.kind !== 'enquiry') s = Math.min(s, 15);
  s = Math.max(0, Math.min(100, s));
  return { score: s, temperature: (s >= 65 ? 'hot' : s >= 40 ? 'warm' : 'cold') as LeadData['temperature'], score_reasons: reasons };
}

/* ------------------------------------------------------------------ the AI reading */

async function aiRead(tenantId: string, email: { from: string; subject: string; body: string }, signer: { name?: string; title?: string; company?: string }) {
  const { buildMasterDataContext } = await import('@/lib/masterDataContext');
  const catalogue = await buildMasterDataContext(tenantId, `${email.subject}\n${email.body}`).catch(() => '');
  const system = `You triage inbound email for a B2B sales desk. Read one email and return ONLY a JSON object:
{
  "kind": "enquiry" | "reply" | "spam" | "newsletter" | "other",   // enquiry = someone wants a price, quote, sample or to buy
  "confidence": 0-1,
  "summary": "one sentence: who wants what",
  "contact": { "name", "company", "designation", "phone", "gstin", "city", "country", "website" },   // from the signature/body; omit what is not there
  "requirements": [ { "text": "what they asked for, in their words", "item_code": "catalogue code if it clearly matches", "item_name": "catalogue name if it clearly matches, else their wording", "quantity": number|null, "uom": "unit|null" } ],
  "intent": "new_enquiry" | "reorder" | "price_check" | "sample_request" | "other",
  "urgency": "high" | "normal" | "low",
  "deadline": "date or phrase if they gave one, else null",
  "reply_draft": "a short, warm reply that thanks them, confirms what they asked for, and says a quotation follows (or asks the one thing missing, e.g. quantity). Never state a price. Sign as below."
}
Never invent a catalogue code. Never invent prices. Sign the reply as:
${[signer.name, signer.title, signer.company].filter(Boolean).join('\n') || 'The team'}

CATALOGUE (for matching only):
${catalogue || 'No catalogue configured.'}`;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ''}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://cma.bloomgard.co', 'X-Title': 'Bloomgard leads' },
    body: JSON.stringify({
      model: MODEL, temperature: 0.1, max_tokens: 1500,
      messages: [{ role: 'system', content: system }, { role: 'user', content: `From: ${email.from}\nSubject: ${email.subject}\n\n${email.body.slice(0, 8000)}` }],
    }),
  });
  if (!res.ok) throw new Error(`The AI service returned ${res.status}.`);
  const j = await res.json();
  if (j.usage) { try { const { logAiUsage } = await import('@/utils/usageLogger'); await logAiUsage(tenantId, null, 'lead-triage', j.usage); } catch { /* usage is best effort */ } }
  const text = String(j?.choices?.[0]?.message?.content || '');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('The AI did not return a reading.');
  return JSON.parse(m[0]);
}

async function findExistingClient(tenantId: string, fromEmail: string, company?: string) {
  const addr = (String(fromEmail).match(/[^\s<>"']+@[^\s<>"']+/)?.[0] || '').toLowerCase();
  let client: any = null;
  if (addr) ({ data: client } = await db.from('clients').select('id, company_name').eq('tenant_id', tenantId).ilike('email_id', addr).limit(1).maybeSingle());
  if (!client && company && company.length > 2) ({ data: client } = await db.from('clients').select('id, company_name').eq('tenant_id', tenantId).ilike('company_name', company.trim()).limit(1).maybeSingle());
  if (!client) return null;
  const { data: qs } = await db.from('quotations').select('qn_number, created_at').eq('tenant_id', tenantId).eq('client_id', client.id).order('created_at', { ascending: false });
  return { id: client.id, name: client.company_name, last_qn: qs?.[0]?.qn_number || null, quotes: qs?.length || 0 };
}

/* ------------------------------------------------------------------ capture */

export async function leadForEmail(tenantId: string, emailId: string) {
  const rows = await listRecs<LeadData>(tenantId, 'lead', { match: { email_id: emailId }, limit: 1 });
  return rows[0] || null;
}

/**
 * Read one email and keep the reading as a lead. A newsletter or a reply is kept too (status
 * discarded, with the reason), so the Inbox can label it without asking the AI again.
 */
export async function captureFromEmail(tenantId: string, emailId: string, o: { signer?: { name?: string; title?: string; company?: string }; force?: boolean; owner_email?: string | null } = {}): Promise<Rec<LeadData>> {
  const existing = await leadForEmail(tenantId, emailId);
  if (existing && !o.force) return existing;
  const { data: em } = await db.from('inbound_emails').select('id, sender_email, subject, body_text, body_html, created_at').eq('tenant_id', tenantId).eq('id', emailId).maybeSingle();
  if (!em) throw new Error('No such email in this workspace.');
  const body = String(em.body_text || String(em.body_html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+\n/g, '\n').trim();
  const lead = await buildLead(tenantId, { from: em.sender_email, subject: em.subject || '', body, received_at: em.created_at, email_id: em.id, source: 'email', signer: o.signer });
  lead.owner_email = o.owner_email || existing?.data.owner_email || null;
  const title = `${lead.contact.company || lead.contact.name || em.sender_email}: ${lead.summary}`.slice(0, 280);
  const rec = existing
    ? await updateRec<LeadData>(tenantId, 'lead', existing.id, { ...lead, status: existing.data.status === 'converted' ? 'converted' : lead.status, quote_id: existing.data.quote_id, qn: existing.data.qn }, title)
    : await createRec<LeadData>(tenantId, 'lead', title, lead);
  if (!existing && rec.data.kind === 'enquiry') await announce(tenantId, rec);
  return rec;
}

/** A lead from text a person pasted (a WhatsApp message, a phone note, a forwarded mail). */
export async function captureFromText(ctx: AgentCtx, o: { text: string; from_email?: string; subject?: string }) {
  const text = String(o.text || '').trim();
  if (text.length < 10) throw new Error('Paste the enquiry first.');
  const lead = await buildLead(ctx.tenantId, {
    from: o.from_email || '', subject: o.subject || 'Enquiry', body: text.slice(0, 10000), received_at: new Date().toISOString(), email_id: null, source: 'manual',
    signer: { name: ctx.profile?.full_name, title: ctx.profile?.job_title, company: ctx.tenant?.company_name },
  });
  if (lead.kind !== 'enquiry') { lead.kind = 'enquiry'; lead.status = 'new'; Object.assign(lead, scoreLead(lead)); } // a person said it is a lead
  lead.owner_email = ctx.email;
  const rec = await createRec<LeadData>(ctx.tenantId, 'lead', `${lead.contact.company || lead.contact.name || 'Enquiry'}: ${lead.summary}`.slice(0, 280), lead);
  return rec;
}

async function buildLead(tenantId: string, e: { from: string; subject: string; body: string; received_at: string; email_id: string | null; source: LeadData['source']; signer?: any }): Promise<LeadData> {
  let signer = e.signer;
  if (!signer?.company) {
    const { data: t } = await db.from('tenants').select('company_name').eq('id', tenantId).maybeSingle();
    signer = { ...(signer || {}), company: t?.company_name };
  }
  const read = await aiRead(tenantId, { from: e.from, subject: e.subject, body: e.body }, signer);
  const kinds = ['enquiry', 'reply', 'spam', 'newsletter', 'other'];
  const kind = kinds.includes(read.kind) ? read.kind : 'other';
  const items = await catalogueItems(tenantId);
  const requirements = matchRequirements(read.requirements, items);
  const contact = Object.fromEntries(Object.entries(read.contact || {}).filter(([, v]) => v && typeof v === 'string').map(([k, v]) => [k, String(v).slice(0, 200)])) as LeadData['contact'];
  const fromAddr = String(e.from).match(/[^\s<>"']+@[^\s<>"']+/)?.[0] || e.from;
  const existing_client = await findExistingClient(tenantId, fromAddr, contact.company).catch(() => null);
  const partial = {
    kind, from_email: fromAddr, contact, requirements, existing_client,
    urgency: ['high', 'normal', 'low'].includes(read.urgency) ? read.urgency : 'normal',
    deadline: read.deadline ? String(read.deadline).slice(0, 80) : null,
    intent: String(read.intent || 'other'),
  } as any;
  const scored = scoreLead(partial);
  return {
    ...partial,
    status: kind === 'enquiry' ? 'new' : 'discarded',
    discarded_reason: kind === 'enquiry' ? null : ({ reply: 'A reply, not a new enquiry', spam: 'Spam', newsletter: 'A newsletter or notification', other: 'Not a sales enquiry' } as any)[kind],
    source: e.source, email_id: e.email_id, subject: e.subject, received_at: e.received_at,
    summary: String(read.summary || e.subject || '').slice(0, 400),
    reply_draft: kind === 'enquiry' ? String(read.reply_draft || '').slice(0, 4000) : '',
    ...scored,
  };
}

async function announce(tenantId: string, rec: Rec<LeadData>) {
  const who = rec.data.contact.company || rec.data.contact.name || rec.data.from_email;
  const title = `${rec.data.temperature === 'hot' ? 'Hot lead' : 'New lead'}: ${who}`;
  const link = { view: 'leadgen', sub: rec.id };
  if (rec.data.owner_email) await notify(tenantId, [rec.data.owner_email], { title, body: rec.data.summary, link });
  if (rec.data.temperature === 'hot' || !rec.data.owner_email) await notify(tenantId, 'managers', { title, body: rec.data.summary, link });
}

/**
 * Read recent emails that nobody has read for leads yet: not already a lead, not a reply on a
 * quote. A few at a time, newest first.
 */
export async function scanInbox(ctx: AgentCtx, o: { limit?: number; days?: number } = {}) {
  const limit = Math.min(Math.max(o.limit ?? 15, 1), 40);
  const since = new Date(Date.now() - (o.days ?? 30) * 86400000).toISOString();
  const { data: emails } = await db.from('inbound_emails').select('id, subject').eq('tenant_id', ctx.tenantId).gte('created_at', since).or('is_deleted.is.null,is_deleted.eq.false').order('created_at', { ascending: false }).limit(200);
  const done = new Set((await listRecs<LeadData>(ctx.tenantId, 'lead', { limit: 1000 })).map((r) => r.data.email_id).filter(Boolean));
  const todo = (emails || []).filter((e: any) => !done.has(e.id) && !/QN-\d{4}-\d{3}/.test(String(e.subject || ''))).slice(0, limit);
  const signer = { name: ctx.profile?.full_name, title: ctx.profile?.job_title, company: ctx.tenant?.company_name };
  const results: Array<Rec<LeadData>> = [];
  const errors: string[] = [];
  for (let i = 0; i < todo.length; i += 3) {
    const batch = await Promise.allSettled(todo.slice(i, i + 3).map((e: any) => captureFromEmail(ctx.tenantId, e.id, { signer })));
    batch.forEach((b) => (b.status === 'fulfilled' ? results.push(b.value) : errors.push(String((b as any).reason?.message || b))));
  }
  return {
    read: results.length,
    leads: results.filter((r) => r.data.kind === 'enquiry').length,
    skipped: results.filter((r) => r.data.kind !== 'enquiry').length,
    remaining: Math.max(0, (emails || []).filter((e: any) => !done.has(e.id)).length - todo.length),
    errors,
  };
}

/* ------------------------------------------------------------------ working a lead */

export const canSee = (ctx: AgentCtx, l: LeadData) => ctx.isManager || !l.owner_email || norm(l.owner_email) === norm(ctx.email);

export async function listLeads(ctx: AgentCtx, o: { status?: string; temperature?: string; q?: string; email_ids?: string[] } = {}) {
  const rows = (await listRecs<LeadData>(ctx.tenantId, 'lead', { limit: 1000 })).filter((r) => canSee(ctx, r.data));
  if (o.email_ids?.length) { const want = new Set(o.email_ids); return rows.filter((r) => r.data.email_id && want.has(r.data.email_id)); }
  return rows.filter((r) => {
    if (o.status && o.status !== 'all' && (o.status === 'open' ? ['converted', 'discarded'].includes(r.data.status) : r.data.status !== o.status)) return false;
    if (!o.status && r.data.status === 'discarded') return false;
    if (o.temperature && r.data.temperature !== o.temperature) return false;
    if (o.q) { const q = norm(o.q); if (![r.title, r.data.from_email, r.data.contact?.company, r.data.contact?.name, r.data.summary].some((x) => norm(x).includes(q))) return false; }
    return true;
  });
}

export async function getLead(ctx: AgentCtx, id: string) {
  const r = await getRec<LeadData>(ctx.tenantId, 'lead', id);
  if (!r || !canSee(ctx, r.data)) throw new Error('No such lead.');
  return r;
}

const STATUSES: LeadStatus[] = ['new', 'qualified', 'contacted', 'converted', 'discarded'];

export async function updateLead(ctx: AgentCtx, id: string, patch: Partial<Pick<LeadData, 'status' | 'owner_email' | 'notes' | 'requirements' | 'reply_draft' | 'discarded_reason' | 'contact'>>) {
  const r = await getLead(ctx, id);
  const next: Partial<LeadData> = {};
  if (patch.status) {
    if (!STATUSES.includes(patch.status) || patch.status === 'converted') throw new Error('Status must be new, qualified, contacted or discarded. Use Create quote to convert.');
    next.status = patch.status;
    if (patch.status === 'discarded') next.discarded_reason = String(patch.discarded_reason || 'Discarded').slice(0, 200);
    if (patch.status === 'contacted') next.contacted_at = new Date().toISOString();
    // a person saying "this is a lead" overrules the AI's reading
    if (patch.status !== 'discarded' && r.data.kind !== 'enquiry') {
      next.kind = 'enquiry'; next.discarded_reason = null;
      Object.assign(next, scoreLead({ ...r.data, kind: 'enquiry' } as any));
    }
  }
  if (patch.owner_email !== undefined) {
    if (patch.owner_email) {
      const m = (await teamMembers(ctx.tenantId)).find((x) => norm(x.email) === norm(patch.owner_email));
      if (!m) throw new Error(`${patch.owner_email} is not in this workspace.`);
      next.owner_email = m.email;
      if (norm(m.email) !== norm(ctx.email)) await notify(ctx.tenantId, [m.email], { title: `Lead for you: ${r.data.contact.company || r.data.from_email}`, body: r.data.summary, link: { view: 'leadgen', sub: id }, from_email: ctx.email });
    } else next.owner_email = null;
  }
  if (patch.notes !== undefined) next.notes = String(patch.notes).slice(0, 4000);
  if (patch.reply_draft !== undefined) next.reply_draft = String(patch.reply_draft).slice(0, 6000);
  if (patch.contact) next.contact = { ...r.data.contact, ...patch.contact };
  if (patch.requirements) {
    next.requirements = matchRequirements(patch.requirements.map((x: any) => ({ ...x, text: x.text || x.item_name })), await catalogueItems(ctx.tenantId));
    Object.assign(next, scoreLead({ ...r.data, ...next } as any));
  }
  return updateRec<LeadData>(ctx.tenantId, 'lead', id, next);
}

/** Make the quotation: client, line items from the matched catalogue, the email thread linked. */
export async function convertLead(ctx: AgentCtx, id: string) {
  const r = await getLead(ctx, id);
  const l = r.data;
  if (l.status === 'converted' && l.quote_id) throw new Error(`Already ${l.qn}.`);
  const { createQuoteFromAnalysis } = await import('@/lib/quoteFromEmail');
  const analysis = {
    summary: l.summary,
    lead_gen_quote: {
      'Client Information': [{
        client_name: l.contact.company || l.existing_client?.name || '', contact_person: l.contact.name || '', email_id: l.from_email,
        phone_number: l.contact.phone || '', billing_address: [l.contact.city, l.contact.country].filter(Boolean).join(', '),
      }],
      Products: l.requirements.map((q) => ({ item_code: q.item_code || '', item_name: q.item_name || q.text, quantity: q.quantity || 0, uom: q.uom || '' })),
    },
  };
  const owner = l.owner_email || ctx.email;
  const out = await createQuoteFromAnalysis({ tenantId: ctx.tenantId, emailId: l.email_id || null, analysis, agentEmail: owner, source: l.source === 'email' ? 'lead_email' : 'lead' });
  await updateRec<LeadData>(ctx.tenantId, 'lead', id, { status: 'converted', quote_id: out.quoteId, qn: out.qn_number, owner_email: owner });
  return { quote_id: out.quoteId, qn: out.qn_number, items: out.itemCount };
}

/** Send the drafted (and possibly edited) reply, as the person clicking Send. */
export async function replyToLead(ctx: AgentCtx, id: string, o: { subject?: string; body?: string }) {
  const r = await getLead(ctx, id);
  const body = String(o.body ?? r.data.reply_draft ?? '').trim();
  if (!body) throw new Error('Write the reply first.');
  const subject = String(o.subject || (r.data.subject ? (/^re:/i.test(r.data.subject) ? r.data.subject : `Re: ${r.data.subject}`) : 'Your enquiry')).slice(0, 200);
  const { executeAction } = await import('@/lib/agent/tools');
  const out = await executeAction('send_email', { to: r.data.from_email, subject, body }, ctx);
  await updateRec<LeadData>(ctx.tenantId, 'lead', id, { status: r.data.status === 'new' || r.data.status === 'qualified' ? 'contacted' : r.data.status, contacted_at: new Date().toISOString(), reply_draft: body });
  return { message: out.message };
}

export function leadStats(rows: Rec<LeadData>[]) {
  const live = rows.filter((r) => r.data.kind === 'enquiry');
  const week = Date.now() - 7 * 86400000;
  const converted = live.filter((r) => r.data.status === 'converted').length;
  return {
    new: live.filter((r) => r.data.status === 'new').length,
    hot: live.filter((r) => r.data.temperature === 'hot' && !['converted', 'discarded'].includes(r.data.status)).length,
    this_week: live.filter((r) => new Date(r.created_at).getTime() > week).length,
    converted,
    conversion: live.length ? Math.round((converted / live.length) * 100) : 0,
  };
}
