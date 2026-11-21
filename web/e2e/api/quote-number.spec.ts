import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import { admin, resolveActor, Actor } from '../helpers/db';
import { ENV, runTag, protectionHeaders } from '../helpers/env';
import { createClient } from '@supabase/supabase-js';

async function userToken() {
  const c = createClient(ENV.supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: ENV.email, password: ENV.password });
  if (error || !data.session) throw new Error(`sign in: ${error?.message}`);
  return data.session.access_token;
}
const authed = (token: string) => ({ ...protectionHeaders(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

/**
 * Quote numbers come from the server and never repeat: two people saving at once, or an old tab,
 * must not produce two quotes with the same number. The earlier quote keeps it; the later one moves.
 */
test.describe.serial('Quote numbers', () => {
  let actor: Actor; let token: string; let tag: string;
  const made: string[] = [];
  const url = `${ENV.baseUrl}/api/quotes/number`;

  test.beforeAll(async () => { actor = await resolveActor(); token = await userToken(); tag = runTag(); });
  test.afterAll(async () => { if (made.length) await admin().from('quotations').delete().in('id', made); });

  const insert = async (qn: string, createdAt: string) => {
    const id = crypto.randomUUID(); made.push(id);
    const { error } = await admin().from('quotations').insert({ id, tenant_id: actor.tenantId, qn_number: qn, status: 'Inquiry', date: '2026-11-21', created_by_email: actor.email, created_at: createdAt, custom_metadata: { 'Client Information': { client_name: `QN test ${tag}` } } });
    if (error) throw new Error(error.message);
    return id;
  };

  test('refuses a caller without a session', async ({ request }) => {
    expect((await request.post(url, { headers: { ...protectionHeaders(), 'Content-Type': 'application/json' }, data: { action: 'next' } })).status()).toBe(401);
  });

  test('next is one more than the highest number in the whole workspace, and today is India’s date', async ({ request }) => {
    const { data } = await admin().from('quotations').select('qn_number').eq('tenant_id', actor.tenantId);
    const max = (data || []).reduce((m, r: any) => { const x = String(r.qn_number || '').match(/^QN-\d+-(\d+)/i); return x ? Math.max(m, +x[1]) : m; }, 0);
    const res = await request.post(url, { headers: authed(token), data: { action: 'next' } });
    expect(res.status(), await res.text()).toBe(200);
    const out = await res.json();
    expect(out.qn).toBe(`QN-${new Date().getFullYear()}-${String(max + 1).padStart(3, '0')}`);
    expect(out.today).toBe(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
  });

  test('a clash is settled: the earlier quote keeps the number, the later one gets the next free one', async ({ request }) => {
    const n = (await (await request.post(url, { headers: authed(token), data: { action: 'next' } })).json()).qn;
    const first = await insert(n, '2026-11-21T05:00:00Z');
    const second = await insert(n, '2026-11-21T05:00:03Z');

    const s1 = await (await request.post(url, { headers: authed(token), data: { action: 'settle', quote_id: first } })).json();
    expect(s1).toMatchObject({ qn: n, renumbered: false });
    const s2 = await (await request.post(url, { headers: authed(token), data: { action: 'settle', quote_id: second } })).json();
    expect(s2.renumbered).toBe(true);
    expect(s2.was).toBe(n);
    expect(s2.qn).not.toBe(n);
    const { data } = await admin().from('quotations').select('id, qn_number').in('id', [first, second]);
    expect(new Set(data!.map((r: any) => r.qn_number)).size).toBe(2);

    // a revision clash moves to the next free revision, not to a new quote number
    const r1 = await insert(`${n}-Rev-1`, '2026-11-21T06:00:00Z');
    const r2 = await insert(`${n}-Rev-1`, '2026-11-21T06:00:02Z');
    const s3 = await (await request.post(url, { headers: authed(token), data: { action: 'settle', quote_id: r2 } })).json();
    expect(s3.qn).toBe(`${n}-Rev-2`);
    expect((await (await request.post(url, { headers: authed(token), data: { action: 'settle', quote_id: r1 } })).json()).qn).toBe(`${n}-Rev-1`);
  });

  test('another workspace’s quote cannot be touched', async ({ request }) => {
    const res = await request.post(url, { headers: authed(token), data: { action: 'settle', quote_id: crypto.randomUUID() } });
    expect(res.status()).toBe(400);
  });
});
