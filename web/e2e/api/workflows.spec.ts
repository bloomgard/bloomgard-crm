import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { ENV, protectionHeaders, runTag } from '../helpers/env';
import { makeQuote, TestQuote } from '../helpers/fixtures';
import { userToken, authed } from '../helpers/agent';

/**
 * Automations: the rule builder's API, the engine that runs rules on events, and its promises —
 * nothing client-facing is ever sent without an OK, a dry run changes nothing, and two rules that
 * trigger each other do not loop. Every record made here is removed afterwards.
 */
test.describe.serial('Automations (workflows)', () => {
  let actor: Actor; let tag: string; let token: string;
  let q: TestQuote; let quiet: TestQuote;
  let stages: string[] = [];
  const cleanup = new Cleanup();
  const made: string[] = []; // workflow ids

  const store = (kind: string) => admin().from('master_data').select('id, label, metadata, created_at').eq('tenant_id', actor.tenantId).eq('category', kind);
  const post = (request: any, path: string, data: any) => request.post(`${ENV.baseUrl}${path}`, { headers: authed(token), data });

  test.beforeAll(async ({ request }) => {
    actor = await resolveActor(); tag = runTag(); token = await userToken();
    q = await makeQuote(actor, cleanup, `${tag}-wf`, { status: 'Inquiry' });
    quiet = await makeQuote(actor, cleanup, `${tag}-wfq`, { status: 'Inquiry', daysQuiet: 12 });
    const meta = await (await request.get(`${ENV.baseUrl}/api/workflows?meta=1`, { headers: authed(token) })).json();
    stages = (meta.statuses as string[]).filter((s) => s !== 'Lead' && s !== 'Inquiry');
  });

  test.afterAll(async () => {
    for (const id of made) {
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'workflow').eq('id', id);
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'workflow_run').contains('metadata', { workflow_id: id });
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'task').contains('metadata', { source_ref: id });
    }
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'notification').like('label', `%${tag}%`);
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'comment').in('metadata->>quote_id', [q.id, quiet.id]);
    await cleanup.run();
  });

  test('every route needs a signed-in user; the scheduler needs its secret', async ({ request }) => {
    expect((await request.get(`${ENV.baseUrl}/api/workflows`, { headers: protectionHeaders() })).status()).toBe(401);
    expect((await request.post(`${ENV.baseUrl}/api/events`, { headers: protectionHeaders(), data: { type: 'quote.updated', quote_id: q.id } })).status()).toBe(401);
    expect([401, 503]).toContain((await request.get(`${ENV.baseUrl}/api/cron/tick`, { headers: protectionHeaders() })).status());
  });

  test('the builder gets the workspace stages, form fields and ready-made templates', async ({ request }) => {
    const meta = await (await request.get(`${ENV.baseUrl}/api/workflows?meta=1`, { headers: authed(token) })).json();
    expect(meta.statuses.length).toBeGreaterThan(1);
    expect(Array.isArray(meta.fields)).toBe(true);
    expect(meta.templates.map((t: any) => t.id)).toEqual(expect.arrayContaining(['chase-quiet', 'approved-po', 'daily-digest']));
    expect(meta.members.some((m: any) => m.email.toLowerCase() === actor.email.toLowerCase())).toBe(true);
  });

  test('invalid automations are refused with a readable reason', async ({ request }) => {
    const noStep = await post(request, '/api/workflows', { name: `E2E ${tag} bad`, workflow: { trigger: { type: 'quote.created' }, conditions: [], actions: [] } });
    expect(noStep.status()).toBe(400);
    expect((await noStep.json()).error).toMatch(/at least one step/i);
    const badStage = await post(request, '/api/workflows', { name: `E2E ${tag} bad`, workflow: { trigger: { type: 'quote.status_changed', to: `Nope ${tag}` }, conditions: [], actions: [{ type: 'notify', params: { title: 'x' } }] } });
    expect(badStage.status()).toBe(400);
    expect((await badStage.json()).error).toMatch(/not one of this workspace's stages/);
  });

  test('a rule runs on a matching event: it creates the task, notifies, and records the run', async ({ request }) => {
    const target = stages[0];
    const res = await post(request, '/api/workflows', {
      name: `E2E ${tag} on move`,
      workflow: {
        trigger: { type: 'quote.status_changed', to: target },
        conditions: [{ field: 'qn', op: 'eq', value: q.qn }],
        actions: [
          { type: 'create_task', params: { title: `E2E ${tag} follow {{qn}}`, assign_to: 'creator', due_in_days: 2 } },
          { type: 'notify', params: { to: 'creator', title: `E2E ${tag} {{qn}} moved to {{status}}` } },
        ],
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const wf = (await res.json()).workflow;
    made.push(wf.id);
    expect(wf.sentence).toMatch(new RegExp(`When a quote moves to ${target}`));

    await admin().from('quotations').update({ status: target }).eq('id', q.id);
    const ev = await post(request, '/api/events', { type: 'quote.status_changed', quote_id: q.id, data: { from: 'Inquiry', to: target } });
    expect(ev.status(), await ev.text()).toBe(200);
    expect((await ev.json()).workflows).toBe(1);

    const { data: tasks } = await store('task').contains('metadata', { source_ref: wf.id });
    expect(tasks).toHaveLength(1);
    expect(tasks![0].label).toBe(`E2E ${tag} follow ${q.qn}`);
    expect(tasks![0].metadata).toMatchObject({ type: 'todo', status: 'open', quote_id: q.id });
    expect(String(tasks![0].metadata.assigned_email).toLowerCase()).toBe(actor.email.toLowerCase());
    const { data: runs } = await store('workflow_run').contains('metadata', { workflow_id: wf.id });
    expect(runs).toHaveLength(1);
    expect(runs![0].metadata.outcome).toBe('done');
    const { data: notes } = await store('notification').like('label', `E2E ${tag} ${q.qn} moved%`);
    expect(notes!.length).toBeGreaterThanOrEqual(1);

    // an event that does not match the condition does nothing
    const other = await post(request, '/api/events', { type: 'quote.status_changed', quote_id: quiet.id, data: { from: 'Inquiry', to: target } });
    expect((await other.json()).workflows).toBe(0);
  });

  test('emails never go out on their own: even with approval switched off, the step lands on the OK list', async ({ request }) => {
    const res = await post(request, '/api/workflows', {
      name: `E2E ${tag} email`,
      workflow: {
        trigger: { type: 'manual' },
        conditions: [],
        actions: [{ type: 'send_email', params: { to: 'client', subject: `E2E ${tag} {{qn}}`, body: 'Dear {{contact}}, checking in on {{qn}}.' }, approval: false }],
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const wf = (await res.json()).workflow;
    made.push(wf.id);
    expect(wf.actions[0].approval).toBe(true);

    const run = await post(request, `/api/workflows/${wf.id}/run`, { quote_id: q.id });
    expect(run.status(), await run.text()).toBe(200);
    const { data: tasks } = await store('task').contains('metadata', { source_ref: wf.id });
    expect(tasks).toHaveLength(1);
    expect(tasks![0].metadata).toMatchObject({ type: 'approval', status: 'open' });
    expect(tasks![0].metadata.action.kind).toBe('send_email');
    expect(tasks![0].metadata.action.payload.subject).toBe(`E2E ${tag} ${q.qn}`);
    const { data: sent } = await admin().from('sent_emails').select('id').eq('tenant_id', actor.tenantId).eq('subject', `E2E ${tag} ${q.qn}`);
    expect(sent).toHaveLength(0);
  });

  test('a dry run shows what would happen and changes nothing', async ({ request }) => {
    const before = (await store('task')).data!.length;
    const res = await post(request, '/api/workflows/draft/dry-run', {
      name: 'Chase',
      workflow: { trigger: { type: 'quote.quiet', days: 7 }, conditions: [{ field: 'qn', op: 'eq', value: quiet.qn }], actions: [{ type: 'ai_follow_up', params: {} }, { type: 'change_status', params: { status: stages[0] } }] },
    });
    expect(res.status(), await res.text()).toBe(200);
    const out = await res.json();
    expect(out.matched).toBe(1);
    expect(out.samples[0].qn).toBe(quiet.qn);
    expect(out.samples[0].days_quiet).toBeGreaterThanOrEqual(7);
    expect(out.samples[0].steps.every((s: any) => /^Would|No client email/.test(s.detail))).toBe(true);
    expect((await store('task')).data!.length).toBe(before);
    const { data: still } = await admin().from('quotations').select('status').eq('id', quiet.id).single();
    expect(still!.status).toBe('Inquiry');
  });

  test('two rules that trigger each other do not loop', async ({ request }) => {
    test.skip(stages.length < 2, 'needs two stages besides Inquiry');
    const [a, b] = stages;
    const mk = async (name: string, to: string, then: string) => {
      const r = await post(request, '/api/workflows', { name, workflow: { trigger: { type: 'quote.status_changed', to }, conditions: [{ field: 'qn', op: 'eq', value: quiet.qn }], actions: [{ type: 'change_status', params: { status: then } }] } });
      expect(r.status(), await r.text()).toBe(200);
      const wf = (await r.json()).workflow; made.push(wf.id); return wf;
    };
    const wa = await mk(`E2E ${tag} ping`, a, b);
    const wb = await mk(`E2E ${tag} pong`, b, a);
    await admin().from('quotations').update({ status: a }).eq('id', quiet.id);
    const ev = await post(request, '/api/events', { type: 'quote.status_changed', quote_id: quiet.id, data: { from: 'Inquiry', to: a } });
    expect(ev.status(), await ev.text()).toBe(200);
    const runsOf = async (id: string) => (await store('workflow_run').contains('metadata', { workflow_id: id })).data!.length;
    await waitFor(async () => (await runsOf(wa.id)) >= 1, 15_000, 500, 'first rule ran');
    expect(await runsOf(wa.id)).toBe(1);
    expect(await runsOf(wb.id)).toBeLessThanOrEqual(1);
    for (const id of [wa.id, wb.id]) await request.patch(`${ENV.baseUrl}/api/workflows/${id}`, { headers: authed(token), data: { enabled: false } });
  });

  test('the browser can only report its own kinds of event, on quotes in its workspace', async ({ request }) => {
    expect((await post(request, '/api/events', { type: 'email.received', quote_id: q.id })).status()).toBe(400);
    expect((await post(request, '/api/events', { type: 'quote.updated', quote_id: crypto.randomUUID() })).status()).toBe(400);
  });

  test('automations can be switched off, renamed and deleted', async ({ request }) => {
    const id = made[0];
    const off = await request.patch(`${ENV.baseUrl}/api/workflows/${id}`, { headers: authed(token), data: { enabled: false, name: `E2E ${tag} renamed` } });
    expect(off.status(), await off.text()).toBe(200);
    expect((await off.json()).workflow).toMatchObject({ enabled: false, name: `E2E ${tag} renamed` });
    const list = await (await request.get(`${ENV.baseUrl}/api/workflows`, { headers: authed(token) })).json();
    expect(list.workflows.find((w: any) => w.id === id)?.enabled).toBe(false);
    const del = await request.delete(`${ENV.baseUrl}/api/workflows/${id}`, { headers: authed(token) });
    expect(del.status()).toBe(200);
    expect((await request.get(`${ENV.baseUrl}/api/workflows/${id}`, { headers: authed(token) })).status()).toBe(400);
  });
});
