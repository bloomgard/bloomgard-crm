import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup } from '../helpers/db';
import { ENV, protectionHeaders, runTag } from '../helpers/env';
import { makeQuote, TestQuote } from '../helpers/fixtures';
import { userToken, authed } from '../helpers/agent';

/**
 * The client link: a quote a client opens in the browser with no login, and answers. The first
 * opening is logged once; accepting moves the quote to the workspace's accepted stage; asking for
 * changes gives the owner a task. A new link retires the old one, and nothing else leaks.
 */
test.describe.serial('Client quote link', () => {
  let actor: Actor; let tag: string; let token: string; let q: TestQuote; let q2: TestQuote;
  const cleanup = new Cleanup();
  const link = (url: string) => url.split('/q/')[1];
  const pub = (t: string) => `${ENV.baseUrl}/api/public/share/${t}`;

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag(); token = await userToken();
    q = await makeQuote(actor, cleanup, `${tag}-share`, { status: 'Inquiry', items: [{ item_code: 'E2E-SH', item_name: `Share item ${tag}`, quantity: 10, uom: 'PCS', item_rate: 250 }] });
    q2 = await makeQuote(actor, cleanup, `${tag}-share2`, { status: 'Inquiry' });
  });
  test.afterAll(async () => {
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'share').in('metadata->>quote_id', [q.id, q2.id]);
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'task').in('metadata->>quote_id', [q.id, q2.id]);
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'notification').like('label', `%${q.qn}%`);
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'notification').like('label', `%${q2.qn}%`);
    await cleanup.run();
  });

  test('only a signed-in owner or manager makes a link, and a bad token shows nothing', async ({ request }) => {
    expect((await request.post(`${ENV.baseUrl}/api/quotes/${q.id}/share`, { headers: protectionHeaders(), data: {} })).status()).toBe(401);
    expect((await request.get(pub('not-a-real-token-at-all-xx'), { headers: protectionHeaders() })).status()).toBe(404);
  });

  test('the client sees the quote; the first opening is logged once; a preview does not count', async ({ request }) => {
    const res = await request.post(`${ENV.baseUrl}/api/quotes/${q.id}/share`, { headers: authed(token), data: {} });
    expect(res.status(), await res.text()).toBe(200);
    const t = link((await res.json()).url);
    const { data: row } = await admin().from('master_data').select('metadata').eq('category', 'share').contains('metadata', { quote_id: q.id }).single();
    expect(JSON.stringify(row!.metadata)).not.toContain(t); // only the hash is stored

    expect((await request.get(`${pub(t)}?preview=1`, { headers: protectionHeaders() })).status()).toBe(200);
    let { data: opened } = await admin().from('status_logs').select('id').eq('quotation_id', q.id).eq('comments', 'The client opened the quote link.');
    expect(opened).toHaveLength(0);

    const view = await request.get(pub(t), { headers: protectionHeaders() });
    const body = await view.json();
    expect(body.qn).toBe(q.qn);
    expect(body.items[0]).toMatchObject({ name: `Share item ${tag}`, qty: 10 });
    expect(body.total).toBe(2500);
    expect(JSON.stringify(body)).not.toMatch(/created_by|tenant_id|agent_conversations/);
    await request.get(pub(t), { headers: protectionHeaders() });
    ({ data: opened } = await admin().from('status_logs').select('id').eq('quotation_id', q.id).eq('comments', 'The client opened the quote link.'));
    expect(opened).toHaveLength(1);
  });

  test('accepting moves the quote to the accepted stage, once, and the owner hears', async ({ request }) => {
    const t = link((await (await request.post(`${ENV.baseUrl}/api/quotes/${q.id}/share`, { headers: authed(token), data: {} })).json()).url);
    expect((await request.post(pub(t), { headers: protectionHeaders(), data: { action: 'accept', name: '' } })).status()).toBe(400);
    const ok = await request.post(pub(t), { headers: protectionHeaders(), data: { action: 'accept', name: `Rohit ${tag}`, note: 'PO follows' } });
    expect(ok.status(), await ok.text()).toBe(200);
    const { moved_to } = await ok.json();
    const { data: quote } = await admin().from('quotations').select('status').eq('id', q.id).single();
    if (moved_to) expect(quote!.status).toBe(moved_to);
    const { data: log } = await admin().from('status_logs').select('changed_by, comments').eq('quotation_id', q.id).like('comments', 'Accepted%');
    expect(log![0]).toMatchObject({ changed_by: `Rohit ${tag} (client, via quote link)`, comments: 'Accepted: PO follows' });
    expect((await request.post(pub(t), { headers: protectionHeaders(), data: { action: 'accept', name: 'Again' } })).status()).toBe(400);
    const { data: notes } = await admin().from('master_data').select('label').eq('tenant_id', actor.tenantId).eq('category', 'notification').like('label', `%accepted ${q.qn}%`);
    expect(notes!.length).toBeGreaterThan(0);
  });

  test('asking for changes keeps the status, gives the owner a task, and a new link retires the old', async ({ request }) => {
    const first = link((await (await request.post(`${ENV.baseUrl}/api/quotes/${q2.id}/share`, { headers: authed(token), data: {} })).json()).url);
    const t = link((await (await request.post(`${ENV.baseUrl}/api/quotes/${q2.id}/share`, { headers: authed(token), data: {} })).json()).url);
    expect((await request.get(pub(first), { headers: protectionHeaders() })).status()).toBe(404);
    const res = await request.post(pub(t), { headers: protectionHeaders(), data: { action: 'changes', name: `Asha ${tag}`, note: 'Need 60 days credit' } });
    expect(res.status(), await res.text()).toBe(200);
    expect((await admin().from('quotations').select('status').eq('id', q2.id).single()).data!.status).toBe('Inquiry');
    const { data: tasks } = await admin().from('master_data').select('label, metadata').eq('tenant_id', actor.tenantId).eq('category', 'task').contains('metadata', { quote_id: q2.id });
    expect(tasks!.some((x: any) => /client asked for changes/.test(x.label) && x.metadata.note === 'Need 60 days credit')).toBe(true);
  });
});
