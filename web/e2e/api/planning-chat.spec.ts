import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup } from '../helpers/db';
import { ENV, runTag, protectionHeaders } from '../helpers/env';
import { userToken, authed } from '../helpers/agent';
import { makeQuote, TestQuote } from '../helpers/fixtures';

/**
 * Team → Planning (boards and cards) and Team → Chat (channels, messages, direct messages,
 * mentions). Everything the spec makes is removed afterwards.
 */
test.describe.serial('Team planning and chat', () => {
  let actor: Actor; let tag: string; let token: string; let q: TestQuote;
  let mate: { id: string; email: string; first: string };
  const cleanup = new Cleanup();
  const url = (p: string) => `${ENV.baseUrl}${p}`;
  const made: string[] = [];   // master_data ids to remove

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag(); token = await userToken();
    q = await makeQuote(actor, cleanup, `${tag}-plan`, { status: 'Inquiry' });
    const email = `e2e-chat-${tag}@e2e-${tag}.test`;
    const { data: u, error } = await admin().auth.admin.createUser({ email, password: `kora-${tag}-neel`, email_confirm: true });
    if (error || !u?.user) throw new Error(`teammate: ${error?.message}`);
    mate = { id: u.user.id, email, first: `Zoya${tag.replace(/[^a-z0-9]/gi, '')}` };
    await admin().from('profiles').upsert({ id: mate.id, email, tenant_id: actor.tenantId, role: 'agent', full_name: `${mate.first} Khan` }, { onConflict: 'id' });
    cleanup.add(async () => { await admin().from('profiles').delete().eq('id', mate.id); await admin().auth.admin.deleteUser(mate.id); });
    cleanup.add(async () => {
      if (made.length) await admin().from('master_data').delete().in('id', made);
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).in('category', ['card', 'message', 'board', 'channel']).ilike('label', `%${tag}%`);
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'notification').contains('metadata', { user_id: mate.id });
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'channel').contains('metadata', { type: 'dm', members: [mate.id] });
    });
  });
  test.afterAll(async () => { await cleanup.run(); });

  const post = (request: any, path: string, data: any) => request.post(url(path), { headers: authed(token), data });

  test('both routes refuse a caller without a session', async ({ request }) => {
    for (const p of ['/api/planning', '/api/chat']) {
      expect((await request.get(url(p), { headers: protectionHeaders() })).status(), p).toBe(401);
      expect((await request.post(url(p), { headers: { ...protectionHeaders(), 'Content-Type': 'application/json' }, data: { action: 'send' } })).status(), p).toBe(401);
    }
  });

  test('a board holds cards that can be assigned, linked to a quote, moved and deleted', async ({ request }) => {
    const b = await post(request, '/api/planning', { action: 'board.create', name: `Fair prep ${tag}`, columns: [{ name: 'Ideas' }, { name: 'Doing' }, { name: 'Done' }] });
    expect(b.status(), await b.text()).toBe(200);
    const boardId = (await b.json()).id; made.push(boardId);

    let r = await request.get(url(`/api/planning?board=${boardId}`), { headers: authed(token) });
    let body = await r.json();
    expect(body.board.columns.map((c: any) => c.name)).toEqual(['Ideas', 'Doing', 'Done']);
    const [ideas, doing] = body.board.columns.map((c: any) => c.id);

    const c1 = await post(request, '/api/planning', { action: 'card.create', board_id: boardId, column: ideas, title: `Book the stall ${tag}`, assignee_id: mate.id, qn: q.qn, due_at: '2030-02-01', labels: ['fair', 'urgent'] });
    expect(c1.status(), await c1.text()).toBe(200);
    const id1 = (await c1.json()).id; made.push(id1);
    const c2 = await post(request, '/api/planning', { action: 'card.create', board_id: boardId, column: ideas, title: `Print brochures ${tag}` });
    const id2 = (await c2.json()).id; made.push(id2);

    body = await (await request.get(url(`/api/planning?board=${boardId}`), { headers: authed(token) })).json();
    const card = body.cards.find((c: any) => c.id === id1);
    expect(card).toMatchObject({ column: ideas, assignee_id: mate.id, assignee_email: mate.email, quote_id: q.id, qn: q.qn, due_at: '2030-02-01', labels: ['fair', 'urgent'], position: 0 });

    // the assignee hears about it
    const { data: notes } = await admin().from('master_data').select('metadata').eq('tenant_id', actor.tenantId).eq('category', 'notification').contains('metadata', { user_id: mate.id });
    expect((notes || []).some((n: any) => n.metadata.link?.sub === `planning:${id1}`)).toBe(true);

    // move the second card above the first, then into another column
    expect((await post(request, '/api/planning', { action: 'card.move', id: id2, column: ideas, index: 0 })).status()).toBe(200);
    body = await (await request.get(url(`/api/planning?board=${boardId}`), { headers: authed(token) })).json();
    expect(body.cards.filter((c: any) => c.column === ideas).map((c: any) => c.id)).toEqual([id2, id1]);
    expect((await post(request, '/api/planning', { action: 'card.move', id: id1, column: doing, index: 0 })).status()).toBe(200);

    // checklist and priority; a column that is not on the board is refused
    expect((await post(request, '/api/planning', { action: 'card.update', id: id1, patch: { priority: 'high', checklist: [{ text: 'Pay deposit', done: true }, { text: 'Send logo', done: false }] } })).status()).toBe(200);
    const bad = await post(request, '/api/planning', { action: 'card.update', id: id1, patch: { column: 'nowhere' } });
    expect(bad.status()).toBe(400);
    body = await (await request.get(url(`/api/planning?card=${id1}`), { headers: authed(token) })).json();
    expect(body.board.id).toBe(boardId);
    expect(body.cards.find((c: any) => c.id === id1)).toMatchObject({ column: doing, priority: 'high', checklist: [{ text: 'Pay deposit', done: true }, { text: 'Send logo', done: false }] });

    // removing a column moves its cards to the first one, never loses them
    expect((await post(request, '/api/planning', { action: 'board.update', id: boardId, columns: [{ id: ideas, name: 'Ideas' }, { id: 'done', name: 'Done' }] })).status()).toBe(200);
    body = await (await request.get(url(`/api/planning?board=${boardId}`), { headers: authed(token) })).json();
    expect(body.cards.find((c: any) => c.id === id1).column).toBe(ideas);

    expect((await post(request, '/api/planning', { action: 'card.delete', id: id2 })).status()).toBe(200);
    expect((await post(request, '/api/planning', { action: 'board.delete', id: boardId })).status()).toBe(200);
    const { data: left } = await admin().from('master_data').select('id').in('id', [boardId, id1, id2]);
    expect(left).toEqual([]);
  });

  test('chat: #general exists, messages post and poll, mentions and direct messages ring the bell', async ({ request }) => {
    let r = await request.get(url('/api/chat'), { headers: authed(token) });
    expect(r.status(), await r.text()).toBe(200);
    let body = await r.json();
    expect(body.channels.some((c: any) => c.name === 'general' && c.type === 'channel')).toBe(true);

    const ch = await post(request, '/api/chat', { action: 'channel.create', name: `Exports ${tag}` });
    expect(ch.status(), await ch.text()).toBe(200);
    const { id: channelId, name } = await ch.json(); made.push(channelId);
    expect(name).toMatch(/^exports-/);
    expect((await post(request, '/api/chat', { action: 'channel.create', name: `exports ${tag}` })).status()).toBe(400);

    const before = new Date().toISOString();
    const m = await post(request, '/api/chat', { action: 'send', channel_id: channelId, body: `@${mate.first} please check ${q.qn} ${tag}` });
    expect(m.status(), await m.text()).toBe(200);
    const msg = (await m.json()).message; made.push(msg.id);
    expect(msg.mentions).toEqual([mate.id]);

    body = await (await request.get(url(`/api/chat?channel=${channelId}`), { headers: authed(token) })).json();
    expect(body.messages.map((x: any) => x.id)).toContain(msg.id);
    body = await (await request.get(url(`/api/chat?channel=${channelId}&after=${encodeURIComponent(msg.created_at)}`), { headers: authed(token) })).json();
    expect(body.messages).toEqual([]);
    body = await (await request.get(url(`/api/chat?channel=${channelId}&after=${encodeURIComponent(before)}`), { headers: authed(token) })).json();
    expect(body.messages.length).toBe(1);

    const { data: notes } = await admin().from('master_data').select('metadata').eq('tenant_id', actor.tenantId).eq('category', 'notification').contains('metadata', { user_id: mate.id });
    expect((notes || []).some((n: any) => n.metadata.link?.sub === `chat:${channelId}`)).toBe(true);

    // edit, then an empty message is refused
    expect((await post(request, '/api/chat', { action: 'edit', id: msg.id, body: `edited ${tag}` })).status()).toBe(200);
    expect((await post(request, '/api/chat', { action: 'send', channel_id: channelId, body: '   ' })).status()).toBe(400);

    // a direct message: one conversation per pair, opened again it is the same one
    const dm = await post(request, '/api/chat', { action: 'dm', member_id: mate.id });
    expect(dm.status(), await dm.text()).toBe(200);
    const dmId = (await dm.json()).id; made.push(dmId);
    expect((await (await post(request, '/api/chat', { action: 'dm', member_id: mate.id })).json()).id).toBe(dmId);
    const d = await post(request, '/api/chat', { action: 'send', channel_id: dmId, body: `quick one ${tag}` });
    made.push((await d.json()).message.id);
    const { data: dmNotes } = await admin().from('master_data').select('metadata').eq('tenant_id', actor.tenantId).eq('category', 'notification').contains('metadata', { user_id: mate.id });
    expect((dmNotes || []).some((n: any) => n.metadata.link?.sub === `chat:${dmId}`)).toBe(true);

    // #general cannot be deleted; this channel can, with its messages
    const general = (await (await request.get(url('/api/chat'), { headers: authed(token) })).json()).channels.find((c: any) => c.name === 'general');
    expect((await post(request, '/api/chat', { action: 'channel.delete', id: general.id })).status()).toBe(400);
    expect((await post(request, '/api/chat', { action: 'channel.delete', id: channelId })).status()).toBe(200);
    const { data: gone } = await admin().from('master_data').select('id').in('id', [channelId, msg.id]);
    expect(gone).toEqual([]);
  });

  test('a direct message between two other people is invisible to a third', async ({ request }) => {
    // a DM between the teammate and someone else, made directly in the store
    const { data: row } = await admin().from('master_data').insert({ tenant_id: actor.tenantId, category: 'channel', label: `dm:x ${tag}`, metadata: { type: 'dm', members: [mate.id, '00000000-0000-0000-0000-000000000001'] } }).select('id').single();
    made.push(row!.id);
    const list = (await (await request.get(url('/api/chat'), { headers: authed(token) })).json()).channels;
    expect(list.some((c: any) => c.id === row!.id)).toBe(false);
    expect((await request.get(url(`/api/chat?channel=${row!.id}`), { headers: authed(token) })).status()).toBe(400);
    expect((await post(request, '/api/chat', { action: 'send', channel_id: row!.id, body: 'hi' })).status()).toBe(400);
  });
});
