import { withCtx } from '@/lib/platform/route';
import { teamMembers } from '@/lib/platform/store';
import {
  listChannels, createChannel, deleteChannel, openDm, listMessages, sendMessage, editMessage, deleteMessage, markRead,
} from '@/lib/platform/chat';

/**
 * Team → Chat.
 * GET — the conversations you can see (with unread counts) and the team.
 * GET ?channel=<id>[&after=<iso>] — that conversation's latest messages, or only the newer ones.
 * POST { action, ... } — send | edit | delete | read | channel.create | channel.delete | dm
 */
export const GET = withCtx(async (ctx, req) => {
  const q = new URL(req.url).searchParams;
  const channelId = q.get('channel');
  if (channelId) return { messages: await listMessages(ctx, channelId, q.get('after')) };
  const [channels, members] = await Promise.all([listChannels(ctx), teamMembers(ctx.tenantId)]);
  return { channels, members: members.map((m) => ({ id: m.id, email: m.email, full_name: m.full_name, role: m.role })), me: ctx.userId };
});

export const POST = withCtx(async (ctx, _req, body) => {
  switch (body.action) {
    case 'send': return { message: await sendMessage(ctx, String(body.channel_id || ''), body.body) };
    case 'edit': return editMessage(ctx, String(body.id || ''), body.body);
    case 'delete': return deleteMessage(ctx, String(body.id || ''));
    case 'read': await markRead(ctx, String(body.channel_id || '')); return { ok: true };
    case 'channel.create': return createChannel(ctx, body);
    case 'channel.delete': return deleteChannel(ctx, String(body.id || ''));
    case 'dm': return openDm(ctx, String(body.member_id || ''));
    default: throw new Error('Unknown action.');
  }
});
