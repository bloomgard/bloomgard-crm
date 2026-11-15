import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor } from '../helpers/db';
import { ENV, protectionHeaders, runTag } from '../helpers/env';
import { userToken, authed } from '../helpers/agent';

/**
 * Accounts: public sign-up (new workspace, its creator as admin), and the user routes, which must only
 * ever act for a signed-in Admin/Manager inside their own workspace and never take over an existing account.
 */
test.describe.serial('Accounts and users', () => {
  let actor: Actor; let tag: string; let token: string;
  const made: { users: string[]; tenants: string[] } = { users: [], tenants: [] };

  test.beforeAll(async () => { actor = await resolveActor(); tag = runTag(); token = await userToken(); });
  test.afterAll(async () => {
    for (const id of made.users) { await admin().from('profiles').delete().eq('id', id); await admin().auth.admin.deleteUser(id).catch(() => {}); }
    for (const t of made.tenants) { await admin().from('tenant_schemas').delete().eq('tenant_id', t); await admin().from('tenants').delete().eq('id', t); }
  });

  test('sign-up creates a workspace with the default form and makes the person its admin', async ({ request }) => {
    const email = `e2e-signup-${tag}@e2e-${tag}.test`;
    const res = await request.post(`${ENV.baseUrl}/api/signup`, { headers: protectionHeaders(), data: { companyName: `E2E Signup Co ${tag}`, fullName: 'Signup Tester', email, password: 'kora-neel-12345' } });
    expect(res.status(), await res.text()).toBe(200);
    const { tenantId } = await res.json();
    made.tenants.push(tenantId);
    const { data: prof } = await admin().from('profiles').select('id, role, tenant_id, full_name').eq('email', email).single();
    made.users.push(prof!.id);
    expect(prof).toMatchObject({ role: 'admin', tenant_id: tenantId, full_name: 'Signup Tester' });
    const { data: sc } = await admin().from('tenant_schemas').select('schema_config').eq('tenant_id', tenantId).single();
    expect((sc!.schema_config as any[]).map((m) => m.title)).toContain('Quote Details');
    const { data: tenant } = await admin().from('tenants').select('company_name, inbound_routing_id, features_jsonb').eq('id', tenantId).single();
    expect(tenant!.company_name).toBe(`E2E Signup Co ${tag}`);
    expect(tenant!.inbound_routing_id).toMatch(/^e2e-signup-/); // its own routing address on inbound.bloomgard.co
    expect((tenant!.features_jsonb as any).email_domain).toMatchObject({ name: `e2e-${tag}.test`, test: true }); // reserved domain: never sent to Resend

    const again = await request.post(`${ENV.baseUrl}/api/signup`, { headers: protectionHeaders(), data: { companyName: 'Dup Co', fullName: 'X', email: `someone-else@e2e-${tag}.test`, password: 'kora-neel-12345' } });
    expect(again.status()).toBe(400);
    expect((await again.json()).error).toMatch(/already exists. Ask your admin/); // one workspace per company domain
    expect((await request.post(`${ENV.baseUrl}/api/signup`, { headers: protectionHeaders(), data: { companyName: 'Short', fullName: 'X', email: `x-${tag}@e2e-${tag}.test`, password: 'short' } })).status()).toBe(400);
  });

  test('sign-up is for organisations: personal email providers are refused', async ({ request }) => {
    for (const email of [`someone.${tag}@gmail.com`, `someone.${tag}@outlook.com`, `someone.${tag}@yahoo.co.in`]) {
      const res = await request.post(`${ENV.baseUrl}/api/signup`, { headers: protectionHeaders(), data: { companyName: 'Personal Co', fullName: 'X', email, password: 'kora-neel-12345' } });
      expect(res.status(), email).toBe(400);
      expect((await res.json()).error).toMatch(/company email/);
    }
  });

  test('email domain API: shows the routing address, refuses personal domains and an unverified sender', async ({ request }) => {
    const res = await request.get(`${ENV.baseUrl}/api/email-domain`, { headers: authed(token) });
    expect(res.status(), await res.text()).toBe(200);
    const v = await res.json();
    expect(v.routing_address).toMatch(/@inbound\.bloomgard\.co$/);
    expect(v.can_manage).toBe(true);
    const anon = await request.get(`${ENV.baseUrl}/api/email-domain`, { headers: protectionHeaders() });
    expect(anon.status()).toBe(401);
    if (!v.domain) {
      const free = await request.post(`${ENV.baseUrl}/api/email-domain`, { headers: authed(token), data: { action: 'create', domain: 'gmail.com' } });
      expect(free.status()).toBe(400);
      expect((await free.json()).error).toMatch(/personal email provider/);
      const sender = await request.post(`${ENV.baseUrl}/api/email-domain`, { headers: authed(token), data: { action: 'set_sender', local: 'sales' } });
      expect(sender.status()).toBe(400);
    }
  });

  test('mail to a workspace\'s branded reply subdomain is routed to that workspace', async ({ request }) => {
    const { data: t } = await admin().from('tenants').select('features_jsonb').eq('id', actor.tenantId).single();
    const before = t!.features_jsonb;
    const replyDomain = `reply.e2e-${tag}.test`;
    try {
      await admin().from('tenants').update({ features_jsonb: { ...(before as any || {}), email_domain: { name: `e2e-${tag}.test`, test: true, reply: { name: replyDomain, status: 'verified' } } } }).eq('id', actor.tenantId);
      const subject = `E2E branded reply ${tag}`;
      const res = await request.post(`${ENV.baseUrl}/api/inbound-email`, { headers: { ...protectionHeaders(), 'Content-Type': 'application/json' }, data: { type: 'email.received', data: { from: `buyer-${tag}@e2e-buyer.test`, to: [`sales@${replyDomain}`], subject, text: 'hello' } } });
      expect(res.status(), await res.text()).toBe(200);
      const { data: rows } = await admin().from('inbound_emails').select('tenant_id').eq('subject', subject);
      expect(rows?.[0]?.tenant_id).toBe(actor.tenantId);
      await admin().from('inbound_emails').delete().eq('subject', subject);
    } finally {
      await admin().from('tenants').update({ features_jsonb: before }).eq('id', actor.tenantId);
    }
  });

  test('the same inbound email delivered twice (two webhooks) is filed once', async ({ request }) => {
    const subject = `E2E dedupe ${tag}`;
    const body = { type: 'email.received', data: { from: `dup-${tag}@e2e-buyer.test`, to: [`${actor.tenant.inbound_routing_id}@inbound.bloomgard.co`], subject, text: 'once', message_id: `<dedupe-${tag}@e2e.test>` } };
    for (let i = 0; i < 2; i++) {
      const res = await request.post(`${ENV.baseUrl}/api/inbound-email`, { headers: { ...protectionHeaders(), 'Content-Type': 'application/json' }, data: body });
      expect(res.status()).toBe(200);
    }
    const { data } = await admin().from('inbound_emails').select('id').eq('subject', subject);
    expect(data).toHaveLength(1);
    await admin().from('inbound_emails').delete().eq('subject', subject);
  });

  test('create-user needs a signed-in Admin/Manager and never resets an existing account', async ({ request }) => {
    const anon = await request.post(`${ENV.baseUrl}/api/create-user`, { headers: { ...protectionHeaders(), 'Content-Type': 'application/json' }, data: { email: `x-${tag}@e2e-${tag}.test`, password: 'whatever-123', role: 'admin', tenantId: actor.tenantId } });
    expect(anon.status()).toBe(401);
    // the old takeover: an existing email plus a new password
    const takeover = await request.post(`${ENV.baseUrl}/api/create-user`, { headers: authed(token), data: { email: actor.email, password: 'hijack-password-1', role: 'agent' } });
    expect(takeover.status()).toBe(400);
    expect((await takeover.json()).error).toMatch(/already has/);

    const email = `e2e-user-${tag}@e2e-${tag}.test`;
    const ok = await request.post(`${ENV.baseUrl}/api/create-user`, { headers: authed(token), data: { email, role: 'agent', tenantId: crypto.randomUUID() } });
    expect(ok.status(), await ok.text()).toBe(200);
    const out = await ok.json();
    made.users.push(out.userId);
    expect(out.password.length).toBeGreaterThanOrEqual(12);
    const { data: prof } = await admin().from('profiles').select('tenant_id, role').eq('id', out.userId).single();
    expect(prof).toEqual({ tenant_id: actor.tenantId, role: 'agent' }); // the session decides the workspace, not the body
  });

  test('reset-password needs a session and stays inside the workspace', async ({ request }) => {
    const anon = await request.post(`${ENV.baseUrl}/api/reset-password`, { headers: { ...protectionHeaders(), 'Content-Type': 'application/json' }, data: { userId: made.users[1], tenantId: actor.tenantId, requesterId: actor.userId } });
    expect(anon.status()).toBe(401);
    const other = await request.post(`${ENV.baseUrl}/api/reset-password`, { headers: authed(token), data: { userId: made.users[0] } }); // the sign-up admin, another workspace
    expect(other.status()).toBe(404);
    const ok = await request.post(`${ENV.baseUrl}/api/reset-password`, { headers: authed(token), data: { userId: made.users[1] } });
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await ok.json()).newPassword.length).toBeGreaterThanOrEqual(12);
  });

  test('the AI can add a user (password returned once) and change the quote form', async ({ request }) => {
    const email = `e2e-ai-user-${tag}@e2e-${tag}.test`;
    const res = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'add_user', payload: { email, role: 'manager', full_name: 'AI Added' } } });
    expect(res.status(), await res.text()).toBe(200);
    const out = await res.json();
    expect(out.secret.length).toBeGreaterThanOrEqual(12);
    expect(out.message).not.toContain(out.secret);
    const { data: prof } = await admin().from('profiles').select('id, role, tenant_id').eq('email', email).single();
    made.users.push(prof!.id);
    expect(prof).toMatchObject({ role: 'manager', tenant_id: actor.tenantId });

    const before = (await admin().from('tenant_schemas').select('schema_config').eq('tenant_id', actor.tenantId).single()).data!.schema_config as any[];
    try {
      const mod = `E2E Visit Log ${tag}`;
      const change = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'change_form', payload: { operations: [
        { op: 'add_module', module: mod, is_log: true, fields: [{ label: 'Visit type', type: 'dropdown', options: 'Site, Office' }, { label: 'Notes', type: 'paragraph' }] },
        { op: 'add_field', module: mod, label: 'Met with', type: 'text' },
        { op: 'update_field', module: mod, key: 'notes', label: 'Visit notes' },
        { op: 'delete_field', module: mod, key: 'met_with' },
      ] } } });
      expect(change.status(), await change.text()).toBe(200);
      const after = (await admin().from('tenant_schemas').select('schema_config').eq('tenant_id', actor.tenantId).single()).data!.schema_config as any[];
      const m = after.find((x) => x.title === mod);
      expect(m).toMatchObject({ is_log: true });
      expect(m.fields.map((f: any) => [f.name, f.label, f.type])).toEqual([['visit_type', 'Visit type', 'dropdown'], ['notes', 'Visit notes', 'paragraph']]);
      // AI, agent and branding settings are untouched
      expect(after.filter((x) => x.is_ai_settings || x.is_agent_config || x.is_branding)).toEqual(before.filter((x) => x.is_ai_settings || x.is_agent_config || x.is_branding));

      const bad = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'change_form', payload: { operations: [{ op: 'add_field', module: mod, label: 'Kind', type: 'dropdown' }] } } });
      expect(bad.status()).toBe(400); // a dropdown without options is refused
    } finally {
      await admin().from('tenant_schemas').update({ schema_config: before }).eq('tenant_id', actor.tenantId);
    }
  });
});
