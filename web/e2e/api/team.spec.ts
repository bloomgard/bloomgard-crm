import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { ENV, runTag, protectionHeaders } from '../helpers/env';
import { userToken, authed } from '../helpers/agent';
import { makeQuote, TestQuote } from '../helpers/fixtures';

/**
 * The team platform: the OK list (approvals run exactly what they say, dismissing changes nothing),
 * to-dos and assignment, @mention notes, notifications, the Team page, and that nothing crosses
 * workspaces. Every record it makes is removed afterwards.
 */
test.describe.serial('Team: tasks, approvals, notes and notifications', () => {
  let actor: Actor; let tag: string; let token: string; let q: TestQuote;
  let mate: { id: string; email: string; full_name: string };
  let other: { tenantId: string; quoteId: string } | null = null;
  const cleanup = new Cleanup();
  const url = (p: string) => `${ENV.baseUrl}${p}`;
  const recs = (category: string) => admin().from('master_data').select('id, label, metadata').eq('tenant_id', actor.tenantId).eq('category', category);

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag(); token = await userToken();
    q = await makeQuote(actor, cleanup, `${tag}-team`, { status: 'Inquiry' });

    // a teammate to assign to and mention
    const email = `e2e-mate-${tag}@e2e-${tag}.test`;
    const { data: u, error } = await admin().auth.admin.createUser({ email, password: `kora-${tag}-neel`, email_confirm: true });
    if (error || !u?.user) throw new Error(`teammate: ${error?.message}`);
    mate = { id: u.user.id, email, full_name: `Mira ${tag}` };
    await admin().from('profiles').upsert({ id: mate.id, email, tenant_id: actor.tenantId, role: 'agent', full_name: mate.full_name }, { onConflict: 'id' });
    cleanup.add(async () => { await admin().from('profiles').delete().eq('id', mate.id); await admin().auth.admin.deleteUser(mate.id); });

    // everything this spec's actions leave behind in the platform store
    cleanup.add(async () => {
      const db = admin().from('master_data');
      await db.delete().eq('tenant_id', actor.tenantId).in('category', ['task', 'comment', 'notification', 'workflow_run']).ilike('label', `%${tag}%`);
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).in('category', ['task', 'comment']).contains('metadata', { quote_id: q.id });
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'notification').contains('metadata', { user_id: mate.id });
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'notification').ilike('metadata->>body', `%${tag}%`);
    });
  });
  test.afterAll(async () => {
    if (other) {
      await admin().from('quotations').delete().eq('id', other.quoteId);
      await admin().from('tenants').delete().eq('id', other.tenantId);
    }
    await cleanup.run();
  });

  test('every route refuses a caller without a session', async ({ request }) => {
    for (const p of ['/api/tasks', '/api/notifications', '/api/team?members=1', `/api/comments?quote_id=${q.id}`]) {
      const res = await request.get(url(p), { headers: { ...protectionHeaders(), 'Content-Type': 'application/json' } });
      expect(res.status(), p).toBe(401);
    }
  });

  test('a to-do assigned to a teammate carries the quote and tells them', async ({ request }) => {
    const res = await request.post(url('/api/tasks'), { headers: authed(token), data: { title: `Call the buyer ${tag}`, assigned_to: mate.id, quote_id: q.id, due_at: '2030-01-15' } });
    expect(res.status(), await res.text()).toBe(200);
    const { task } = await res.json();
    expect(task.data).toMatchObject({ type: 'todo', status: 'open', assigned_to: mate.id, assigned_email: mate.email, qn: q.qn, quote_id: q.id, source: 'user' });

    const note = await waitFor(async () => {
      const { data } = await recs('notification').contains('metadata', { user_id: mate.id });
      return (data || []).find((n: any) => String(n.label).includes(`Call the buyer ${tag}`));
    }, 10_000, 500, 'assignment notification');
    expect(note.metadata.link).toMatchObject({ view: 'tasks', task_id: task.id });

    // a nobody gets refused, and an empty title too
    expect((await request.post(url('/api/tasks'), { headers: authed(token), data: { title: `x ${tag}`, assigned_to: 'nobody@nowhere.test' } })).status()).toBe(400);
    expect((await request.post(url('/api/tasks'), { headers: authed(token), data: { title: '  ' } })).status()).toBe(400);

    // marking it done, then reopening it
    const done = await request.post(url(`/api/tasks/${task.id}`), { headers: authed(token), data: { decision: 'done' } });
    expect((await done.json()).task.data.status).toBe('done');
    const again = await request.post(url(`/api/tasks/${task.id}`), { headers: authed(token), data: { decision: 'reopen' } });
    expect((await again.json()).task.data.status).toBe('open');
  });

  test('approving runs the prepared action; dismissing changes nothing', async ({ request }) => {
    const approval = (status: string) => ({
      tenant_id: actor.tenantId, category: 'task', label: `Move ${q.qn} to ${status} ${tag}`,
      metadata: {
        type: 'approval', status: 'open', source: 'workflow', source_label: `Workflow: e2e ${tag}`, quote_id: q.id, qn: q.qn,
        action: { kind: 'update_quote_status', title: 'Change quote status', summary: `${q.qn}: Inquiry → ${status}`, payload: { qn: q.qn, status, comment: `e2e approval ${tag}` } },
      },
    });
    const { data: a1 } = await admin().from('master_data').insert(approval('Pending')).select('id').single();
    const { data: a2 } = await admin().from('master_data').insert(approval('Approved')).select('id').single();

    const list = await (await request.get(url('/api/tasks?status=open'), { headers: authed(token) })).json();
    expect(list.tasks.map((t: any) => t.id)).toEqual(expect.arrayContaining([a1!.id, a2!.id]));
    expect(list.counts.approvals).toBeGreaterThanOrEqual(2);

    const ok = await request.post(url(`/api/tasks/${a1!.id}`), { headers: authed(token), data: { decision: 'approve' } });
    expect(ok.status(), await ok.text()).toBe(200);
    const okBody = await ok.json();
    expect(okBody.task.data).toMatchObject({ status: 'done', decided_by: actor.email });
    expect(okBody.task.data.result).toMatch(/is now Pending/);
    expect((await admin().from('quotations').select('status').eq('id', q.id).single()).data!.status).toBe('Pending');
    const { data: hist } = await admin().from('status_logs').select('old_status, new_status, changed_by, comments').eq('quotation_id', q.id);
    expect(hist).toContainEqual({ old_status: 'Inquiry', new_status: 'Pending', changed_by: actor.email, comments: `e2e approval ${tag}` });

    const no = await request.post(url(`/api/tasks/${a2!.id}`), { headers: authed(token), data: { decision: 'dismiss' } });
    expect((await no.json()).task.data.status).toBe('dismissed');
    expect((await admin().from('quotations').select('status').eq('id', q.id).single()).data!.status).toBe('Pending');

    // a decided task cannot be decided twice, and a bad decision is refused
    expect((await request.post(url(`/api/tasks/${a2!.id}`), { headers: authed(token), data: { decision: 'approve' } })).status()).toBe(400);
    expect((await request.post(url(`/api/tasks/${a1!.id}`), { headers: authed(token), data: { decision: 'explode' } })).status()).toBe(400);

    const closed = await (await request.get(url('/api/tasks?status=closed'), { headers: authed(token) })).json();
    expect(closed.tasks.map((t: any) => t.id)).toEqual(expect.arrayContaining([a1!.id, a2!.id]));
  });

  test('a note that @mentions a teammate notifies them, and stays on the quote', async ({ request }) => {
    const body = `Can you check the freight on this, @${mate.full_name}? ${tag}`;
    const res = await request.post(url('/api/comments'), { headers: authed(token), data: { quote_id: q.id, body } });
    expect(res.status(), await res.text()).toBe(200);
    const { note } = await res.json();
    expect(note.data).toMatchObject({ quote_id: q.id, author_email: actor.email, mentions: [mate.id] });

    const list = await (await request.get(url(`/api/comments?quote_id=${q.id}`), { headers: authed(token) })).json();
    expect(list.notes.map((n: any) => n.data.body)).toContain(body);

    const ping = await waitFor(async () => {
      const { data } = await recs('notification').contains('metadata', { user_id: mate.id });
      return (data || []).find((n: any) => /mentioned you/.test(n.label) && String(n.metadata.body).includes(tag));
    }, 10_000, 500, 'mention notification');
    expect(ping.label).toContain(q.qn);
    expect(ping.metadata.link).toMatchObject({ view: 'pipeline', quote_id: q.id });

    expect((await request.post(url('/api/comments'), { headers: authed(token), data: { quote_id: q.id, body: '   ' } })).status()).toBe(400);
  });

  test('notes and tasks never cross workspaces', async ({ request }) => {
    const tenantId = crypto.randomUUID();
    await admin().from('tenants').insert({ id: tenantId, company_name: `E2E Other ${tag}` });
    const quoteId = crypto.randomUUID();
    await admin().from('quotations').insert({ id: quoteId, tenant_id: tenantId, qn_number: 'QN-9999-998', status: 'Inquiry', custom_metadata: {} });
    other = { tenantId, quoteId };

    expect((await request.get(url(`/api/comments?quote_id=${quoteId}`), { headers: authed(token) })).status()).toBe(400);
    expect((await request.post(url('/api/comments'), { headers: authed(token), data: { quote_id: quoteId, body: `leak ${tag}` } })).status()).toBe(400);
    expect((await request.post(url('/api/tasks'), { headers: authed(token), data: { title: `leak ${tag}`, quote_id: quoteId } })).status()).toBe(400);

    // a task in another workspace cannot be decided from this one
    const { data: foreign } = await admin().from('master_data').insert({ tenant_id: tenantId, category: 'task', label: `foreign ${tag}`, metadata: { type: 'todo', status: 'open', source: 'user' } }).select('id').single();
    expect((await request.post(url(`/api/tasks/${foreign!.id}`), { headers: authed(token), data: { decision: 'done' } })).status()).toBe(400);
    await admin().from('master_data').delete().eq('id', foreign!.id);
  });

  test('notifications are the caller\'s own, and can be marked read', async ({ request }) => {
    const { data: mine } = await admin().from('master_data').insert({
      tenant_id: actor.tenantId, category: 'notification', label: `Ping ${tag}`,
      metadata: { user_id: actor.userId, title: `Ping ${tag}`, body: `e2e ${tag}`, link: { view: 'tasks' }, read_at: null },
    }).select('id').single();
    const got = await (await request.get(url('/api/notifications'), { headers: authed(token) })).json();
    expect(got.notifications.map((n: any) => n.id)).toContain(mine!.id);
    expect(got.notifications.every((n: any) => n.data.user_id === actor.userId)).toBe(true);
    expect(got.unread).toBeGreaterThanOrEqual(1);

    const marked = await request.post(url('/api/notifications'), { headers: authed(token), data: { read: [mine!.id] } });
    expect((await marked.json()).marked).toBe(1);
    const { data: row } = await admin().from('master_data').select('metadata').eq('id', mine!.id).single();
    expect(row!.metadata.read_at).toBeTruthy();
  });

  test('the Team page counts each person\'s quotes and shows recent activity', async ({ request }) => {
    const members = await (await request.get(url('/api/team?members=1'), { headers: authed(token) })).json();
    expect(members.members.map((m: any) => m.id)).toEqual(expect.arrayContaining([actor.userId, mate.id]));

    const res = await request.get(url('/api/team'), { headers: authed(token) });
    if (!['manager', 'admin'].includes(String(actor.role).toLowerCase())) { expect(res.status()).toBe(403); return; }
    expect(res.status(), await res.text()).toBe(200);
    const team = await res.json();
    const me = team.members.find((m: any) => m.id === actor.userId);
    const { count } = await admin().from('quotations').select('id', { count: 'exact', head: true }).eq('tenant_id', actor.tenantId).neq('status', 'Lead').ilike('created_by_email', actor.email);
    expect(me.quotes).toBe(count);
    expect(team.activity.some((a: any) => a.quote_id === q.id)).toBe(true);   // the approval's status move or the note
  });
});
