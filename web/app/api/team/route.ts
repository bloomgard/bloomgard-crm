import { db, quoteValue, clientName, daysSince, visibleQuotes } from '@/lib/agent/core';
import { withCtx } from '@/lib/platform/route';
import { listRecs, teamMembers } from '@/lib/platform/store';
import type { CommentData, TaskData } from '@/lib/platform/types';

const CLOSED = new Set(['approved', 'lost', 'rejected']);

/**
 * GET ?members=1 — everyone in the workspace (for assignment and @mentions); any member may ask.
 * GET — the Team page, managers only: per-person numbers and a feed of what happened recently.
 */
export const GET = withCtx(async (ctx, req) => {
  const members = await teamMembers(ctx.tenantId);
  const brief = members.map((m) => ({ id: m.id, email: m.email, full_name: m.full_name, role: m.role }));
  if (new URL(req.url).searchParams.get('members')) return { members: brief };
  if (!ctx.isManager) throw new Error('Only managers and admins can see the team view.');

  // lean: custom_metadata can hold base64 attachments, so only the amount and client paths are read
  const [quotes, tasks, notes] = await Promise.all([
    visibleQuotes(ctx, 5000, true),
    listRecs<TaskData>(ctx.tenantId, 'task', { limit: 1000 }),
    listRecs<CommentData>(ctx.tenantId, 'comment', { limit: 40 }),
  ]);
  const qs = (quotes as any[]).filter((q) => q.status !== 'Lead');

  const stats = brief.map((m) => {
    const mine = qs.filter((q) => String(q.created_by_email || '').toLowerCase() === String(m.email).toLowerCase());
    const won = mine.filter((q) => String(q.status).toLowerCase() === 'approved');
    const open = mine.filter((q) => !CLOSED.has(String(q.status).toLowerCase()));
    return {
      ...m,
      quotes: mine.length,
      pipeline_value: Math.round(open.reduce((a, q) => a + quoteValue(q), 0)),
      approved: won.length,
      approved_value: Math.round(won.reduce((a, q) => a + quoteValue(q), 0)),
      open_tasks: tasks.filter((t) => t.data.status === 'open' && t.data.assigned_to === m.id).length,
      quiet_quotes: open.filter((q) => daysSince(q.last_contact_date || q.date || q.created_at) > 7).length,
    };
  }).sort((a, b) => b.pipeline_value - a.pipeline_value);

  // activity: status moves, notes, finished tasks — newest first
  const byId = new Map(qs.map((q) => [q.id, q]));
  const ids = qs.map((q) => q.id);
  let logs: any[] = [];
  if (ids.length) {
    const { data } = await db.from('status_logs').select('quotation_id, old_status, new_status, changed_by, comments, created_at')
      .in('quotation_id', ids.slice(0, 2000)).order('created_at', { ascending: false }).limit(40);
    logs = data || [];
  }
  const qLabel = (id?: string | null) => {
    const q = id ? byId.get(id) : null;
    return q ? { quote_id: q.id, qn: q.qn_number, client: clientName(q) || q.clients?.company_name || '' } : {};
  };
  const activity = [
    ...logs.map((l) => ({
      kind: 'status', at: l.created_at, who: l.changed_by || '',
      text: l.old_status ? `moved ${l.old_status} → ${l.new_status}` : `set ${l.new_status}`,
      note: l.comments || '', ...qLabel(l.quotation_id),
    })),
    ...notes.map((n) => ({
      kind: 'note', at: n.created_at, who: n.data.author_name || n.data.author_email,
      text: 'added a note', note: n.data.body.length > 140 ? n.data.body.slice(0, 137) + '…' : n.data.body, ...qLabel(n.data.quote_id),
    })),
    ...tasks.filter((t) => t.data.status === 'done' && t.data.decided_at).map((t) => ({
      kind: 'task', at: t.data.decided_at as string, who: t.data.decided_by || '',
      text: t.data.type === 'approval' ? `approved “${t.title}”` : `finished “${t.title}”`,
      note: t.data.result || '', ...qLabel(t.data.quote_id),
    })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40);

  return { members: stats, activity };
});
