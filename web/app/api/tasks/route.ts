import { db } from '@/lib/agent/core';
import { withCtx } from '@/lib/platform/route';
import { listRecs } from '@/lib/platform/store';
import { createTask } from '@/lib/platform/tasks';
import { quoteForCtx } from '@/lib/platform/comments';
import type { TaskData } from '@/lib/platform/types';

/**
 * The OK list. GET ?status=open|closed|all &scope=mine|all
 *  - managers see every task in the workspace (scope=mine narrows to theirs);
 *  - agents see what is assigned to them, what they created, unassigned to-dos, and approvals on
 *    quotes they own.
 * POST creates a to-do: { title, note?, assigned_to?, due_at?, quote_id? }.
 */
export const GET = withCtx(async (ctx, req) => {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'open';
  const scope = url.searchParams.get('scope') || 'all';
  const all = await listRecs<TaskData>(ctx.tenantId, 'task', { limit: 1000 });

  let ownQuoteIds = new Set<string>();
  if (!ctx.isManager) {
    const { data } = await db.from('quotations').select('id').eq('tenant_id', ctx.tenantId).ilike('created_by_email', ctx.email);
    ownQuoteIds = new Set((data || []).map((q: any) => q.id));
  }
  const me = ctx.email.toLowerCase();
  const isMine = (t: TaskData) => t.assigned_to === ctx.userId || String(t.created_by || '').toLowerCase() === me;
  const visible = all.filter((r) => {
    const t = r.data;
    if (ctx.isManager) return scope === 'mine' ? isMine(t) || (!t.assigned_to && t.type === 'approval') : true;
    if (isMine(t)) return true;
    if (!t.assigned_to && t.type === 'todo' && scope !== 'mine') return true;
    if (t.type === 'approval' && !t.assigned_to && t.quote_id && ownQuoteIds.has(t.quote_id)) return true;
    return false;
  });

  const open = visible.filter((r) => r.data.status === 'open');
  const counts = {
    approvals: open.filter((r) => r.data.type === 'approval').length,
    todos: open.filter((r) => r.data.type === 'todo').length,
    mine: open.filter((r) => r.data.assigned_to === ctx.userId).length,
  };
  const tasks = visible.filter((r) =>
    status === 'all' ? true : status === 'closed' ? r.data.status !== 'open' : r.data.status === 'open');
  // open: soonest due first, undated after; closed: most recently decided first
  tasks.sort((a, b) => {
    if (status === 'open') {
      const da = a.data.due_at || '9999', dbb = b.data.due_at || '9999';
      return da === dbb ? String(b.created_at).localeCompare(String(a.created_at)) : da.localeCompare(dbb);
    }
    return String(b.data.decided_at || b.data.updated_at || b.created_at).localeCompare(String(a.data.decided_at || a.data.updated_at || a.created_at));
  });
  return { tasks: tasks.slice(0, 300), counts };
});

export const POST = withCtx(async (ctx, _req, body) => {
  const title = String(body?.title || '').trim();
  if (!title) throw new Error('Give the task a title.');
  if (title.length > 200) throw new Error('Keep the title under 200 characters.');
  let quote: any = null;
  if (body?.quote_id) {
    quote = await quoteForCtx(ctx, body.quote_id);
    if (!quote) throw new Error('No such quote.');
  }
  let due_at: string | null = null;
  if (body?.due_at) {
    const d = new Date(body.due_at);
    if (isNaN(d.getTime())) throw new Error('That due date is not a date.');
    due_at = d.toISOString();
  }
  const task = await createTask(ctx.tenantId, {
    title, type: 'todo', note: body?.note ? String(body.note).slice(0, 2000) : undefined,
    source: 'user', source_label: ctx.profile?.full_name || ctx.email,
    quote_id: quote?.id || null, qn: quote?.qn_number || null,
    assigned_to: body?.assigned_to || null, due_at, created_by: ctx.email,
  });
  return { task };
});
