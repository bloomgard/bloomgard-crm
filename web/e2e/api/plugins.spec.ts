import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup } from '../helpers/db';
import { ENV, protectionHeaders, runTag } from '../helpers/env';
import { userToken, authed } from '../helpers/agent';

/**
 * Plugins: the catalogue, config validation and redaction, the Inbound API that lets another system
 * create quotes with a private token, and the accounting export. The workspace's own plugin records
 * are snapshotted first and put back afterwards.
 */
test.describe.serial('Plugins', () => {
  let actor: Actor; let tag: string; let token: string;
  let saved: any[] = [];
  const cleanup = new Cleanup();
  const url = (p: string) => `${ENV.baseUrl}${p}`;

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag(); token = await userToken();
    const { data } = await admin().from('master_data').select('*').eq('tenant_id', actor.tenantId).eq('category', 'plugin');
    saved = data || [];
  });
  test.afterAll(async () => {
    await cleanup.run();
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'plugin');
    if (saved.length) await admin().from('master_data').insert(saved);
  });

  test('the catalogue lists every plugin, and WhatsApp and Calls say they need an account', async ({ request }) => {
    const res = await request.get(url('/api/plugins'), { headers: authed(token) });
    expect(res.status(), await res.text()).toBe(200);
    const out = await res.json();
    expect(out.plugins.map((p: any) => p.type)).toEqual(expect.arrayContaining(['webhook', 'slack', 'inbound_api', 'accounting_export', 'whatsapp', 'calls']));
    expect(out.plugins.find((p: any) => p.type === 'whatsapp').needsAccount).toBe(true);
    expect(out.events.length).toBeGreaterThan(3);

    const wa = await request.post(url('/api/plugins'), { headers: authed(token), data: { type: 'whatsapp', enabled: true } });
    expect(wa.status()).toBe(400);
    expect((await wa.json()).error).toMatch(/needs your own account/i);

    const anon = await request.get(url('/api/plugins'), { headers: protectionHeaders() });
    expect(anon.status()).toBe(401);
  });

  test('a webhook needs https, gets a signing secret, and never shows it in full', async ({ request }) => {
    const plain = await request.post(url('/api/plugins'), { headers: authed(token), data: { type: 'webhook', enabled: true, config: { url: 'http://example.com/hook' } } });
    expect(plain.status()).toBe(400);
    expect((await plain.json()).error).toMatch(/https/i);

    const slack = await request.post(url('/api/plugins'), { headers: authed(token), data: { type: 'slack', config: { url: 'https://example.com/not-slack' } } });
    expect(slack.status()).toBe(400);
    expect((await slack.json()).error).toMatch(/hooks\.slack\.com/);

    const ok = await request.post(url('/api/plugins'), { headers: authed(token), data: { type: 'webhook', enabled: false, config: { url: `https://example.com/bloomgard-${tag}` }, events: ['quote.created'] } });
    expect(ok.status(), await ok.text()).toBe(200);
    const plugin = (await ok.json()).plugin;
    expect(plugin.config.url).toBe(`https://example.com/bloomgard-${tag}`);
    expect(plugin.config.secret).toMatch(/^••••.{4}$/);
    expect(plugin.events).toEqual(['quote.created']);

    const { data: raw } = await admin().from('master_data').select('metadata').eq('tenant_id', actor.tenantId).eq('category', 'plugin').contains('metadata', { type: 'webhook' }).single();
    expect(String(raw!.metadata.config.secret)).toMatch(/^bgs_/);

    const list = await (await request.get(url('/api/plugins'), { headers: authed(token) })).json();
    const wh = list.plugins.find((p: any) => p.type === 'webhook');
    expect(JSON.stringify(wh)).not.toContain(raw!.metadata.config.secret);
  });

  test('the Inbound API creates a quote from another system, and refuses a bad token', async ({ request }) => {
    const rot = await request.post(url('/api/plugins'), { headers: authed(token), data: { type: 'inbound_api', action: 'rotate' } });
    expect(rot.status(), await rot.text()).toBe(200);
    const { token: apiToken } = await rot.json();
    expect(apiToken).toMatch(/^bgk_/);

    const list = await (await request.get(url('/api/plugins'), { headers: authed(token) })).json();
    const inbound = list.plugins.find((p: any) => p.type === 'inbound_api');
    expect(inbound.state.enabled).toBe(true);
    expect(JSON.stringify(inbound)).not.toContain(apiToken);
    expect(inbound.state.config.token_last4).toBe(apiToken.slice(-4));

    const bad = await request.post(url('/api/public/quotes'), { headers: { ...protectionHeaders(), Authorization: 'Bearer bgk_not-a-real-token-at-all-xxxxxx' }, data: { client_name: 'X' } });
    expect(bad.status()).toBe(401);
    const missing = await request.post(url('/api/public/quotes'), { headers: { ...protectionHeaders(), Authorization: `Bearer ${apiToken}` }, data: { client_email: 'x@y.test' } });
    expect(missing.status()).toBe(400);

    const client = `E2E Api Co ${tag}`;
    const res = await request.post(url('/api/public/quotes'), {
      headers: { ...protectionHeaders(), Authorization: `Bearer ${apiToken}` },
      data: { client_name: client, client_email: `buyer-${tag}@e2e-buyer.test`, message: `Need samples ${tag}`, items: [{ item_name: `E2E Widget ${tag}`, quantity: 12 }] },
    });
    expect(res.status(), await res.text()).toBe(200);
    const { qn_number, quote_id } = await res.json();
    expect(qn_number).toMatch(/^QN-/);
    cleanup.add(async () => {
      const { data: q } = await admin().from('quotations').select('client_id').eq('id', quote_id).maybeSingle();
      await admin().from('status_logs').delete().eq('quotation_id', quote_id);
      await admin().from('email_threads').delete().eq('quote_id', quote_id);
      await admin().from('quotation_items').delete().eq('quotation_id', quote_id);
      await admin().from('quotations').delete().eq('id', quote_id);
      if (q?.client_id) await admin().from('clients').delete().eq('id', q.client_id);
    });

    const { data: q } = await admin().from('quotations').select('tenant_id, status, custom_metadata').eq('id', quote_id).single();
    expect(q!.tenant_id).toBe(actor.tenantId);
    expect(q!.status).toBe('Inquiry');
    expect(q!.custom_metadata.source).toBe('inbound_api');
    const { data: items } = await admin().from('quotation_items').select('item_name, quantity').eq('quotation_id', quote_id);
    expect(items).toEqual([expect.objectContaining({ item_name: `E2E Widget ${tag}`, quantity: 12 })]);

    // turning it off stops the token working
    await request.post(url('/api/plugins'), { headers: authed(token), data: { type: 'inbound_api', enabled: false } });
    const off = await request.post(url('/api/public/quotes'), { headers: { ...protectionHeaders(), Authorization: `Bearer ${apiToken}` }, data: { client_name: client } });
    expect(off.status()).toBe(401);
  });

  test('the accounting export is a CSV of approved quotes, for managers', async ({ request }) => {
    const res = await request.get(url('/api/plugins/export'), { headers: authed(token) });
    expect(res.status(), await res.text()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/text\/csv/);
    expect(res.headers()['content-disposition']).toMatch(/bloomgard-approved-\d{4}-\d{2}-\d{2}\.csv/);
    const text = await res.text();
    expect(text.replace(/^﻿/, '').split('\r\n')[0]).toBe('Date,Quote No,Client,Contact,Email,Item Code,Item,Qty,Unit,Rate,Line Amount,Quote Subtotal,Status');
    for (const line of text.split('\r\n').slice(1).filter(Boolean)) expect(line.endsWith(',Approved')).toBe(true);

    const badDate = await request.get(url('/api/plugins/export?from=yesterday'), { headers: authed(token) });
    expect(badDate.status()).toBe(400);
    const anon = await request.get(url('/api/plugins/export'), { headers: protectionHeaders() });
    expect(anon.status()).toBe(401);
  });
});
