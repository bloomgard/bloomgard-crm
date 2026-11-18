import type { AgentCtx } from '@/lib/agent/core';
import { createRec, getRec, updateRec, teamMembers } from './store';
import { notify } from './notify';
import type { PreparedAction, Rec, TaskData } from './types';

/**
 * The OK list. Two kinds of item share it:
 *  - approvals: something the AI or a workflow prepared that needs a person's OK before it happens
 *    (Approve runs it exactly as a confirmed chat card would, permissions re-checked);
 *  - to-dos: plain tasks a person or the AI assigns to someone.
 */
export async function createTask(
  tenantId: string,
  t: {
    title: string;
    type: TaskData['type'];
    action?: PreparedAction;
    note?: string;
    source: TaskData['source'];
    source_ref?: string;
    source_label?: string;
    quote_id?: string | null;
    qn?: string | null;
    assigned_to?: string | null;   // profile id or email
    due_at?: string | null;
    created_by?: string | null;
  },
): Promise<Rec<TaskData>> {
  let assigned_to: string | null = null, assigned_email: string | null = null;
  if (t.assigned_to) {
    const m = (await teamMembers(tenantId)).find((x) => x.id === t.assigned_to || String(x.email).toLowerCase() === String(t.assigned_to).toLowerCase());
    if (!m) throw new Error(`${t.assigned_to} is not in this workspace.`);
    assigned_to = m.id; assigned_email = m.email;
  }
  const rec = await createRec<TaskData>(tenantId, 'task', t.title, {
    type: t.type, status: 'open', action: t.action, note: t.note, source: t.source,
    source_ref: t.source_ref, source_label: t.source_label, quote_id: t.quote_id || null, qn: t.qn || null,
    assigned_to, assigned_email, due_at: t.due_at || null, created_by: t.created_by || null,
  });
  // whoever can act on it hears about it: the assignee, or for an unassigned approval, the managers
  const link = { view: 'tasks', task_id: rec.id };
  if (assigned_to && assigned_email !== t.created_by) {
    await notify(tenantId, [assigned_to], { title: t.type === 'approval' ? `Needs your OK: ${t.title}` : `Assigned to you: ${t.title}`, body: t.note || t.action?.summary, link, from_email: t.created_by || null });
  } else if (!assigned_to && t.type === 'approval') {
    await notify(tenantId, 'managers', { title: `Needs an OK: ${t.title}`, body: t.action?.summary, link, from_email: t.created_by || null });
  }
  return rec;
}

/**
 * Approve (run the prepared action), dismiss, mark done or reopen. Only the assignee, the creator
 * or a manager may decide; an approval with a client-facing action also needs whoever approves to
 * be allowed to do that action themselves, which executeAction re-checks.
 */
export async function decideTask(ctx: AgentCtx, id: string, decision: 'approve' | 'dismiss' | 'done' | 'reopen', o: { payload?: any } = {}) {
  const task = await getRec<TaskData>(ctx.tenantId, 'task', id);
  if (!task) throw new Error('No such task.');
  const d = task.data;
  const mayDecide = ctx.isManager || d.assigned_to === ctx.userId || d.created_by === ctx.email || (!d.assigned_to && d.type === 'todo');
  if (!mayDecide) throw new Error('Only the assignee, its creator or a manager can do that.');
  const now = new Date().toISOString();

  if (decision === 'reopen') return updateRec<TaskData>(ctx.tenantId, 'task', id, { status: 'open', decided_by: null, decided_at: null, result: null });
  if (d.status !== 'open') throw new Error(`This is already ${d.status}.`);
  if (decision === 'dismiss') return updateRec<TaskData>(ctx.tenantId, 'task', id, { status: 'dismissed', decided_by: ctx.email, decided_at: now, result: 'Dismissed. Nothing was changed.' });
  if (decision === 'done' || d.type === 'todo' || !d.action) {
    const rec = await updateRec<TaskData>(ctx.tenantId, 'task', id, { status: 'done', decided_by: ctx.email, decided_at: now });
    await emitSafe({ type: 'task.completed', tenantId: ctx.tenantId, quoteId: d.quote_id || null, actorEmail: ctx.email, data: { task_id: id, title: task.title } });
    return rec;
  }

  // approve: the person may have edited the draft (e.g. the email body) before approving
  const payload = o.payload && typeof o.payload === 'object' ? { ...d.action.payload, ...o.payload } : d.action.payload;
  const { executeAction } = await import('@/lib/agent/tools');
  try {
    const out = await executeAction(d.action.kind, payload, ctx);
    const rec = await updateRec<TaskData>(ctx.tenantId, 'task', id, { status: 'done', decided_by: ctx.email, decided_at: now, result: out.message, action: { ...d.action, payload } });
    await emitSafe({ type: 'task.completed', tenantId: ctx.tenantId, quoteId: d.quote_id || null, actorEmail: ctx.email, data: { task_id: id, title: task.title } });
    return rec;
  } catch (e: any) {
    await updateRec<TaskData>(ctx.tenantId, 'task', id, { status: 'failed', decided_by: ctx.email, decided_at: now, result: e.message || 'Failed.' });
    throw e;
  }
}

async function emitSafe(ev: Parameters<typeof import('./events').emit>[0]) {
  try { const { emit } = await import('./events'); await emit(ev); } catch { /* never fail the task over its echo */ }
}
