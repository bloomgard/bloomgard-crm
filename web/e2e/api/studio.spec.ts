import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup } from '../helpers/db';
import { ENV, protectionHeaders, runTag } from '../helpers/env';
import { makeQuote, TestQuote } from '../helpers/fixtures';
import { userToken, authed, ask } from '../helpers/agent';

/**
 * The workspace sandbox (Studio): a change set is a draft that changes nothing; applying it makes
 * every change; rolling it back puts everything back exactly. Plus the health check, saved views and
 * skills, and the AI drafting changes through it. The real form and AI settings are restored after.
 */
test.describe.serial('Studio: the workspace sandbox', () => {
  let actor: Actor; let tag: string; let token: string; let q: TestQuote;
  let formBefore: any[];
  const cleanup = new Cleanup();
  const store = (kind: string) => admin().from('master_data').select('id, label, metadata').eq('tenant_id', actor.tenantId).eq('category', kind);
  const post = (request: any, path: string, data: any) => request.post(`${ENV.baseUrl}${path}`, { headers: authed(token), data });
  const get = (request: any, path: string) => request.get(`${ENV.baseUrl}${path}`, { headers: authed(token) });
  const schema = async () => (await admin().from('tenant_schemas').select('schema_config').eq('tenant_id', actor.tenantId).single()).data!.schema_config as any[];

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag(); token = await userToken();
    formBefore = await schema();
    q = await makeQuote(actor, cleanup, `${tag}-studio`, { status: 'Inquiry' });
  });

  test.afterAll(async () => {
    await admin().from('tenant_schemas').update({ schema_config: formBefore }).eq('tenant_id', actor.tenantId);
    for (const kind of ['changeset', 'workflow', 'view', 'skill']) {
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', kind).like('label', `%${tag}%`);
    }
    await cleanup.run();
  });

  test('every route needs a signed-in user', async ({ request }) => {
    for (const path of ['/api/changesets', '/api/views', '/api/skills', '/api/diagnose']) {
      expect((await request.get(`${ENV.baseUrl}${path}`, { headers: protectionHeaders() })).status(), path).toBe(401);
    }
  });

  test('a draft changes nothing; Apply makes every change; Roll back puts each one back', async ({ request }) => {
    const aiBefore = formBefore.find((m) => m.is_ai_settings) || null;
    const res = await post(request, '/api/changesets', {
      summary: `Studio test ${tag}`,
      changes: [
        { type: 'workflow.upsert', name: `Chase ${tag}`, workflow: { enabled: false, trigger: { type: 'quote.quiet', days: 9 }, conditions: [], actions: [{ type: 'notify', params: { to: 'managers', message: 'Quiet {{qn}}' } }] } },
        { type: 'view.upsert', name: `Big ${tag}`, view: { filters: { min_amount: 500000 }, sort: { key: 'amount', dir: 'desc' }, shared: true } },
        { type: 'skill.upsert', name: `Review ${tag}`, skill: { prompt: 'Summarise the pipeline by stage and flag anything quiet for a week.', shared: true } },
        { type: 'form.ops', operations: [{ op: 'add_module', module: `Visit Log ${tag}`, is_log: true, fields: [{ label: 'Outcome', type: 'dropdown', options: 'Good, Bad' }] }] },
        { type: 'ai_settings.update', changes: { instructions: `Always mention delivery dates ${tag}` } },
      ],
    });
    expect(res.status(), await res.text()).toBe(200);
    const { id, lines } = await res.json();
    expect(lines.length).toBe(5);

    // a draft: nothing live yet
    expect((await store('workflow').like('label', `%${tag}%`)).data).toHaveLength(0);
    expect((await schema()).some((m) => m.title === `Visit Log ${tag}`)).toBe(false);

    const applied = await post(request, `/api/changesets/${id}`, { action: 'apply' });
    expect(applied.status(), await applied.text()).toBe(200);
    expect((await applied.json()).status).toBe('applied');
    expect((await store('workflow').like('label', `%${tag}%`)).data).toHaveLength(1);
    expect((await store('view').like('label', `%${tag}%`)).data).toHaveLength(1);
    expect((await store('skill').like('label', `%${tag}%`)).data).toHaveLength(1);
    const after = await schema();
    expect(after.some((m) => m.title === `Visit Log ${tag}` && m.is_log)).toBe(true);
    expect(after.find((m) => m.is_ai_settings)?.instructions).toBe(`Always mention delivery dates ${tag}`);
    // the special entries (AI settings, agents, branding) survive a form change
    expect(after.filter((m) => m.is_agent_config || m.is_branding).length).toBe(formBefore.filter((m) => m.is_agent_config || m.is_branding).length);

    // applying twice is refused
    expect((await post(request, `/api/changesets/${id}`, { action: 'apply' })).status()).toBe(400);

    const back = await post(request, `/api/changesets/${id}`, { action: 'rollback' });
    expect(back.status(), await back.text()).toBe(200);
    expect((await store('workflow').like('label', `%${tag}%`)).data).toHaveLength(0);
    expect((await store('view').like('label', `%${tag}%`)).data).toHaveLength(0);
    expect((await store('skill').like('label', `%${tag}%`)).data).toHaveLength(0);
    const restored = await schema();
    expect(restored.some((m) => m.title === `Visit Log ${tag}`)).toBe(false);
    expect(restored.find((m) => m.is_ai_settings)?.instructions ?? null).toBe(aiBefore?.instructions ?? null);
  });

  test('a change set that cannot apply in full changes nothing at all', async ({ request }) => {
    // the second change refers to an automation deleted after drafting
    const wf = await post(request, '/api/changesets', { summary: `Doomed ${tag}`, changes: [
      { type: 'workflow.upsert', name: `Temp ${tag}`, workflow: { enabled: false, trigger: { type: 'manual' }, conditions: [], actions: [{ type: 'notify', params: { to: 'managers', message: 'x' } }] } },
    ] });
    const first = await wf.json();
    await post(request, `/api/changesets/${first.id}`, { action: 'apply' });
    const temp = (await store('workflow').like('label', `Temp ${tag}`)).data![0];
    const doomed = await post(request, '/api/changesets', { summary: `Doomed two ${tag}`, changes: [
      { type: 'skill.upsert', name: `Kept? ${tag}`, skill: { prompt: 'Say hello to the team.', shared: true } },
      { type: 'workflow.delete', id: temp.id },
    ] });
    const d = await doomed.json();
    await admin().from('master_data').delete().eq('id', temp.id);
    const res = await post(request, `/api/changesets/${d.id}`, { action: 'apply' });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/Nothing was changed/);
    expect((await store('skill').like('label', `Kept? ${tag}`)).data).toHaveLength(0);
  });

  test('the health check finds a form status out of step, and its fix is undone by Roll back', async ({ request }) => {
    const statusFields = formBefore.filter((m) => !m.is_log && !m.allow_multiple).flatMap((m) => (m.fields || []).filter((f: any) => f.type === 'master_status').map((f: any) => [m.title, f.name]));
    test.skip(!statusFields.length, 'this workspace has no Master Status field');
    const [section, key] = statusFields[0];
    const { data: cur } = await admin().from('quotations').select('custom_metadata').eq('id', q.id).single();
    const stale = { ...(cur!.custom_metadata as any), [section]: { ...((cur!.custom_metadata as any)[section] || {}), [key]: 'Approved' } };
    await admin().from('quotations').update({ custom_metadata: stale }).eq('id', q.id);

    const h = await (await get(request, '/api/diagnose')).json();
    const drift = h.findings.find((f: any) => f.id === 'status_drift');
    expect(drift?.fixable).toBe(true);
    expect(drift.examples.join(' ')).toContain(q.qn);

    const draft = await post(request, '/api/diagnose', { ids: ['status_drift'] });
    expect(draft.status(), await draft.text()).toBe(200);
    const { id } = await draft.json();
    await admin().from('master_data').update({ label: `Fix drift ${tag}` }).eq('id', id);
    expect((await post(request, `/api/changesets/${id}`, { action: 'apply' })).status()).toBe(200);
    const fixed = (await admin().from('quotations').select('custom_metadata').eq('id', q.id).single()).data!.custom_metadata as any;
    expect(fixed[section][key]).toBe('Inquiry');

    expect((await post(request, `/api/changesets/${id}`, { action: 'rollback' })).status()).toBe(200);
    const undone = (await admin().from('quotations').select('custom_metadata').eq('id', q.id).single()).data!.custom_metadata as any;
    expect(undone[section][key]).toBe('Approved');
  });

  test('views and skills: your own straight away, shown to you; deleting needs its owner or a manager', async ({ request }) => {
    const v = await post(request, '/api/views', { name: `Mine ${tag}`, data: { filters: { created_by: 'me', statuses: ['Inquiry'] }, shared: false } });
    expect(v.status(), await v.text()).toBe(200);
    const k = await post(request, '/api/skills', { name: `Brief ${tag}`, data: { prompt: 'Brief me on quotes that moved today.', shared: false } });
    expect(k.status()).toBe(200);
    const views = (await (await get(request, '/api/views')).json()).items;
    expect(views.some((x: any) => x.name === `Mine ${tag}` && x.mine && !x.shared)).toBe(true);
    expect((await post(request, '/api/skills', { name: `Empty ${tag}`, data: { prompt: '' } })).status()).toBe(400);
    const del = await request.delete(`${ENV.baseUrl}/api/views?id=${(await v.json()).id}`, { headers: authed(token) });
    expect(del.status()).toBe(200);
  });

  test('Bloomgard AI drafts in the sandbox and never applies on its own', async ({ request }) => {
    test.setTimeout(150_000);
    const r = await ask(request, token, `Create a skill called "Weekly review ${tag}" that asks you to summarise this week's quote movements. Draft it, do not ask me questions.`);
    expect(r.error, r.error).toBeUndefined();
    const cs = r.blocks.find((b: any) => b.type === 'changeset');
    expect(cs, JSON.stringify(r.steps)).toBeTruthy();
    expect(cs.lines.join(' ')).toMatch(/skill/i);
    // drafted, not live
    expect((await store('skill').like('label', `%Weekly review ${tag}%`)).data).toHaveLength(0);
    const { data: row } = await admin().from('master_data').select('metadata').eq('id', cs.id).single();
    expect((row!.metadata as any).status).toBe('draft');
    await admin().from('master_data').update({ label: `AI draft ${tag}` }).eq('id', cs.id);
  });
});
