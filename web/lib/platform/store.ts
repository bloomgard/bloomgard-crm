import { db } from '@/lib/agent/core';
import type { Kind, Rec } from './types';

/**
 * One tenant-scoped document store for every platform record (tasks, workflows, notifications,
 * notes, plugins, changesets, views, skills). It is backed by the `master_data` table, which the
 * app never used: id, tenant_id, category (= kind), label (= title), metadata (= data), created_at.
 * Moving a kind to a dedicated table later means changing only this file.
 *
 * Server only: it uses the service role, so every call takes the tenant id explicitly and every
 * query is filtered by it.
 */
const TABLE = 'master_data';

const toRec = <T>(row: any): Rec<T> => ({
  id: row.id, tenant_id: row.tenant_id, kind: row.category, title: row.label || '', data: (row.metadata || {}) as T, created_at: row.created_at,
});

export async function listRecs<T = any>(
  tenantId: string, kind: Kind,
  o: { match?: Record<string, any>; limit?: number; newestFirst?: boolean } = {},
): Promise<Rec<T>[]> {
  let q = db.from(TABLE).select('*').eq('tenant_id', tenantId).eq('category', kind);
  if (o.match && Object.keys(o.match).length) q = q.contains('metadata', o.match);
  q = q.order('created_at', { ascending: o.newestFirst === false }).limit(o.limit ?? 500);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((r) => toRec<T>(r));
}

export async function getRec<T = any>(tenantId: string, kind: Kind, id: string): Promise<Rec<T> | null> {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
  const { data, error } = await db.from(TABLE).select('*').eq('tenant_id', tenantId).eq('category', kind).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRec<T>(data) : null;
}

export async function createRec<T = any>(tenantId: string, kind: Kind, title: string, data: T): Promise<Rec<T>> {
  const { data: row, error } = await db.from(TABLE)
    .insert({ tenant_id: tenantId, category: kind, label: String(title || '').slice(0, 300), metadata: data })
    .select('*').single();
  if (error) throw new Error(error.message);
  return toRec<T>(row);
}

/** Merge `patch` into the record's data (shallow). Pass `title` to rename it. */
export async function updateRec<T = any>(
  tenantId: string, kind: Kind, id: string, patch: Partial<T>, title?: string,
): Promise<Rec<T>> {
  const cur = await getRec<T>(tenantId, kind, id);
  if (!cur) throw new Error('Not found.');
  const next = { ...(cur.data as any), ...(patch as any), updated_at: new Date().toISOString() };
  const upd: any = { metadata: next };
  if (title != null) upd.label = String(title).slice(0, 300);
  const { data: row, error } = await db.from(TABLE).update(upd).eq('tenant_id', tenantId).eq('category', kind).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  return toRec<T>(row);
}

/** Replace the record's data entirely (used by Roll back). */
export async function replaceRec<T = any>(tenantId: string, kind: Kind, id: string, data: T, title?: string) {
  const upd: any = { metadata: data };
  if (title != null) upd.label = String(title).slice(0, 300);
  const { error } = await db.from(TABLE).update(upd).eq('tenant_id', tenantId).eq('category', kind).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Put a record back under a known id (Roll back of a delete). */
export async function restoreRec(tenantId: string, kind: Kind, id: string, title: string, data: any) {
  const { error } = await db.from(TABLE).upsert({ id, tenant_id: tenantId, category: kind, label: title, metadata: data }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function deleteRec(tenantId: string, kind: Kind, id: string) {
  const { error } = await db.from(TABLE).delete().eq('tenant_id', tenantId).eq('category', kind).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Every member of the workspace, for assignment, mentions and notifications. */
export async function teamMembers(tenantId: string) {
  const { data } = await db.from('profiles').select('id, email, full_name, role').eq('tenant_id', tenantId);
  return (data || []) as Array<{ id: string; email: string; full_name: string | null; role: string }>;
}
