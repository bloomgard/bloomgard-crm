import type { AgentCtx } from '@/lib/agent/core';
import { createRec, deleteRec, getRec, listRecs, replaceRec } from './store';
import type { SkillData, ViewData } from './types';

/**
 * Saved quote views and AI skills. Anyone can keep their own; making one the whole team sees is a
 * manager's call. Changes the AI drafts go through the sandbox instead (changesets.ts).
 */
type Saved = 'view' | 'skill';

export async function listSaved<T extends ViewData | SkillData>(ctx: AgentCtx, kind: Saved) {
  const rows = await listRecs<T>(ctx.tenantId, kind, { limit: 200, newestFirst: false });
  return rows
    .filter((r) => (r.data as any).shared || (r.data as any).created_by === ctx.email)
    .map((r) => ({ id: r.id, name: r.title, ...(r.data as any), mine: (r.data as any).created_by === ctx.email }));
}

export async function saveSaved(ctx: AgentCtx, kind: Saved, body: { id?: string; name?: string; data?: any }) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error(`Give the ${kind} a name.`);
  if (name.length > 60) throw new Error('Keep the name under 60 characters.');
  const data = { ...(body.data || {}), created_by: ctx.email };
  data.shared = !!data.shared;
  if (data.shared && !ctx.isManager) throw new Error('Only managers and admins can share with the whole team. Save it for yourself instead.');
  if (kind === 'skill') {
    const p = String(data.prompt || '').trim();
    if (p.length < 4) throw new Error('A skill needs the instruction it runs.');
    data.prompt = p.slice(0, 2000);
  } else if (typeof data.filters !== 'object' || !data.filters) throw new Error('A view needs filters.');
  if (body.id) {
    const cur = await getRec(ctx.tenantId, kind, body.id);
    if (!cur) throw new Error(`No such ${kind}.`);
    if ((cur.data as any).created_by !== ctx.email && !ctx.isManager) throw new Error(`Only its creator or a manager can change this ${kind}.`);
    await replaceRec(ctx.tenantId, kind, body.id, { ...data, created_by: (cur.data as any).created_by }, name);
    return { id: body.id };
  }
  const rec = await createRec(ctx.tenantId, kind, name, data);
  return { id: rec.id };
}

export async function removeSaved(ctx: AgentCtx, kind: Saved, id: string) {
  const cur = await getRec(ctx.tenantId, kind, id);
  if (!cur) throw new Error(`No such ${kind}.`);
  if ((cur.data as any).created_by !== ctx.email && !ctx.isManager) throw new Error(`Only its creator or a manager can delete this ${kind}.`);
  await deleteRec(ctx.tenantId, kind, id);
  return { ok: true };
}
