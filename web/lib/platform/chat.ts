import type { AgentCtx } from '@/lib/agent/core';
import { createRec, deleteRec, getRec, listRecs, replaceRec, teamMembers } from './store';
import { notify } from './notify';
import type { ChannelData, ChatReadData, MessageData, Rec } from './types';

/**
 * Team → Chat: workspace channels everyone can read, and direct messages between two people.
 * Messages live in the workspace store; the browser polls for new ones while Chat is open.
 * An @mention or a direct message rings the person's bell.
 */

const MAX_BODY = 4000;
const nameSlug = (s: string) => String(s || '').toLowerCase().replace(/^#/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const canSee = (ctx: AgentCtx, c: Rec<ChannelData>) => c.data.type === 'channel' || (c.data.members || []).includes(ctx.userId);

async function channel(ctx: AgentCtx, id: string) {
  const c = await getRec<ChannelData>(ctx.tenantId, 'channel', id);
  if (!c || !canSee(ctx, c)) throw new Error('No such conversation.');
  return c;
}

async function readsRec(ctx: AgentCtx) {
  const [r] = await listRecs<ChatReadData>(ctx.tenantId, 'chat_read', { match: { user_id: ctx.userId }, limit: 1 });
  return r || null;
}

export async function markRead(ctx: AgentCtx, channelId: string, at = new Date().toISOString()) {
  const r = await readsRec(ctx);
  if (!r) { await createRec<ChatReadData>(ctx.tenantId, 'chat_read', ctx.email, { user_id: ctx.userId, reads: { [channelId]: at } }); return; }
  if ((r.data.reads[channelId] || '') >= at) return;
  await replaceRec(ctx.tenantId, 'chat_read', r.id, { ...r.data, reads: { ...r.data.reads, [channelId]: at }, updated_at: new Date().toISOString() });
}

/** Every conversation this person can see, with how many messages they have not read. */
export async function listChannels(ctx: AgentCtx) {
  let channels = (await listRecs<ChannelData>(ctx.tenantId, 'channel', { newestFirst: false, limit: 300 })).filter((c) => canSee(ctx, c));
  if (!channels.some((c) => c.data.type === 'channel' && c.title === 'general')) {
    const g = await createRec<ChannelData>(ctx.tenantId, 'channel', 'general', { type: 'channel', description: 'Everyone in the workspace', created_by: ctx.email });
    channels = [g, ...channels];
  }
  const [reads, recent] = await Promise.all([readsRec(ctx), listRecs<MessageData>(ctx.tenantId, 'message', { limit: 800 })]);
  const seen = reads?.data.reads || {};
  const unread: Record<string, number> = {};
  for (const m of recent) {
    if (m.data.author_id === ctx.userId) continue;
    if (m.created_at > (seen[m.data.channel_id] || '')) unread[m.data.channel_id] = (unread[m.data.channel_id] || 0) + 1;
  }
  return channels
    .map((c) => ({ id: c.id, name: c.title, type: c.data.type, description: c.data.description || '', members: c.data.members || [], last_message_at: c.data.last_message_at || null, unread: unread[c.id] || 0, can_delete: c.data.type === 'channel' && c.title !== 'general' && (ctx.isManager || c.data.created_by === ctx.email) }))
    .sort((a, b) => (a.name === 'general' ? -1 : b.name === 'general' ? 1 : a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'channel' ? -1 : 1));
}

export async function createChannel(ctx: AgentCtx, body: { name?: string; description?: string }) {
  const name = nameSlug(body.name || '');
  if (!name) throw new Error('Give the channel a name, like sales or exports-team.');
  const existing = await listRecs<ChannelData>(ctx.tenantId, 'channel', { limit: 300 });
  if (existing.some((c) => c.data.type === 'channel' && c.title === name)) throw new Error(`#${name} already exists.`);
  const rec = await createRec<ChannelData>(ctx.tenantId, 'channel', name, { type: 'channel', description: String(body.description || '').slice(0, 200), created_by: ctx.email });
  return { id: rec.id, name };
}

export async function deleteChannel(ctx: AgentCtx, id: string) {
  const c = await channel(ctx, id);
  if (c.data.type !== 'channel') throw new Error('Direct messages cannot be deleted.');
  if (c.title === 'general') throw new Error('#general stays: it is the whole team’s channel.');
  if (!ctx.isManager && c.data.created_by !== ctx.email) throw new Error('Only its creator or a manager can delete a channel.');
  const msgs = await listRecs<MessageData>(ctx.tenantId, 'message', { match: { channel_id: id }, limit: 5000 });
  for (const m of msgs) await deleteRec(ctx.tenantId, 'message', m.id);
  await deleteRec(ctx.tenantId, 'channel', id);
  return { ok: true };
}

/** The direct conversation with one teammate, started if it does not exist yet. */
export async function openDm(ctx: AgentCtx, memberId: string) {
  if (memberId === ctx.userId) throw new Error('Pick someone else to message.');
  const m = (await teamMembers(ctx.tenantId)).find((x) => x.id === memberId);
  if (!m) throw new Error('That person is not in this workspace.');
  const pair = [ctx.userId, memberId].sort();
  const existing = (await listRecs<ChannelData>(ctx.tenantId, 'channel', { match: { type: 'dm' }, limit: 300 }))
    .find((c) => [...(c.data.members || [])].sort().join() === pair.join());
  if (existing) return { id: existing.id };
  const rec = await createRec<ChannelData>(ctx.tenantId, 'channel', `dm:${pair.join(':')}`, { type: 'dm', members: pair, created_by: ctx.email });
  return { id: rec.id };
}

const shape = (m: Rec<MessageData>) => ({ id: m.id, created_at: m.created_at, ...m.data });

/** The latest messages in a conversation (oldest first), or only those after `after`. Reading marks it read. */
export async function listMessages(ctx: AgentCtx, channelId: string, after?: string | null) {
  await channel(ctx, channelId);
  const rows = await listRecs<MessageData>(ctx.tenantId, 'message', { match: { channel_id: channelId }, limit: 200 });
  const msgs = rows.reverse().filter((m) => !after || m.created_at > after).map(shape);
  const last = rows.length ? rows[rows.length - 1].created_at : null;
  if (last) await markRead(ctx, channelId, last).catch(() => {});
  return msgs;
}

/** "@Priya" or "@priya.s" (the part of an email before the @) → that teammate. */
function mentionsIn(body: string, members: Array<{ id: string; email: string; full_name: string | null }>) {
  const words = new Set((body.match(/@([\p{L}\p{N}._-]+)/gu) || []).map((w) => w.slice(1).toLowerCase().replace(/[._-]+$/, '')));
  if (!words.size) return [];
  return members.filter((m) => {
    const first = String(m.full_name || '').split(/\s+/)[0]?.toLowerCase();
    const local = String(m.email).split('@')[0].toLowerCase();
    return (first && words.has(first)) || words.has(local) || (words.has('here') || words.has('team'));
  }).map((m) => m.id);
}

export async function sendMessage(ctx: AgentCtx, channelId: string, text: string) {
  const c = await channel(ctx, channelId);
  const body = String(text || '').trim();
  if (!body) throw new Error('Type a message first.');
  if (body.length > MAX_BODY) throw new Error(`Keep a message under ${MAX_BODY} characters.`);
  const members = await teamMembers(ctx.tenantId);
  const mentions = mentionsIn(body, members).filter((id) => id !== ctx.userId);
  const author_name = ctx.profile?.full_name || null;
  const rec = await createRec<MessageData>(ctx.tenantId, 'message', body.slice(0, 120), {
    channel_id: c.id, body, author_id: ctx.userId, author_email: ctx.email, author_name, mentions,
  });
  await replaceRec(ctx.tenantId, 'channel', c.id, { ...c.data, last_message_at: rec.created_at }).catch(() => {});
  await markRead(ctx, c.id, rec.created_at).catch(() => {});

  const who = author_name || ctx.email;
  const preview = body.length > 140 ? body.slice(0, 137) + '…' : body;
  const link = { view: 'team', sub: `chat:${c.id}` };
  if (c.data.type === 'dm') {
    const other = (c.data.members || []).filter((id) => id !== ctx.userId);
    if (other.length) await notify(ctx.tenantId, other, { title: `${who} sent you a message`, body: preview, link, from_email: ctx.email });
  } else if (mentions.length) {
    await notify(ctx.tenantId, mentions, { title: `${who} mentioned you in #${c.title}`, body: preview, link, from_email: ctx.email });
  }
  return shape(rec);
}

export async function editMessage(ctx: AgentCtx, id: string, text: string) {
  const m = await getRec<MessageData>(ctx.tenantId, 'message', id);
  if (!m) throw new Error('No such message.');
  if (m.data.author_id !== ctx.userId) throw new Error('Only the person who wrote a message can edit it.');
  const body = String(text || '').trim();
  if (!body) throw new Error('A message cannot be empty. Delete it instead.');
  if (body.length > MAX_BODY) throw new Error(`Keep a message under ${MAX_BODY} characters.`);
  const now = new Date().toISOString();
  await replaceRec(ctx.tenantId, 'message', id, { ...m.data, body, edited_at: now, updated_at: now }, body.slice(0, 120));
  return { ok: true };
}

export async function deleteMessage(ctx: AgentCtx, id: string) {
  const m = await getRec<MessageData>(ctx.tenantId, 'message', id);
  if (!m) throw new Error('No such message.');
  await channel(ctx, m.data.channel_id);
  if (m.data.author_id !== ctx.userId && !ctx.isManager) throw new Error('Only its author or a manager can delete a message.');
  await deleteRec(ctx.tenantId, 'message', id);
  return { ok: true };
}
