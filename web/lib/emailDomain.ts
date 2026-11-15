import { promises as dns } from 'dns';
import { db } from './agent/core';

/*
 * Company email domain, per workspace.
 *
 *   Sending:  the company's own domain (acme.com) is registered in Resend for sending only. Its records (DKIM on
 *             resend._domainkey, SPF MX + TXT on the "send" subdomain) never touch the root MX, so an existing
 *             Google Workspace / Microsoft 365 mailbox keeps working.
 *   Replies:  every workspace gets a routing address on Bloomgard's receiving domain (acme-steel@inbound.bloomgard.co).
 *             Outgoing mail sets Reply-To to it, so client replies land in the Inbox with no DNS work at all.
 *             Optionally a workspace can receive on its own subdomain (reply.acme.com): a second Resend domain with
 *             receiving enabled and one MX record on that subdomain.
 *   Webhook:  Resend webhooks are account-level, so one email.received webhook serves every workspace; the inbound
 *             handler routes by the address the mail was sent to.
 *
 * State lives in tenants.features_jsonb.email_domain.
 */

export const RESEND_REGION = process.env.RESEND_REGION || 'ap-northeast-1';
const API = 'https://api.resend.com';

const FREE = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com', 'rocketmail.com', 'outlook.com', 'outlook.in',
  'hotmail.com', 'hotmail.co.uk', 'live.com', 'live.in', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me',
  'protonmail.com', 'pm.me', 'zohomail.com', 'zohomail.in', 'zoho.com', 'yandex.com', 'yandex.ru', 'gmx.com', 'gmx.de', 'mail.com',
  'rediffmail.com', 'inbox.com', 'tutanota.com', 'tuta.io', 'hey.com', 'fastmail.com', 'qq.com', '163.com', 'web.de',
]);
export const domainOfEmail = (email: string) => String(email || '').trim().toLowerCase().split('@')[1] || '';
export const isFreeEmailDomain = (domain: string) => FREE.has(domain) || /^(yahoo|hotmail|outlook|live)\.[a-z.]+$/.test(domain);
/** Reserved for docs/tests: never sent to Resend or looked up in DNS. */
export const isTestDomain = (domain: string) => /\.(test|example|invalid|localhost)$/.test(domain);

export type DnsRecord = {
  purpose: string; type: string; name: string; fqdn: string; value: string; priority?: number; ttl?: string;
  status?: string; seen?: boolean | null;
};
export type DomainState = {
  name: string; resend_id?: string; status?: string; region?: string; records?: DnsRecord[];
  reply?: { name: string; resend_id?: string; status?: string; records?: DnsRecord[] } | null;
  sender_local?: string; error?: string; created_at?: string; checked_at?: string; test?: boolean;
};

export async function resend(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY || ''}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.message || `Resend returned ${res.status}`;
    const err: any = new Error(/limit|plan|upgrade|quota/i.test(msg) ? `Resend refused this because of the plan's limits: ${msg}` : msg);
    err.status = res.status;
    throw err;
  }
  return body;
}

const fqdnOf = (name: string, apex: string) => (!name || name === '@' ? apex : name.endsWith(apex) ? name : `${name}.${apex}`);
const toRecords = (records: any[], apex: string): DnsRecord[] => (records || []).map((r) => ({
  purpose: r.record === 'Receiving' ? 'Receiving' : r.record, type: r.type, name: r.name, fqdn: fqdnOf(r.name, apex),
  value: String(r.value), priority: r.priority ?? undefined, ttl: r.ttl, status: r.status,
}));
/** DMARC is not required by Resend but makes mail far less likely to land in spam. */
const dmarcFor = (apex: string): DnsRecord => ({ purpose: 'DMARC (recommended)', type: 'TXT', name: '_dmarc', fqdn: `_dmarc.${apex}`, value: 'v=DMARC1; p=none;', status: 'optional' });

/** Look the record up ourselves, so people see "found at your host" before Resend's own check catches up. */
async function seenInDns(r: DnsRecord): Promise<boolean | null> {
  try {
    if (r.type === 'TXT') {
      const txt = (await dns.resolveTxt(r.fqdn)).map((parts) => parts.join(''));
      if (r.purpose.startsWith('DMARC')) return txt.some((t) => /^v=DMARC1/i.test(t));
      return txt.some((t) => t.replace(/\s+/g, '').includes(r.value.replace(/\s+/g, '').slice(0, 40)));
    }
    if (r.type === 'MX') return (await dns.resolveMx(r.fqdn)).some((m) => m.exchange.toLowerCase().replace(/\.$/, '') === r.value.toLowerCase().replace(/\.$/, ''));
    if (r.type === 'CNAME') return (await dns.resolveCname(r.fqdn)).some((c) => c.toLowerCase().replace(/\.$/, '') === r.value.toLowerCase().replace(/\.$/, ''));
  } catch { return false; }
  return null;
}

const PROVIDERS: Array<[RegExp, string, string]> = [
  [/cloudflare\.com$/, 'Cloudflare', 'DNS → Records → Add record. Turn the orange cloud off (DNS only) for these records. Or use the one-click setup below.'],
  [/domaincontrol\.com$/, 'GoDaddy', 'My Products → Domain → DNS → Add. In "Name" type only the part before your domain (e.g. send).'],
  [/registrar-servers\.com$/, 'Namecheap', 'Domain List → Manage → Advanced DNS → Add new record. "Host" is only the part before your domain.'],
  [/awsdns/, 'Amazon Route 53', 'Hosted zones → your domain → Create record. Paste the full name; wrap TXT values in quotes.'],
  [/googledomains\.com$|google\.com$/, 'Google / Squarespace Domains', 'DNS → Custom records → Manage custom records.'],
  [/dns-parking\.com$|hostinger/, 'Hostinger', 'Domains → DNS / Nameservers → Add record.'],
  [/bigrock|resellerclub|webhostbox/, 'BigRock / ResellerClub', 'Manage DNS → choose the record type tab → Add.'],
  [/zoho/, 'Zoho', 'Domains → DNS Manager → Add record.'],
  [/azure-dns/, 'Azure DNS', 'DNS zone → + Record set.'],
  [/wixdns/, 'Wix', 'Domains → Manage DNS Records.'],
  [/digitalocean\.com$/, 'DigitalOcean', 'Networking → Domains → your domain → Create new record.'],
  [/vercel-dns\.com$/, 'Vercel', 'Domains → your domain → DNS Records.'],
];
export async function dnsHost(apex: string) {
  try {
    const ns = (await dns.resolveNs(apex)).map((n) => n.toLowerCase());
    for (const [re, name, tip] of PROVIDERS) if (ns.some((n) => re.test(n))) return { name, tip, nameservers: ns };
    return { name: 'your DNS host', tip: 'Add each record in your DNS settings. "Host" or "Name" is usually only the part before your domain.', nameservers: ns };
  } catch {
    return { name: 'your DNS host', tip: 'We could not read this domain\'s nameservers yet.', nameservers: [] as string[] };
  }
}

export async function loadState(tenantId: string) {
  const { data } = await db.from('tenants').select('id, company_name, features_jsonb, custom_email_sender, inbound_routing_id').eq('id', tenantId).single();
  return { tenant: data, state: ((data?.features_jsonb || {}) as any).email_domain as DomainState | undefined };
}
export async function saveState(tenantId: string, state: DomainState | null) {
  const { data } = await db.from('tenants').select('features_jsonb').eq('id', tenantId).single();
  const features = { ...((data?.features_jsonb as any) || {}) };
  if (state) features.email_domain = state; else delete features.email_domain;
  const { error } = await db.from('tenants').update({ features_jsonb: features }).eq('id', tenantId);
  if (error) throw new Error(error.message);
}

/** A unique, readable local part on inbound.bloomgard.co for the workspace, e.g. "acme-steel". */
export async function ensureRoutingId(tenantId: string, companyName: string) {
  const { data: t } = await db.from('tenants').select('inbound_routing_id').eq('id', tenantId).single();
  if (t?.inbound_routing_id) return t.inbound_routing_id as string;
  const base = String(companyName || 'workspace').toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|llc|gmbh)\b\.?/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'workspace';
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const { data: clash } = await db.from('tenants').select('id').or(`inbound_routing_id.eq.${slug},routing_slug.eq.${slug}`).maybeSingle();
    const { data: personal } = await db.from('profiles').select('id').ilike('inbound_email', `${slug}@inbound.bloomgard.co`).maybeSingle();
    if (!clash && !personal) {
      await db.from('tenants').update({ inbound_routing_id: slug }).eq('id', tenantId);
      return slug;
    }
  }
  const fallback = `${base}-${tenantId.slice(0, 6)}`;
  await db.from('tenants').update({ inbound_routing_id: fallback }).eq('id', tenantId);
  return fallback;
}

/** One email.received webhook serves every workspace. Create it only if none exists and we know our public URL. */
export async function ensureInboundWebhook() {
  const appUrl = (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  try {
    const list = await resend('/webhooks');
    const has = (list.data || []).some((w: any) => (w.events || []).includes('email.received') && w.status !== 'disabled');
    if (has) return { ok: true, created: false };
    if (!appUrl) return { ok: false, created: false, note: 'No active email.received webhook, and PUBLIC_APP_URL is not set to create one.' };
    await resend('/webhooks', { method: 'POST', body: JSON.stringify({ endpoint: `${appUrl}/api/inbound-email`, events: ['email.received'] }) });
    return { ok: true, created: true };
  } catch (e: any) {
    return { ok: false, created: false, note: e.message };
  }
}

/**
 * A domain that is ALREADY registered with our email provider (set up before this screen existed, or by hand)
 * should show as connected, not offer "Set up". Adopt it for a workspace when the link is not in doubt:
 * the workspace already sends from an address on that domain, or the person asking has an email on it.
 * Never adopt a domain another workspace has claimed.
 */
// Skip asking the provider again for a set of candidates we have just checked and not found.
// Keyed by the candidates themselves, so changing the sender re-checks immediately.
const noMatchUntil = new Map<string, number>();
export async function adoptExistingDomain(tenantId: string, askerEmail?: string): Promise<DomainState | null> {
  const { tenant, state } = await loadState(tenantId);
  if (state) return state;
  const candidates = Array.from(new Set([domainOfEmail(tenant?.custom_email_sender || ''), domainOfEmail(askerEmail || '')]
    .filter((d) => d && !isFreeEmailDomain(d) && !isTestDomain(d) && d !== 'bloomgard.co' && !d.endsWith('.bloomgard.co'))));
  if (!candidates.length) return null;
  const cacheKey = `${tenantId}:${candidates.sort().join(',')}`;
  if ((noMatchUntil.get(cacheKey) || 0) > Date.now()) return null;
  noMatchUntil.set(cacheKey, Date.now() + 10 * 60_000);
  let list: any;
  try { list = await resend('/domains'); } catch { return null; }
  for (const name of candidates) {
    const found = (list.data || []).find((d: any) => String(d.name).toLowerCase() === name);
    if (!found) continue;
    const { data: claimed } = await db.from('tenants').select('id').eq('features_jsonb->email_domain->>name', name).neq('id', tenantId).limit(1);
    if (claimed && claimed.length) continue;
    const full = await resend(`/domains/${found.id}`).catch(() => found);
    const senderOnIt = domainOfEmail(tenant?.custom_email_sender || '') === name;
    const adopted: DomainState = {
      name, resend_id: found.id, status: full.status, region: full.region, records: toRecords(full.records, name),
      sender_local: senderOnIt ? String(tenant!.custom_email_sender).split('@')[0] : undefined,
      created_at: found.created_at || new Date().toISOString(), checked_at: new Date().toISOString(),
    };
    await saveState(tenantId, adopted);
    noMatchUntil.delete(cacheKey);
    return adopted;
  }
  return null;
}

/** Register the sending domain in Resend (or find it if this workspace already did). */
export async function startDomainSetup(tenantId: string, domainName: string) {
  const name = String(domainName || '').trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) throw new Error(`"${domainName}" is not a domain name.`);
  if (isFreeEmailDomain(name)) throw new Error(`${name} is a personal email provider; use your company's own domain.`);
  const { state } = await loadState(tenantId);
  if (state?.name === name && state.resend_id) return state;
  if (isTestDomain(name)) {
    const s: DomainState = { name, test: true, status: 'test_domain', records: [], created_at: new Date().toISOString() };
    await saveState(tenantId, s);
    return s;
  }
  let created: any;
  try {
    created = await resend('/domains', { method: 'POST', body: JSON.stringify({ name, region: RESEND_REGION, capabilities: { sending: 'enabled', receiving: 'disabled' } }) });
  } catch (e: any) {
    if (/registered already/i.test(e.message)) {
      // registered in OUR provider account already (e.g. set up by hand earlier): link it instead of failing
      const list = await resend('/domains').catch(() => ({ data: [] }));
      const found = (list.data || []).find((d: any) => String(d.name).toLowerCase() === name);
      const { data: claimed } = await db.from('tenants').select('id').eq('features_jsonb->email_domain->>name', name).neq('id', tenantId).limit(1);
      if (found && !(claimed && claimed.length)) {
        const full = await resend(`/domains/${found.id}`).catch(() => found);
        const linked: DomainState = { name, resend_id: found.id, status: full.status, region: full.region, records: toRecords(full.records, name), created_at: new Date().toISOString(), checked_at: new Date().toISOString() };
        await saveState(tenantId, linked);
        return linked;
      }
    }
    const s: DomainState = { name, status: 'error', error: /registered already/i.test(e.message) ? `${name} is already registered with our email provider. If it belongs to another Bloomgard workspace, ask its admin; otherwise contact support.` : e.message, created_at: new Date().toISOString() };
    await saveState(tenantId, s);
    return s;
  }
  const full = await resend(`/domains/${created.id}`).catch(() => created);
  const s: DomainState = { name, resend_id: created.id, status: full.status, region: full.region, records: toRecords(full.records, name), created_at: new Date().toISOString() };
  await saveState(tenantId, s);
  return s;
}

/** Ask Resend to verify, read back every record's status, and check DNS ourselves. */
export async function refreshDomain(tenantId: string, triggerVerify = true) {
  const { state } = await loadState(tenantId);
  if (!state?.resend_id) return state;
  const sync = async (id: string, apex: string) => {
    if (triggerVerify) await resend(`/domains/${id}/verify`, { method: 'POST' }).catch(() => {});
    const d = await resend(`/domains/${id}`);
    return { status: d.status, records: toRecords(d.records, apex) };
  };
  const main = await sync(state.resend_id, state.name);
  const next: DomainState = { ...state, ...main, checked_at: new Date().toISOString(), error: undefined };
  if (state.reply?.resend_id) {
    const r = await sync(state.reply.resend_id, state.name);
    next.reply = { ...state.reply, ...r };
  }
  await saveState(tenantId, next);
  return next;
}

/** Records with our own DNS lookups attached, for the settings screen and the AI. */
export async function withDnsChecks(state: DomainState) {
  const attach = async (rs: DnsRecord[] = []) => Promise.all(rs.map(async (r) => ({ ...r, seen: await seenInDns(r) })));
  const records = await attach([...(state.records || []), ...(state.records?.length ? [dmarcFor(state.name)] : [])]);
  const reply = state.reply ? { ...state.reply, records: await attach(state.reply.records) } : null;
  return { ...state, records, reply };
}

/** Optional: receive on reply.<domain> instead of the shared inbound address. Needs one more MX record. */
export async function enableBrandedReplies(tenantId: string) {
  const { state } = await loadState(tenantId);
  if (!state?.name || state.test) throw new Error('Set up your company domain first.');
  if (state.reply?.resend_id) return state;
  const name = `reply.${state.name}`;
  const created = await resend('/domains', { method: 'POST', body: JSON.stringify({ name, region: RESEND_REGION, capabilities: { sending: 'disabled', receiving: 'enabled' } }) });
  const full = await resend(`/domains/${created.id}`).catch(() => created);
  const next: DomainState = { ...state, reply: { name, resend_id: created.id, status: full.status, records: toRecords(full.records, state.name) } };
  await saveState(tenantId, next);
  return next;
}

/** One-click: create the records at Cloudflare with a token the admin pastes. The token is used once, never stored. */
export async function addRecordsAtCloudflare(state: DomainState, token: string) {
  const cf = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) throw new Error(body?.errors?.[0]?.message || `Cloudflare returned ${res.status}`);
    return body;
  };
  const zones = await cf(`/zones?name=${encodeURIComponent(state.name)}`);
  const zone = zones.result?.[0];
  if (!zone) throw new Error(`The token cannot see a Cloudflare zone for ${state.name}. Give it "Zone → DNS → Edit" on that zone.`);
  const wanted = [...(state.records || []), dmarcFor(state.name), ...(state.reply?.records || [])];
  const done: string[] = []; const skipped: string[] = [];
  for (const r of wanted) {
    const existing = await cf(`/zones/${zone.id}/dns_records?type=${r.type}&name=${encodeURIComponent(r.fqdn)}`);
    const same = (existing.result || []).some((x: any) => String(x.content).replace(/"/g, '') === r.value);
    if (same || (r.purpose.startsWith('DMARC') && (existing.result || []).length)) { skipped.push(`${r.type} ${r.fqdn}`); continue; }
    await cf(`/zones/${zone.id}/dns_records`, { method: 'POST', body: JSON.stringify({ type: r.type, name: r.fqdn, content: r.value, ttl: 1, proxied: false, ...(r.type === 'MX' ? { priority: r.priority ?? 10 } : {}) }) });
    done.push(`${r.type} ${r.fqdn}`);
  }
  return { added: done, already_there: skipped };
}

/** Status shown on Home and to the AI. */
export function domainSummary(state?: DomainState) {
  if (!state) return null;
  const recs = (state.records || []).filter((r) => r.status !== 'optional');
  return {
    domain: state.name, status: state.status, test: !!state.test, error: state.error || null,
    verified: recs.filter((r) => r.status === 'verified').length, total: recs.length,
    sender: state.sender_local ? `${state.sender_local}@${state.name}` : null,
  };
}
