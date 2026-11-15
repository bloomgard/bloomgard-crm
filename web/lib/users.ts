import crypto from 'crypto';
import { db } from '@/lib/agent/core';
import { DEFAULT_SCHEMA } from '@/lib/defaultSchema';
import { domainOfEmail, isFreeEmailDomain, ensureRoutingId, startDomainSetup, ensureInboundWebhook } from '@/lib/emailDomain';

export const ROLES = ['agent', 'manager', 'admin'] as const;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** A readable, strong one-time password, e.g. "kora-7Q4mX9-neel". */
export function generatePassword() {
  const words = ['kora', 'neel', 'raat', 'jaali', 'kajal', 'akash', 'sindoor', 'marigold'];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${crypto.randomBytes(5).toString('base64url')}-${pick()}`;
}

/**
 * Create a sign-in for someone in a workspace. Never touches an existing account: an email that is
 * already registered is refused (re-using it would let anyone reset someone else's password).
 */
export async function createWorkspaceUser(o: { tenantId: string; email: string; role: string; fullName?: string; password?: string }) {
  const email = String(o.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error(`"${o.email}" is not a valid email address.`);
  const role = String(o.role || 'agent').toLowerCase();
  if (!(ROLES as readonly string[]).includes(role)) throw new Error(`Role must be one of ${ROLES.join(', ')}.`);
  const password = o.password || generatePassword();
  if (password.length < 8) throw new Error('A password needs at least 8 characters.');

  const { data: taken } = await db.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (taken) throw new Error(`${email} already has a Bloomgard account.`);
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: o.fullName || '' } });
  if (error || !data?.user) throw new Error(/registered|exists/i.test(error?.message || '') ? `${email} already has a Bloomgard account.` : (error?.message || 'Could not create the user.'));
  const userId = data.user.id;
  const { error: pErr } = await db.from('profiles').upsert({
    id: userId, email, tenant_id: o.tenantId, role, full_name: o.fullName || null, inbound_email: `${userId}@inbound.bloomgard.co`,
  }, { onConflict: 'id' });
  if (pErr) { await db.auth.admin.deleteUser(userId).catch(() => {}); throw new Error(pErr.message); }
  return { userId, email, role, password };
}

/** Sign-up: a new workspace with the default form, and its first user as admin. Undone if any step fails. */
export async function provisionWorkspace(o: { companyName: string; fullName: string; email: string; password: string }) {
  const companyName = String(o.companyName || '').trim();
  if (companyName.length < 2) throw new Error('Enter your company name.');
  if (!String(o.fullName || '').trim()) throw new Error('Enter your name.');
  // Workspaces are for organisations: a company email, and one workspace per company domain.
  const email = String(o.email || '').trim().toLowerCase();
  const domain = domainOfEmail(email);
  const allow = (process.env.SIGNUP_ALLOWED_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const personal = isFreeEmailDomain(domain);
  if (personal && !allow.includes(email)) throw new Error(`Please sign up with your company email. ${domain} is a personal email provider.`);
  if (!personal) {
    const [{ data: claimed }, { data: colleague }] = await Promise.all([
      db.from('tenants').select('id').eq('features_jsonb->email_domain->>name', domain).limit(1),
      db.from('profiles').select('id').ilike('email', `%@${domain}`).limit(1),
    ]);
    if ((claimed && claimed.length) || (colleague && colleague.length)) {
      throw new Error(`A Bloomgard workspace for ${domain} already exists. Ask your admin to add you.`);
    }
  }
  const tenantId = crypto.randomUUID();
  const { error: tErr } = await db.from('tenants').insert([{ id: tenantId, company_name: companyName, ai_enabled: true }]);
  if (tErr) throw new Error(tErr.message);
  try {
    const { error: sErr } = await db.from('tenant_schemas').insert([{ tenant_id: tenantId, company_name: companyName, schema_config: DEFAULT_SCHEMA, html_template: '' }]);
    if (sErr) throw new Error(sErr.message);
    const user = await createWorkspaceUser({ tenantId, email: o.email, role: 'admin', fullName: o.fullName.trim(), password: o.password });
    // Email: a routing address straight away, and the company domain registered for sending.
    const routing = await ensureRoutingId(tenantId, companyName);
    const setup = personal ? null : await startDomainSetup(tenantId, domain).catch((e) => ({ name: domain, status: 'error', error: e.message }));
    ensureInboundWebhook().catch(() => {});
    return { tenantId, userId: user.userId, routing: `${routing}@inbound.bloomgard.co`, domain: setup };
  } catch (e) {
    await db.from('tenant_schemas').delete().eq('tenant_id', tenantId);
    await db.from('tenants').delete().eq('id', tenantId);
    throw e;
  }
}
