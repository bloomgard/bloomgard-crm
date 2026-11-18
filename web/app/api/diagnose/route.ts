import { withCtx } from '@/lib/platform/route';
import { diagnoseWorkspace } from '@/lib/platform/diagnose';

/** Workspace health: what is wrong or stuck, and which of it has a ready-made fix. */
export const GET = withCtx(async (ctx) => {
  const d = await diagnoseWorkspace(ctx);
  return { checked: d.checked, findings: d.findings.map(({ fix, ...f }) => ({ ...f, fixable: !!fix, fix_summary: fix?.summary })) };
});

/** { ids: string[] } → a draft change set with the ready-made fixes for those findings. */
export const POST = withCtx(async (ctx, _req, body) => {
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const d = await diagnoseWorkspace(ctx);
  const picked = d.findings.filter((f) => ids.includes(f.id) && f.fix);
  if (!picked.length) throw new Error('None of those findings has a ready-made fix.');
  const { createChangeset } = await import('@/lib/platform/changesets');
  const cs = await createChangeset(ctx, picked.map((f) => f.fix!.summary).join('; '), picked.flatMap((f) => f.fix!.ops), 'user');
  return { id: cs.id, lines: cs.data.lines };
});
