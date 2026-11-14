import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { ENV, protectionHeaders, runTag } from '../helpers/env';
import { makeQuote, seedCatalogue, snapshotProfile, TestQuote } from '../helpers/fixtures';
import { userToken, authed, ask } from '../helpers/agent';

/**
 * The Bloomgard AI command centre: authentication, the overview numbers, confirmed actions
 * (which must re-validate on the server), and the tool-using chat itself.
 */
test.describe.serial('Bloomgard AI agent', () => {
  let actor: Actor; let tag: string; let token: string;
  const cleanup = new Cleanup();
  let q: TestQuote;
  const code = () => `E2E-${tag.toUpperCase()}-AG`;

  test.beforeAll(async ({ request }) => {
    actor = await resolveActor(); tag = runTag(); token = await userToken();
    await snapshotProfile(actor, cleanup);
    await seedCatalogue(request, actor, cleanup, [[code(), `E2E Gadget ${tag}`, 'BOX', '120.00']]);
    q = await makeQuote(actor, cleanup, `${tag}-ag`, { status: 'Inquiry' });
  });
  test.afterAll(async () => { await cleanup.run(); });

  test('every agent endpoint refuses a caller without a valid session', async ({ request }) => {
    for (const path of ['/api/agent/chat', '/api/agent/execute']) {
      const res = await request.post(`${ENV.baseUrl}${path}`, { headers: { ...protectionHeaders(), 'Content-Type': 'application/json' }, data: { messages: [{ role: 'user', content: 'hi' }] } });
      expect(res.status(), path).toBe(401);
    }
    const ov = await request.get(`${ENV.baseUrl}/api/agent/overview`, { headers: { ...protectionHeaders(), Authorization: 'Bearer not-a-token' } });
    expect(ov.status()).toBe(401);
  });

  test('overview numbers match the database', async ({ request }) => {
    const res = await request.get(`${ENV.baseUrl}/api/agent/overview`, { headers: authed(token) });
    expect(res.status()).toBe(200);
    const ov = await res.json();
    const { data } = await admin().from('quotations').select('status, created_by_email, created_at, qn_number').eq('tenant_id', actor.tenantId).neq('status', 'Lead').order('created_at', { ascending: false });
    expect(ov.stats.total).toBe((data || []).length); // the E2E user is an admin: the whole workspace
    expect(Object.values(ov.stats.byStatus).reduce((a: number, b: any) => a + b, 0)).toBe(ov.stats.total);
    expect(ov.stats.byStatus.Inquiry).toBe((data || []).filter((r) => r.status === 'Inquiry').length);
    expect(ov.stats.mine).toBe((data || []).filter((r) => r.created_by_email === actor.email).length);
    expect(ov.latest).toHaveLength(Math.min(3, ov.stats.total));
    expect(ov.latest[0].qn).toBe(data![0].qn_number);
    expect(ov.chips.length).toBeGreaterThan(3);
  });

  test('a confirmed status change is applied and audited', async ({ request }) => {
    const res = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'update_quote_status', payload: { qn: q.qn, status: 'Pending', comment: 'e2e' } } });
    expect(res.status(), await res.text()).toBe(200);
    const { data } = await admin().from('quotations').select('status').eq('id', q.id).single();
    expect(data!.status).toBe('Pending');
    const { data: logs } = await admin().from('status_logs').select('old_status, new_status').eq('quotation_id', q.id);
    expect(logs).toContainEqual({ old_status: 'Inquiry', new_status: 'Pending' });
  });

  test('an invalid status or an unknown quote is rejected without touching anything', async ({ request }) => {
    const bad = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'update_quote_status', payload: { qn: q.qn, status: 'Hacked' } } });
    expect(bad.status()).toBe(400);
    const none = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'update_quote_status', payload: { qn: 'QN-0000-000', status: 'Lost' } } });
    expect(none.status()).toBe(400);
    expect((await admin().from('quotations').select('status').eq('id', q.id).single()).data!.status).toBe('Pending');
  });

  test('a confirmed catalogue edit changes only that item, and unknown items are refused', async ({ request }) => {
    const ok = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'update_master_item', payload: { item_code: code(), field: 'item_rate', new_value: '135.50' } } });
    expect(ok.status(), await ok.text()).toBe(200);
    const { data: entries } = await admin().from('master_data_entries').select('id, key_name').eq('tenant_id', actor.tenantId);
    const rate = entries!.find((e) => e.key_name === 'item_rate')!;
    const { data: vals } = await admin().from('master_data_values').select('value_text').eq('entry_id', rate.id).eq('value_text', '135.50');
    expect(vals!.length).toBe(1);
    const miss = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'update_master_item', payload: { item_code: 'NOPE-404', field: 'item_rate', new_value: '1' } } });
    expect(miss.status()).toBe(400);
    expect((await miss.json()).error).toMatch(/no catalogue item/i);
  });

  test('profile settings change, but privileged or unknown fields are refused', async ({ request }) => {
    const ok = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'update_settings', payload: { scope: 'profile', changes: { job_title: `Tester ${tag}` } } } });
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await admin().from('profiles').select('job_title').eq('id', actor.userId).single()).data!.job_title).toBe(`Tester ${tag}`);

    const before = (await admin().from('profiles').select('role, tenant_id').eq('id', actor.userId).single()).data!;
    for (const changes of [{ role: 'super_admin' }, { tenant_id: crypto.randomUUID() }, { inbound_email: 'someone@elsewhere.com' }]) {
      const bad = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'update_settings', payload: { scope: 'profile', changes } } });
      expect(bad.status(), JSON.stringify(changes)).toBe(400);
    }
    expect((await admin().from('profiles').select('role, tenant_id').eq('id', actor.userId).single()).data).toEqual(before);
  });

  test('an email is validated before it can be sent', async ({ request }) => {
    for (const payload of [{ to: 'not-an-address', subject: 's', body: 'b' }, { to: 'delivered@resend.dev', subject: '', body: 'b' }]) {
      const res = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'send_email', payload } });
      expect(res.status()).toBe(400);
    }
    const unknown = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'drop_database', payload: {} } });
    expect(unknown.status()).toBe(400);
  });

  test('a confirmed email goes out to the dummy mailbox, is logged, and is filed on the quote', async ({ request }) => {
    const subject = `Re: ${q.qn} E2E agent ${tag}`;
    const res = await request.post(`${ENV.baseUrl}/api/agent/execute`, { headers: authed(token), data: { kind: 'send_email', payload: { to: 'delivered@resend.dev', subject, body: 'Hello from the E2E agent test.', quote_qn: q.qn } } });
    expect(res.status(), await res.text()).toBe(200);
    const row = await waitFor(async () => (await admin().from('sent_emails').select('id').eq('tenant_id', actor.tenantId).eq('subject', subject).maybeSingle()).data, 20_000, 1000, 'sent_emails row');
    expect(row).toBeTruthy();
    const convo = ((await admin().from('quotations').select('custom_metadata').eq('id', q.id).single()).data!.custom_metadata as any).agent_conversations || [];
    expect(convo.some((m: any) => m.role === 'agent' && /E2E agent test/.test(m.content))).toBe(true);
    await admin().from('sent_emails').delete().eq('tenant_id', actor.tenantId).eq('subject', subject);
  });

  test('chat: reads the workspace with tools and answers from real data', async ({ request }) => {
    test.setTimeout(150_000);
    const { count } = await admin().from('quotations').select('id', { count: 'exact', head: true }).eq('tenant_id', actor.tenantId).eq('status', 'Pending');
    const out = await ask(request, token, 'How many quotes are in Pending status right now? Answer with the number.');
    expect(out.error).toBeUndefined();
    expect(out.steps.length).toBeGreaterThan(0);
    expect(out.message).toContain(String(count));
  });

  test('chat: grounds a catalogue price in Master Data', async ({ request }) => {
    test.setTimeout(150_000);
    const out = await ask(request, token, `What is the unit and the current rate of catalogue item ${code()}?`);
    expect(out.error).toBeUndefined();
    expect(out.message).toMatch(/135\.5|135\.50/);
    expect(out.message).toMatch(/BOX/i);
  });

  test('chat: a chart request renders live data', async ({ request }) => {
    test.setTimeout(150_000);
    const out = await ask(request, token, 'Show a bar chart of the number of quotes per status.');
    const chart = out.blocks.find((b) => b.type === 'chart');
    expect(chart, JSON.stringify(out.events.slice(-3))).toBeTruthy();
    const total = chart.data.reduce((s: number, d: any) => s + d.value, 0);
    const { count } = await admin().from('quotations').select('id', { count: 'exact', head: true }).eq('tenant_id', actor.tenantId).neq('status', 'Lead');
    expect(total).toBe(count);
  });

  test('chat: write requests only PREPARE an action; nothing changes until it is confirmed', async ({ request }) => {
    test.setTimeout(150_000);
    const out = await ask(request, token, `Mark quote ${q.qn} as Lost.`);
    expect(out.error).toBeUndefined();
    const action = out.actions.find((a) => a.kind === 'update_quote_status');
    expect(action, JSON.stringify(out.events.slice(-4))).toBeTruthy();
    expect(action.payload).toMatchObject({ qn: q.qn, status: 'Lost' });
    expect((await admin().from('quotations').select('status').eq('id', q.id).single()).data!.status).toBe('Pending'); // untouched
  });

  test('chat: an email request is drafted for approval and not sent', async ({ request }) => {
    test.setTimeout(150_000);
    const { count: before } = await admin().from('sent_emails').select('id', { count: 'exact', head: true }).eq('tenant_id', actor.tenantId);
    const out = await ask(request, token, `Email delivered@resend.dev to ask whether they are ready to proceed with ${q.qn}.`);
    const action = out.actions.find((a) => a.kind === 'send_email');
    expect(action, JSON.stringify(out.events.slice(-4))).toBeTruthy();
    expect(action.payload.to).toBe('delivered@resend.dev');
    expect(action.preview).not.toMatch(/\[(your|name|company)/i);
    const { count: after } = await admin().from('sent_emails').select('id', { count: 'exact', head: true }).eq('tenant_id', actor.tenantId);
    expect(after).toBe(before);
  });
});
