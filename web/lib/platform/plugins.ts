import crypto from 'crypto';
import { db, quoteValue, clientName } from '@/lib/agent/core';
import { createRec, listRecs, updateRec } from './store';
import type { EventType, PlatformEvent, PluginData, PluginType, Rec } from './types';

/**
 * Plugins: one store record per type per workspace (kind 'plugin', title = type).
 *  - webhook: every subscribed event POSTed as signed JSON to the workspace's own endpoint;
 *  - slack: one plain line per subscribed event to a Slack incoming webhook;
 *  - inbound_api: a per-workspace token that lets a website form or another system create quotes;
 *  - accounting_export: a CSV of approved quotes, line by line, for Tally or a spreadsheet;
 *  - whatsapp / calls: listed, but they need the owner's own accounts before they can be switched on.
 * Secrets (webhook signing secret, the inbound token) never leave the server in full.
 */

export type FieldSchema = { key: string; label: string; type: 'url' | 'text' | 'secret'; placeholder?: string; help?: string; required?: boolean };

export type CatalogEntry = {
  type: PluginType;
  name: string;
  blurb: string;
  category: 'Automation' | 'Data in' | 'Accounting' | 'Channels';
  needsAccount: boolean;
  needs?: string;                // what the owner must set up first
  fields: FieldSchema[];
  hasEvents: boolean;
};

export const PLUGIN_EVENTS: Array<{ type: EventType; label: string }> = [
  { type: 'quote.created', label: 'Quote created' },
  { type: 'quote.status_changed', label: 'Status changed' },
  { type: 'quote.updated', label: 'Quote edited' },
  { type: 'log.added', label: 'Log entry added' },
  { type: 'email.received', label: 'Client email received' },
  { type: 'comment.added', label: 'Team note added' },
  { type: 'task.completed', label: 'Task completed' },
];
const DEFAULT_EVENTS: EventType[] = ['quote.created', 'quote.status_changed'];

const CATALOG: CatalogEntry[] = [
  {
    type: 'webhook', name: 'Webhook', category: 'Automation', needsAccount: false, hasEvents: true,
    blurb: 'Send each chosen event as signed JSON to your own system: an ERP, a script, Zapier or Make.',
    fields: [
      { key: 'url', label: 'Endpoint URL', type: 'url', placeholder: 'https://example.com/bloomgard', required: true },
      { key: 'secret', label: 'Signing secret', type: 'secret', help: 'Generated for you. Verify X-Bloomgard-Signature (sha256 HMAC of the raw body) with it.' },
    ],
  },
  {
    type: 'slack', name: 'Slack', category: 'Automation', needsAccount: false, hasEvents: true,
    blurb: 'Post a one-line note to a Slack channel when a quote is created or changes status.',
    fields: [
      { key: 'url', label: 'Incoming webhook URL', type: 'url', placeholder: 'https://hooks.slack.com/services/…', required: true, help: 'In Slack: Apps → Incoming Webhooks → Add to a channel, then paste the URL.' },
    ],
  },
  {
    type: 'inbound_api', name: 'Inbound API', category: 'Data in', needsAccount: false, hasEvents: false,
    blurb: 'Let your website enquiry form or another system create quotes here with a private token.',
    fields: [],
  },
  {
    type: 'accounting_export', name: 'Accounting export', category: 'Accounting', needsAccount: false, hasEvents: false,
    blurb: 'Download approved quotes line by line as CSV, ready for Tally, Zoho Books or a spreadsheet.',
    fields: [],
  },
  {
    type: 'whatsapp', name: 'WhatsApp', category: 'Channels', needsAccount: true, hasEvents: false,
    blurb: 'Send quotes and follow-ups on WhatsApp, and capture client replies like email.',
    needs: 'A WhatsApp Business account verified by Meta, through Gupshup or WATI. Set that up and share the API key with us to switch this on.',
    fields: [],
  },
  {
    type: 'calls', name: 'Calls', category: 'Channels', needsAccount: true, hasEvents: false,
    blurb: 'Click to call clients, and have AI follow-up calls logged on the quote.',
    needs: 'A Bland AI account with billing and a phone number. Set that up to switch this on.',
    fields: [],
  },
];

export const catalog = () => CATALOG;
export const catalogEntry = (type: string) => CATALOG.find((c) => c.type === type) || null;

const last4 = (s: string) => String(s || '').slice(-4);
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Secrets replaced by "••••last4"; never return a plugin to the browser without this. */
export function redact(p: Rec<PluginData> | null) {
  if (!p) return null;
  const config: Record<string, any> = { ...(p.data.config || {}) };
  if (config.secret) config.secret = `••••${last4(config.secret)}`;
  if (config.url && p.data.type === 'slack') config.url = String(config.url).replace(/(hooks\.slack\.com\/services\/)(.+)(.{4})$/, '$1••••$3');
  delete config.token_hash;
  return { id: p.id, ...p.data, config };
}

/** https only; plain http only to localhost outside production. Slack must be its own webhook host. */
export function validateUrl(type: PluginType, raw: string): string {
  const s = String(raw || '').trim();
  let u: URL;
  try { u = new URL(s); } catch { throw new Error(`"${s}" is not a valid URL.`); }
  const localDev = process.env.NODE_ENV !== 'production' && u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);
  if (u.protocol !== 'https:' && !localDev) throw new Error('Use an https:// address.');
  if (type === 'slack' && !s.startsWith('https://hooks.slack.com/')) throw new Error('A Slack incoming webhook URL starts with https://hooks.slack.com/.');
  return s;
}

export async function getPlugin(tenantId: string, type: PluginType): Promise<Rec<PluginData> | null> {
  const all = await listRecs<PluginData>(tenantId, 'plugin', { limit: 50 });
  return all.find((p) => p.data.type === type) || null;
}

export async function listPlugins(tenantId: string) {
  return listRecs<PluginData>(tenantId, 'plugin', { limit: 50 });
}

/** Create or update a workspace's plugin. Config keys not in the schema are ignored. */
export async function upsertPlugin(
  tenantId: string, type: PluginType,
  patch: { enabled?: boolean; config?: Record<string, any>; events?: EventType[] },
) {
  const entry = catalogEntry(type);
  if (!entry) throw new Error(`Unknown plugin "${type}".`);
  if (entry.needsAccount && patch.enabled) throw new Error(`${entry.name} needs your own account first. ${entry.needs}`);
  const cur = await getPlugin(tenantId, type);
  const config: Record<string, any> = { ...(cur?.data.config || {}) };

  for (const f of entry.fields) {
    if (!patch.config || !(f.key in patch.config)) continue;
    const v = String(patch.config[f.key] ?? '').trim();
    if (f.type === 'secret') { if (v && !v.startsWith('••••')) config[f.key] = v; continue; }   // redacted echo: keep the stored one
    if (f.type === 'url') {
      if (!v) { delete config[f.key]; continue; }
      if (type === 'slack' && v.includes('••••') && config.url) continue;
      config[f.key] = validateUrl(type, v);
      continue;
    }
    config[f.key] = v;
  }
  if (type === 'webhook' && !config.secret) config.secret = `bgs_${crypto.randomBytes(24).toString('base64url')}`;

  let events = patch.events ?? cur?.data.events ?? (entry.hasEvents ? DEFAULT_EVENTS : undefined);
  if (events) events = events.filter((e) => PLUGIN_EVENTS.some((x) => x.type === e));
  const enabled = patch.enabled ?? cur?.data.enabled ?? false;
  if (enabled) for (const f of entry.fields) if (f.required && !config[f.key]) throw new Error(`${entry.name} needs a ${f.label.toLowerCase()} before it can be switched on.`);

  const data: PluginData = { type, enabled, config, events, last_delivery: cur?.data.last_delivery ?? null };
  return cur ? updateRec<PluginData>(tenantId, 'plugin', cur.id, data) : createRec<PluginData>(tenantId, 'plugin', type, data);
}

/** A new inbound token, shown once. Only its hash and last four characters are kept. */
export async function issueInboundToken(tenantId: string): Promise<string> {
  const token = `bgk_${crypto.randomBytes(24).toString('base64url')}`;
  const cur = await getPlugin(tenantId, 'inbound_api');
  const data: PluginData = { type: 'inbound_api', enabled: true, config: { token_hash: sha256(token), token_last4: last4(token), issued_at: new Date().toISOString() }, last_delivery: cur?.data.last_delivery ?? null };
  if (cur) await updateRec<PluginData>(tenantId, 'plugin', cur.id, data);
  else await createRec<PluginData>(tenantId, 'plugin', 'inbound_api', data);
  return token;
}

/** Which workspace a public API token belongs to, or null. Matches on the hash only. */
export async function findTenantByInboundToken(token: string): Promise<string | null> {
  const t = String(token || '').trim();
  if (!/^bgk_[A-Za-z0-9_-]{20,}$/.test(t)) return null;
  const { data } = await db.from('master_data').select('tenant_id, metadata')
    .eq('category', 'plugin')
    .contains('metadata', { type: 'inbound_api', enabled: true, config: { token_hash: sha256(t) } })
    .limit(1);
  return data?.[0]?.tenant_id || null;
}

/* ---------------------------------------------------------------- delivery */

async function quoteSummary(tenantId: string, quoteId?: string | null) {
  if (!quoteId) return null;
  // custom_metadata can hold inline attachments (megabytes): read only the two sections needed
  const { data: row } = await db.from('quotations')
    .select('id, qn_number, status, created_by_email, ci:custom_metadata->"Client Information", qd:custom_metadata->"Quote Details", clients(company_name), quotation_items(quantity, item_rate, item_br)')
    .eq('tenant_id', tenantId).eq('id', quoteId).maybeSingle();
  if (!row) return null;
  const q: any = { ...row, custom_metadata: { 'Client Information': (row as any).ci || {}, 'Quote Details': (row as any).qd || {} } };
  return { id: q.id, qn: q.qn_number, status: q.status, client: clientName(q) || null, amount: quoteValue(q) || 0, owner: q.created_by_email || null };
}

async function workspaceName(tenantId: string) {
  const { data } = await db.from('tenants').select('company_name').eq('id', tenantId).maybeSingle();
  return data?.company_name || '';
}

const EVENT_VERB: Record<string, string> = {
  'quote.created': 'was created', 'quote.updated': 'was edited', 'log.added': 'got a log entry',
  'email.received': 'got a client email', 'comment.added': 'got a team note', 'task.completed': 'had a task completed',
  'quote.quiet': 'has gone quiet', 'quote.due': 'is due a follow-up', 'schedule.daily': 'daily run',
};

/** "QN-2026-014 · Vardhman Textiles moved Inquiry → Approved by priya@acme.com" */
export function slackLine(ev: PlatformEvent, quote: Awaited<ReturnType<typeof quoteSummary>>) {
  const head = quote ? `${quote.qn}${quote.client ? ` · ${quote.client}` : ''}` : 'Bloomgard';
  const by = ev.actorEmail ? ` by ${ev.actorEmail}` : '';
  if (ev.type === 'quote.status_changed') {
    const from = ev.data?.from || ev.data?.old_status, to = ev.data?.to || ev.data?.new_status || quote?.status;
    return `${head} moved ${from ? `${from} → ` : 'to '}${to}${by}`;
  }
  if (ev.type === 'test' as any) return `Test from Bloomgard${by}. This channel will get your workspace's updates.`;
  return `${head} ${EVENT_VERB[ev.type] || ev.type}${by}`;
}

async function post(url: string, body: string, headers: Record<string, string>) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const res = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Bloomgard-Webhooks/1', ...headers }, signal: ac.signal });
    return { ok: res.ok, status: res.status, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, status: undefined, error: e?.name === 'AbortError' ? 'Timed out after 5 seconds' : (e?.message || 'Could not connect') };
  } finally { clearTimeout(timer); }
}

async function deliverOne(p: Rec<PluginData>, ev: PlatformEvent, quote: any, wsName: string, extraText?: string) {
  const cfg = p.data.config || {};
  if (!cfg.url) return { ok: false, detail: 'No URL configured.' };
  let out;
  if (p.data.type === 'webhook') {
    const body = JSON.stringify({ event: ev.type, workspace: { id: ev.tenantId, name: wsName }, quote, data: { ...(ev.data || {}), ...(extraText ? { text: extraText } : {}) }, actor: ev.actorEmail || null, sent_at: new Date().toISOString() });
    const sig = crypto.createHmac('sha256', String(cfg.secret || '')).update(body).digest('hex');
    out = await post(cfg.url, body, { 'X-Bloomgard-Signature': `sha256=${sig}`, 'X-Bloomgard-Event': ev.type });
  } else {
    out = await post(cfg.url, JSON.stringify({ text: extraText || slackLine(ev, quote) }), {});
  }
  await updateRec<PluginData>(p.tenant_id, 'plugin', p.id, { last_delivery: { at: new Date().toISOString(), ok: out.ok, status: out.status, error: out.error } }).catch(() => {});
  return { ok: out.ok, detail: out.ok ? `Delivered (HTTP ${out.status}).` : `Failed: ${out.error}` };
}

/** Send the event to every enabled webhook / Slack plugin subscribed to it. Returns deliveries made. */
export async function deliverToPlugins(ev: PlatformEvent): Promise<number> {
  const all = await listPlugins(ev.tenantId);
  const targets = all.filter((p) => p.data.enabled && (p.data.type === 'webhook' || p.data.type === 'slack')
    && (p.data.events || DEFAULT_EVENTS).includes(ev.type));
  if (!targets.length) return 0;
  const [quote, wsName] = await Promise.all([quoteSummary(ev.tenantId, ev.quoteId), workspaceName(ev.tenantId)]);
  const results = await Promise.all(targets.map((p) => deliverOne(p, ev, quote, wsName)));
  return results.filter((r) => r.ok).length;
}

/** A workflow's "post to Slack" / "call webhook" step: send one message through an enabled plugin. */
export async function sendPluginMessage(
  tenantId: string,
  type: 'webhook' | 'slack',
  message: { text: string; event?: PlatformEvent; data?: any },
): Promise<{ ok: boolean; detail: string }> {
  const p = await getPlugin(tenantId, type);
  if (!p || !p.data.enabled) return { ok: false, detail: `${type === 'slack' ? 'Slack' : 'Webhook'} is not switched on in Plugins.` };
  const ev: PlatformEvent = message.event || { type: 'schedule.daily', tenantId };
  const [quote, wsName] = await Promise.all([quoteSummary(tenantId, ev.quoteId), workspaceName(tenantId)]);
  return deliverOne(p, { ...ev, data: { ...(ev.data || {}), ...(message.data || {}) } }, quote, wsName, message.text);
}

/** Plugins → Test: one sample delivery, whatever the event filter says. */
export async function testPlugin(tenantId: string, type: PluginType, actorEmail: string) {
  if (type !== 'webhook' && type !== 'slack') throw new Error('Only Webhook and Slack can be tested.');
  const p = await getPlugin(tenantId, type);
  if (!p?.data.config?.url) throw new Error('Add the URL and save first.');
  const wsName = await workspaceName(tenantId);
  const ev: PlatformEvent = { type: 'test' as any, tenantId, actorEmail, data: { test: true } };
  return deliverOne(p, ev, null, wsName, type === 'slack' ? slackLine(ev, null) : undefined);
}
