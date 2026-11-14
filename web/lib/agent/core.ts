import { createClient } from '@supabase/supabase-js';

/** Service-role client. Every query made through it MUST be scoped to ctx.tenantId. */
export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export type AgentCtx = {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
  isManager: boolean;
  profile: any;
  tenant: any;
};

/** Resolve the caller from their Supabase access token. Never trust ids sent in the body. */
export async function authenticate(request: Request): Promise<AgentCtx | null> {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth?.user) return null;
  let { data: profile, error: joinErr } = await db.from('profiles').select('*, tenant:tenants(*)').eq('id', auth.user.id).maybeSingle();
  if (joinErr) ({ data: profile } = await db.from('profiles').select('*').eq('id', auth.user.id).maybeSingle());
  if (!profile?.tenant_id) return null;
  let tenant: any = Array.isArray(profile.tenant) ? profile.tenant[0] : profile.tenant;
  if (!tenant) ({ data: tenant } = await db.from('tenants').select('*').eq('id', profile.tenant_id).maybeSingle());
  if (!tenant) return null;
  delete profile.tenant;
  const role = String(profile.role || '').toLowerCase();
  return {
    userId: auth.user.id,
    email: auth.user.email || profile.email || '',
    tenantId: profile.tenant_id,
    role,
    isManager: role === 'manager' || role === 'admin',
    profile,
    tenant,
  };
}

const MONEY_KEYS = ['subtotal', 'total', 'grandtotal', 'amount'];
const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The headline amount of a quote: a subtotal/total field in its form data, else the sum of its line items. */
export function quoteValue(q: any): number {
  const dfs = (o: any): number => {
    if (!o || typeof o !== 'object') return 0;
    if (Array.isArray(o)) { for (const x of o) { const v = dfs(x); if (v) return v; } return 0; }
    for (const [k, v] of Object.entries(o)) {
      if (MONEY_KEYS.includes(norm(k))) {
        const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
        if (n > 0) return n;
      }
    }
    for (const v of Object.values(o)) { const r = dfs(v); if (r) return r; }
    return 0;
  };
  const fromMeta = dfs(q.custom_metadata);
  if (fromMeta) return fromMeta;
  return (q.quotation_items || []).reduce((s: number, i: any) => s + Number(i.quantity || 0) * Number(i.item_rate || 0), 0);
}

export const clientName = (q: any) =>
  q.clients?.company_name || q.custom_metadata?.['Client Information']?.client_name || '';

/*
 * A quote's form data (custom_metadata) can be huge: attachments are stored inline as base64, so one quote
 * can weigh megabytes. Never pull the whole column for lists. The tenant's form blueprint tells us which
 * sections exist and which field holds the amount; select just those parts as JSON paths.
 */
type MetaPlan = { money: Array<[string, string]>; sections: string[] };
const planCache = new Map<string, { at: number; plan: MetaPlan }>();
const safeKey = (k: string) => String(k).replace(/["\\]/g, '');

export async function metaPlan(tenantId: string): Promise<MetaPlan> {
  const hit = planCache.get(tenantId);
  if (hit && Date.now() - hit.at < 60_000) return hit.plan;
  const { data } = await db.from('tenant_schemas').select('schema_config').eq('tenant_id', tenantId).maybeSingle();
  const sections = (Array.isArray(data?.schema_config) ? data!.schema_config : []).filter((x: any) => x?.title && Array.isArray(x.fields));
  const money: Array<[string, string]> = [];
  const keep: string[] = [];
  for (const sec of sections) {
    const fields = sec.fields || [];
    const heavy = /attach|file|document|image|logo/i.test(sec.title) || fields.some((f: any) => /attach|file|image/i.test(String(f.type || '')));
    if (!heavy) keep.push(sec.title);
    for (const f of fields) if (MONEY_KEYS.includes(norm(f.name))) money.push([sec.title, f.name]);
  }
  const plan: MetaPlan = {
    money: money.length ? money : [['Quote Details', 'subtotal']],
    sections: keep.length ? keep : ['Client Information', 'Quote Details', 'Products'],
  };
  planCache.set(tenantId, { at: Date.now(), plan });
  return plan;
}

/**
 * Quotes the caller may see: everything for managers/admins, their own otherwise.
 * lean: just enough for stats (amount, client name, item totals); otherwise the readable form sections
 * plus the conversation, but never attachments.
 */
export async function visibleQuotes(ctx: AgentCtx, limit = 1000, lean = false) {
  const plan = await metaPlan(ctx.tenantId);
  const moneySel = plan.money.map(([sec, f], i) => `m${i}:custom_metadata->"${safeKey(sec)}"->>"${safeKey(f)}"`);
  const select = lean
    ? ['id, qn_number, status, date, created_at, created_by_email, last_contact_date, clients(company_name), quotation_items(quantity, item_rate)',
       'cn:custom_metadata->"Client Information"->>client_name', ...moneySel].join(', ')
    : ['id, qn_number, status, date, created_at, created_by_email, last_contact_date, follow_up_due_date, client_id, clients(company_name, email_id, contact_person), quotation_items(item_code, item_name, quantity, uom, item_rate)',
       'ac:custom_metadata->agent_conversations', ...plan.sections.map((t, i) => `s${i}:custom_metadata->"${safeKey(t)}"`)].join(', ');
  let query = db.from('quotations').select(select).eq('tenant_id', ctx.tenantId).order('created_at', { ascending: false }).limit(limit);
  if (!ctx.isManager) query = query.eq('created_by_email', ctx.email);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  // rebuild a slim custom_metadata so quoteValue / clientName work the same on every shape
  return ((data || []) as any[]).map((q) => {
    const meta: any = {};
    if (lean) {
      plan.money.forEach(([sec, f], i) => { if (q[`m${i}`] != null) (meta[sec] ||= {})[f] = q[`m${i}`]; delete q[`m${i}`]; });
      if (q.cn) meta['Client Information'] = { client_name: q.cn };
      delete q.cn;
    } else {
      plan.sections.forEach((t, i) => { if (q[`s${i}`] != null) meta[t] = q[`s${i}`]; delete q[`s${i}`]; });
      if (q.ac) meta.agent_conversations = q.ac;
      delete q.ac;
    }
    q.custom_metadata = meta;
    return q;
  });
}

export const daysSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : 999);

export function temperature(q: any, incomingQuoteIds: Set<string>): 'hot' | 'warm' | 'cold' {
  if (incomingQuoteIds.has(q.id)) return 'hot';
  const d = daysSince(q.last_contact_date || q.date || q.created_at);
  return d <= 3 ? 'hot' : d <= 10 ? 'warm' : 'cold';
}

export const quoteCard = (q: any) => ({
  qn: q.qn_number,
  status: q.status,
  client: clientName(q),
  email: q.clients?.email_id || '',
  value: Math.round(quoteValue(q)),
  date: q.date,
  created_by: q.created_by_email,
  last_contact: q.last_contact_date,
  items: (q.quotation_items || []).length,
});

export async function buildOverview(ctx: AgentCtx) {
  const quotes = (await visibleQuotes(ctx, 1000, true)).filter((q: any) => q.status !== 'Lead');
  const byStatus: Record<string, number> = {};
  const valueByStatus: Record<string, number> = {};
  quotes.forEach((q: any) => {
    const st = q.status || 'Unknown';
    byStatus[st] = (byStatus[st] || 0) + 1;
    valueByStatus[st] = Math.round((valueByStatus[st] || 0) + quoteValue(q));
  });

  const mine = quotes.filter((q: any) => q.created_by_email === ctx.email);
  const totalValue = quotes.reduce((s: number, q: any) => s + quoteValue(q), 0);
  const myValue = mine.reduce((s: number, q: any) => s + quoteValue(q), 0);

  // quotes created per month (last 8), oldest first, for the sparkline
  const weeks: number[] = Array(8).fill(0);
  quotes.forEach((q: any) => {
    const m = Math.floor(daysSince(q.created_at) / 30);
    if (m >= 0 && m < 8) weeks[7 - m] += 1;
  });

  const [{ count: unread }, { data: threads }] = await Promise.all([
    db.from('inbound_emails').select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId).eq('is_deleted', false).eq('is_read', false),
    db.from('email_threads').select('quote_id').eq('tenant_id', ctx.tenantId).eq('triage_status', 'incoming'),
  ]);
  const incoming = new Set<string>((threads || []).map((t: any) => t.quote_id).filter(Boolean));

  const open = quotes.filter((q: any) => q.status !== 'Approved' && q.status !== 'Lost' && q.status !== 'Rejected');
  const temps = { hot: 0, warm: 0, cold: 0 };
  open.forEach((q: any) => { temps[temperature(q, incoming)] += 1; });
  const waiting = open.filter((q: any) => incoming.has(q.id)).length;

  const latest = quotes.slice(0, 3).map(quoteCard);

  const chips: Array<{ label: string; prompt: string; icon: string }> = [];
  if ((unread || 0) > 0) chips.push({ icon: 'mail', label: `Summarize ${unread} unread email${unread === 1 ? '' : 's'}`, prompt: 'Summarize my unread emails and tell me which ones need a reply first.' });
  if (waiting > 0) chips.push({ icon: 'reply', label: `Reply to ${waiting} waiting client${waiting === 1 ? '' : 's'}`, prompt: 'Which clients are waiting on a reply from us? Draft the replies for me to confirm.' });
  if (temps.cold > 0) chips.push({ icon: 'bell', label: `Chase ${temps.cold} cold quote${temps.cold === 1 ? '' : 's'}`, prompt: 'List my cold quotes and draft a short follow-up for the most valuable one.' });
  chips.push(
    { icon: 'plus', label: 'Create a quote from an enquiry', prompt: 'Look at my latest enquiry emails and create a quote from the best one.' },
    { icon: 'chart', label: 'Revenue by status', prompt: 'Show a chart of quote value by status.' },
    { icon: 'sparkle', label: 'What changed this week?', prompt: 'Give me a briefing: what changed in the last 7 days across quotes, emails and follow-ups?' },
    { icon: 'db', label: 'Review catalogue', prompt: 'Review my Master Data catalogue and point out anything that looks inconsistent or incomplete.' },
    { icon: 'settings', label: 'Explain my email setup', prompt: 'Explain how my email settings are configured and whether anything looks wrong.' },
  );

  return {
    user: { name: ctx.profile.full_name || ctx.email.split('@')[0], email: ctx.email, role: ctx.role },
    company: ctx.tenant.company_name,
    stats: {
      total: quotes.length, totalValue: Math.round(totalValue), byStatus, valueByStatus,
      mine: mine.length, myValue: Math.round(myValue), weeks,
    },
    inbox: { unread: unread || 0, waiting },
    followups: temps,
    latest,
    chips: chips.slice(0, 8),
  };
}
