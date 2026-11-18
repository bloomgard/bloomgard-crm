import { db } from '@/lib/agent/core';
import { withCtx } from '@/lib/platform/route';
import { listRecs } from '@/lib/platform/store';
import type { NotificationData } from '@/lib/platform/types';

/** The signed-in person's notifications, newest 50, and how many are unread. */
export const GET = withCtx(async (ctx) => {
  const rows = await listRecs<NotificationData>(ctx.tenantId, 'notification', { match: { user_id: ctx.userId }, limit: 200 });
  const unread = rows.filter((r) => !r.data.read_at).length;
  return { notifications: rows.slice(0, 50), unread };
});

/** Mark read: { read: 'all' } or { read: [ids] }. Only ever touches the caller's own. */
export const POST = withCtx(async (ctx, _req, body) => {
  const rows = await listRecs<NotificationData>(ctx.tenantId, 'notification', { match: { user_id: ctx.userId }, limit: 500 });
  const want = body?.read === 'all' ? null : new Set<string>(Array.isArray(body?.read) ? body.read.map(String) : []);
  if (want && !want.size) throw new Error('Say which notifications to mark read.');
  const now = new Date().toISOString();
  const targets = rows.filter((r) => !r.data.read_at && (!want || want.has(r.id)));
  await Promise.all(targets.map((r) =>
    db.from('master_data').update({ metadata: { ...r.data, read_at: now } })
      .eq('tenant_id', ctx.tenantId).eq('category', 'notification').eq('id', r.id)));
  return { marked: targets.length };
});
