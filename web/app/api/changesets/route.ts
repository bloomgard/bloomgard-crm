import { withCtx } from '@/lib/platform/route';
import { createChangeset, listChangesets } from '@/lib/platform/changesets';

/** The workspace sandbox: drafts waiting to be applied, and the history of what was applied. */
export const GET = withCtx(async (ctx) => {
  const rows = await listChangesets(ctx.tenantId);
  return { can_apply: ctx.isManager, changesets: rows.map((r) => ({ id: r.id, title: r.title, created_at: r.created_at, ...r.data, snapshot: undefined })) };
});

/** Draft a change set by hand (the AI drafts through its propose_changes tool). */
export const POST = withCtx(async (ctx, _req, body) => {
  const cs = await createChangeset(ctx, String(body.summary || 'Workspace changes'), Array.isArray(body.changes) ? body.changes : [], 'user');
  return { id: cs.id, lines: cs.data.lines };
});
