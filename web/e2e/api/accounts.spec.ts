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
    const email = `e2e-signup-${tag}@e2e-signup.test`;
    const res = await request.post(`${ENV.baseUrl}/api/signup`, { headers: protectionHeaders(), data: { companyName: `E2E Signup Co ${tag}`, fullName: 'Signup Tester', email, password: 'kora-neel-12345' } });
    expect(res.status(), await res.text()).toBe(200);
    const { tenantId } = await res.json();
    made.tenants.push(tenantId);
    const { data: prof } = await admin().from('profiles').select('id, role, tenant_id, full_name').eq('email', email).single();
    made.users.push(prof!.id);
    expect(prof).toMatchObject({ role: 'admin', tenant_id: tenantId, full_name: 'Signup Tester' });
    const { data: sc } = await admin().from('tenant_schemas').select('schema_config').eq('tenant_id', tenantId).single();
    expect((sc!.schema_config as any[]).map((m) => m.title)).toContain('Quote Details');
    const { data: tenant } = await admin().from('tenants').select('company_name').eq('id', tenantId).single();
    expect(tenant!.company_name).toBe(`E2E Signup Co ${tag}`);

    const again = await request.post(`${ENV.baseUrl}/api/signup`, { headers: protectionHeaders(), data: { companyName: 'Dup Co', fullName: 'X', email, password: 'kora-neel-12345' } });
    expect(again.status()).toBe(400);
    expect((await again.json()).error).toMatch(/already has/);
    expect((await request.post(`${ENV.baseUrl}/api/signup`, { headers: protectionHeaders(), data: { companyName: 'Short', fullName: 'X', email: `x-${tag}@e2e-signup.test`, password: 'short' } })).status()).toBe(400);
  });

  test('create-user needs a signed-in Admin/Manager and never resets an existing account', async ({ request }) => {
    const anon = await request.post(`${ENV.baseUrl}/api/create-user`, { headers: { ...protectionHeaders(), 'Content-Type': 'application/json' }, data: { email: `x-${tag}@e2e-signup.test`, password: 'whatever-123', role: 'admin', tenantId: actor.tenantId } });
    expect(anon.status()).toBe(401);
    // the old takeover: an existing email plus a new password
    const takeover = await request.post(`${ENV.baseUrl}/api/create-user`, { headers: authed(token), data: { email: actor.email, password: 'hijack-password-1', role: 'agent' } });
    expect(takeover.status()).toBe(400);
    expect((await takeover.json()).error).toMatch(/already has/);

    const email = `e2e-user-${tag}@e2e-signup.test`;
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
    const email = `e2e-ai-user-${tag}@e2e-signup.test`;
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
