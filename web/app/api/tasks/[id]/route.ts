import { withCtx } from '@/lib/platform/route';
import { getRec, updateRec, teamMembers } from '@/lib/platform/store';
import { decideTask } from '@/lib/platform/tasks';
import { notify } from '@/lib/platform/notify';
import type { TaskData } from '@/lib/platform/types';

export const maxDuration = 60;

/** Decide a task: { decision: 'approve' | 'dismiss' | 'done' | 'reopen', payload? }. */
export const POST = withCtx(async (ctx, _req, body, params) => {
  const decision = String(body?.decision || '');
  if (!['approve', 'dismiss', 'done', 'reopen'].includes(decision)) throw new Error('Decision must be approve, dismiss, done or reopen.');
  const task = await decideTask(ctx, params.id, decision as any, { payload: body?.payload });
  return { task };
});

/** Edit a task: { title?, note?, assigned_to?, due_at? }. Reassigning tells the new assignee. */
export const PATCH = withCtx(async (ctx, _req, body, params) => {
  const cur = await getRec<TaskData>(ctx.tenantId, 'task', params.id);
  if (!cur) throw new Error('No such task.');
  const d = cur.data;
  const may = ctx.isManager || d.assigned_to === ctx.userId || String(d.created_by || '').toLowerCase() === ctx.email.toLowerCase();
  if (!may) throw new Error('Only the assignee, its creator or a manager can do that.');

  const patch: Partial<TaskData> = {};
  let title: string | undefined;
  if (body?.title !== undefined) {
    title = String(body.title).trim();
    if (!title) throw new Error('A task needs a title.');
  }
  if (body?.note !== undefined) patch.note = String(body.note || '').slice(0, 2000);
  if (body?.due_at !== undefined) {
    if (!body.due_at) patch.due_at = null;
    else {
      const t = new Date(body.due_at);
      if (isNaN(t.getTime())) throw new Error('That due date is not a date.');
      patch.due_at = t.toISOString();
    }
  }
  let newAssignee: { id: string; email: string } | null = null;
  if (body?.assigned_to !== undefined) {
    if (!body.assigned_to) { patch.assigned_to = null; patch.assigned_email = null; }
    else {
      const m = (await teamMembers(ctx.tenantId)).find((x) => x.id === body.assigned_to || String(x.email).toLowerCase() === String(body.assigned_to).toLowerCase());
      if (!m) throw new Error(`${body.assigned_to} is not in this workspace.`);
      patch.assigned_to = m.id; patch.assigned_email = m.email;
      if (m.id !== d.assigned_to) newAssignee = m;
    }
  }
  const task = await updateRec<TaskData>(ctx.tenantId, 'task', params.id, patch, title);
  if (newAssignee && newAssignee.id !== ctx.userId) {
    await notify(ctx.tenantId, [newAssignee.id], {
      title: task.data.type === 'approval' ? `Needs your OK: ${task.title}` : `Assigned to you: ${task.title}`,
      body: task.data.note || task.data.action?.summary, link: { view: 'tasks', task_id: task.id }, from_email: ctx.email,
    });
  }
  return { task };
});
