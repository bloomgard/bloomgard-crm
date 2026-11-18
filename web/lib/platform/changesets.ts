import { db, AgentCtx } from '@/lib/agent/core';
import { mirrorStatusIntoMetadata, STATUS_LOG_TITLE } from '@/lib/statusLog';
import { createRec, deleteRec, getRec, listRecs, replaceRec, restoreRec, updateRec } from './store';
import type { ChangeOp, ChangesetData, Kind, Rec, SkillData, ViewData, WorkflowData } from './types';

/**
 * The workspace sandbox. Bloomgard AI (or a person) drafts a set of changes — automations, form
 * edits, saved views, skills, AI settings, data fixes — as a changeset. A draft changes nothing.
 * Applying it records what each change replaced, so the whole set can be rolled back in one step.
 * Each workspace has its own: every record and every change is scoped to one tenant.
 */

const isSpecial = (m: any) => m && (m.is_ai_settings || m.is_agent_config || m.is_branding);
const MAX_OPS = 40;

/** What the AI may send. "form.ops" is turned into a full form here, against today's form. */
export type IncomingOp = ChangeOp | { type: 'form.ops'; operations: any[] };

async function loadSchema(tenantId: string) {
  const { data } = await db.from('tenant_schemas').select('schema_config').eq('tenant_id', tenantId).maybeSingle();
  const all: any[] = Array.isArray(data?.schema_config) ? data!.schema_config : [];
  return { exists: !!data, all, modules: all.filter((m) => !isSpecial(m)), special: all.filter(isSpecial) };
}

function validateForm(modules: any[]) {
  if (!Array.isArray(modules) || !modules.length) throw new Error('The form needs at least one module.');
  const titles = new Set<string>();
  for (const m of modules) {
    const t = String(m?.title || '').trim();
    if (!t) throw new Error('Every module needs a name.');
    if (t.toLowerCase() === STATUS_LOG_TITLE.toLowerCase()) throw new Error(`"${STATUS_LOG_TITLE}" is built in; use another module name.`);
    if (titles.has(t.toLowerCase())) throw new Error(`Two modules are called "${t}".`);
    titles.add(t.toLowerCase());
    const keys = new Set<string>();
    for (const f of m.fields || []) {
      if (!f?.name) throw new Error(`A field in "${t}" has no key.`);
      if (keys.has(f.name)) throw new Error(`"${t}" has two fields with the key "${f.name}".`);
      keys.add(f.name);
    }
  }
}

function validateView(v: ViewData) {
  if (!v || typeof v !== 'object' || typeof v.filters !== 'object') throw new Error('A view needs filters.');
  const f = v.filters;
  if (f.statuses && !Array.isArray(f.statuses)) throw new Error('View statuses must be a list.');
  for (const k of ['min_amount', 'max_amount', 'quiet_days'] as const) {
    if (f[k] != null && !Number.isFinite(Number(f[k]))) throw new Error(`View ${k} must be a number.`);
  }
}

function validateSkill(s: SkillData) {
  const p = String(s?.prompt || '').trim();
  if (p.length < 4) throw new Error('A skill needs the instruction it runs.');
  if (p.length > 2000) throw new Error('Keep a skill under 2,000 characters.');
}

async function validateWorkflowSafe(tenantId: string, w: WorkflowData) {
  // checked against this workspace's own stages, log modules and people
  const mod: any = await import('./workflows');
  const env = typeof mod.validationEnv === 'function' ? await mod.validationEnv(tenantId) : undefined;
  if (!w?.trigger?.type) throw new Error('An automation needs a trigger.');
  if (!Array.isArray(w.actions) || !w.actions.length) throw new Error('An automation needs at least one step.');
  return { ...w, ...mod.validateWorkflow(w, env) } as WorkflowData;
}

const fmtRule = (w: WorkflowData) => {
  const t = w.trigger || ({} as any);
  const when = ({
    'quote.created': 'a quote is created',
    'quote.status_changed': `a quote moves${t.from ? ` from ${t.from}` : ''}${t.to ? ` to ${t.to}` : ''}`,
    'quote.quiet': `a quote is quiet for ${t.days || 5} days`,
    'quote.due': 'a follow-up date is reached',
    'log.added': `an entry is added${t.module ? ` to ${t.module}` : ' to a log'}`,
    'email.received': 'a client email arrives',
    'comment.added': 'someone adds a team note',
    'schedule.daily': 'every morning',
    manual: 'run by hand',
  } as Record<string, string>)[t.type] || t.type;
  const ifs = (w.conditions || []).map((c) => `${c.field} ${c.op}${c.value != null ? ` ${c.value}` : ''}`).join(' and ');
  const thens = (w.actions || []).map((a) => `${a.type.replace(/_/g, ' ')}${a.approval || ['send_email', 'ai_follow_up'].includes(a.type) ? ' (needs OK)' : ''}`).join(', ');
  return `When ${when}${ifs ? `, if ${ifs}` : ''} → ${thens}`;
};

/** Turn what the AI sent into checked, concrete operations and one plain line per change. */
export async function prepareOps(ctx: AgentCtx, incoming: IncomingOp[]): Promise<{ ops: ChangeOp[]; lines: string[] }> {
  if (!Array.isArray(incoming) || !incoming.length) throw new Error('No changes given.');
  if (incoming.length > MAX_OPS) throw new Error(`Keep a change set under ${MAX_OPS} changes; split it up.`);
  const ops: ChangeOp[] = [], lines: string[] = [];
  let formModules: any[] | null = null;
  for (const raw of incoming) {
    const o: any = raw || {};
    switch (o.type) {
      case 'form.ops': {
        const { applyFormOps } = await import('@/lib/agent/tools');
        const base = formModules || (await loadSchema(ctx.tenantId)).modules;
        const { next, lines: l } = applyFormOps(base, o.operations || []);
        formModules = next;
        l.forEach(([a, b]: [string, string]) => lines.push(`Form · ${a}: ${b}`));
        break;
      }
      case 'form.replace': {
        validateForm(o.modules);
        formModules = o.modules;
        lines.push(`Form · Replace the quote form (${o.modules.length} modules)`);
        break;
      }
      case 'workflow.upsert': {
        const name = String(o.name || '').trim();
        if (!name) throw new Error('An automation needs a name.');
        const w: WorkflowData = { enabled: o.workflow?.enabled !== false, conditions: [], actions: [], ...o.workflow, source: 'ai', created_by: o.workflow?.created_by || ctx.email };
        const checked = await validateWorkflowSafe(ctx.tenantId, w);
        Object.assign(w, checked);
        if (o.id && !(await getRec(ctx.tenantId, 'workflow', o.id))) throw new Error(`No automation with id ${o.id}.`);
        ops.push({ type: 'workflow.upsert', id: o.id, name, workflow: w });
        lines.push(`${o.id ? 'Change' : 'New'} automation "${name}": ${fmtRule(w)}${w.enabled ? '' : ' (off)'}`);
        break;
      }
      case 'workflow.delete': {
        const r = await getRec(ctx.tenantId, 'workflow', o.id);
        if (!r) throw new Error(`No automation with id ${o.id}.`);
        ops.push({ type: 'workflow.delete', id: o.id });
        lines.push(`Delete automation "${r.title}"`);
        break;
      }
      case 'view.upsert': {
        const name = String(o.name || '').trim();
        if (!name) throw new Error('A view needs a name.');
        const v: ViewData = { shared: true, ...o.view, created_by: ctx.email };
        validateView(v);
        ops.push({ type: 'view.upsert', id: o.id, name, view: v });
        lines.push(`${o.id ? 'Change' : 'New'} quote view "${name}"${v.shared ? ' for the whole team' : ''}`);
        break;
      }
      case 'view.delete': {
        const r = await getRec(ctx.tenantId, 'view', o.id);
        if (!r) throw new Error(`No view with id ${o.id}.`);
        ops.push({ type: 'view.delete', id: o.id }); lines.push(`Delete view "${r.title}"`);
        break;
      }
      case 'skill.upsert': {
        const name = String(o.name || '').trim();
        if (!name) throw new Error('A skill needs a name.');
        const s: SkillData = { shared: true, ...o.skill, created_by: ctx.email };
        validateSkill(s);
        ops.push({ type: 'skill.upsert', id: o.id, name, skill: s });
        lines.push(`${o.id ? 'Change' : 'New'} AI skill "${name}": ${String(s.prompt).slice(0, 90)}${String(s.prompt).length > 90 ? '…' : ''}`);
        break;
      }
      case 'skill.delete': {
        const r = await getRec(ctx.tenantId, 'skill', o.id);
        if (!r) throw new Error(`No skill with id ${o.id}.`);
        ops.push({ type: 'skill.delete', id: o.id }); lines.push(`Delete skill "${r.title}"`);
        break;
      }
      case 'ai_settings.update': {
        const { AI_ENUMS } = await import('@/lib/agent/tools');
        const allowed = ['tone', 'englishLevel', 'desperation', 'instructions'];
        const changes: Record<string, any> = {};
        for (const [k, v] of Object.entries(o.changes || {})) {
          if (!allowed.includes(k)) throw new Error(`"${k}" is not an AI setting. Settings: ${allowed.join(', ')}.`);
          if (AI_ENUMS[k] && !AI_ENUMS[k].includes(String(v))) throw new Error(`${k} must be one of ${AI_ENUMS[k].join(', ')}.`);
          changes[k] = k === 'instructions' ? String(v).slice(0, 4000) : v;
        }
        if (!Object.keys(changes).length) throw new Error('No AI settings to change.');
        ops.push({ type: 'ai_settings.update', changes });
        lines.push(`AI settings: ${Object.entries(changes).map(([k, v]) => `${k} → ${String(v).slice(0, 60)}`).join(', ')}`);
        break;
      }
      case 'data.fix': {
        const { data: q } = await db.from('quotations').select('id, qn_number, status').eq('tenant_id', ctx.tenantId).eq('id', o.quote_id).maybeSingle();
        if (!q) throw new Error(`No quote ${o.quote_id} in this workspace.`);
        const set = o.set || {};
        if (!set.status && !set.meta) throw new Error(`Nothing to fix on ${q.qn_number}.`);
        ops.push({ type: 'data.fix', label: String(o.label || 'Fix'), quote_id: q.id, set: { status: set.status, meta: set.meta } });
        const parts = [set.status && set.status !== q.status ? `status ${q.status} → ${set.status}` : '', set.meta ? Object.entries(set.meta).map(([s, f]: any) => Object.keys(f).map((k) => `${s} › ${k}`).join(', ')).join(', ') : ''].filter(Boolean);
        lines.push(`Fix ${q.qn_number}: ${o.label || parts.join('; ')}${o.label && parts.length ? ` (${parts.join('; ')})` : ''}`);
        break;
      }
      default:
        throw new Error(`Unknown change "${o.type}". Use form.ops, workflow.upsert/delete, view.upsert/delete, skill.upsert/delete, ai_settings.update or data.fix.`);
    }
  }
  if (formModules) {
    validateForm(formModules);
    ops.unshift({ type: 'form.replace', modules: formModules });
  }
  return { ops, lines };
}

/** Save a draft. Anyone may draft; only managers may apply anything beyond their own views and skills. */
export async function createChangeset(ctx: AgentCtx, summary: string, incoming: IncomingOp[], source: 'ai' | 'user' = 'ai') {
  const { ops, lines } = await prepareOps(ctx, incoming);
  return createRec<ChangesetData>(ctx.tenantId, 'changeset', String(summary || 'Changes').slice(0, 140), {
    status: 'draft', summary: String(summary || ''), ops, lines, created_by: ctx.email, source,
  });
}

const managerOnly = (op: ChangeOp, ctx: AgentCtx) =>
  !((op.type === 'view.upsert' && !op.view.shared) || (op.type === 'skill.upsert' && !op.skill.shared));

type Undo =
  | { t: 'form'; modules: any[] }
  | { t: 'rec.create'; kind: Kind; id: string }
  | { t: 'rec.replace'; kind: Kind; id: string; title: string; data: any }
  | { t: 'rec.restore'; kind: Kind; id: string; title: string; data: any }
  | { t: 'ai_settings'; entry: any | null }
  | { t: 'quote'; id: string; status: string; metadata: any };

async function writeForm(tenantId: string, modules: any[]) {
  const s = await loadSchema(tenantId);
  const config = [...modules.map((m: any) => (m.is_log ? { ...m, allow_multiple: false } : m)), ...s.special];
  const { error } = s.exists
    ? await db.from('tenant_schemas').update({ schema_config: config }).eq('tenant_id', tenantId)
    : await db.from('tenant_schemas').insert({ tenant_id: tenantId, schema_config: config });
  if (error) throw new Error(error.message);
}

async function writeAiSettings(tenantId: string, entry: any | null) {
  const s = await loadSchema(tenantId);
  const rest = s.all.filter((m) => !m.is_ai_settings);
  const config = entry ? [...rest, entry] : rest;
  const { error } = await db.from('tenant_schemas').update({ schema_config: config }).eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
}

async function applyOne(ctx: AgentCtx, op: ChangeOp): Promise<Undo> {
  const t = ctx.tenantId;
  switch (op.type) {
    case 'form.replace': {
      const before = (await loadSchema(t)).modules;
      await writeForm(t, op.modules);
      return { t: 'form', modules: before };
    }
    case 'workflow.upsert':
    case 'view.upsert':
    case 'skill.upsert': {
      const kind: Kind = op.type === 'workflow.upsert' ? 'workflow' : op.type === 'view.upsert' ? 'view' : 'skill';
      const data = op.type === 'workflow.upsert' ? op.workflow : op.type === 'view.upsert' ? op.view : op.skill;
      if (op.id) {
        const cur = await getRec(t, kind, op.id);
        if (!cur) throw new Error(`${kind} ${op.id} no longer exists.`);
        await replaceRec(t, kind, op.id, { ...data, runs: (cur.data as any).runs, last_run_at: (cur.data as any).last_run_at, updated_at: new Date().toISOString() }, op.name);
        return { t: 'rec.replace', kind, id: op.id, title: cur.title, data: cur.data };
      }
      const rec = await createRec(t, kind, op.name, { ...data, runs: 0, last_run_at: null });
      return { t: 'rec.create', kind, id: rec.id };
    }
    case 'workflow.delete':
    case 'view.delete':
    case 'skill.delete': {
      const kind: Kind = op.type === 'workflow.delete' ? 'workflow' : op.type === 'view.delete' ? 'view' : 'skill';
      const cur = await getRec(t, kind, op.id);
      if (!cur) throw new Error(`${kind} ${op.id} no longer exists.`);
      await deleteRec(t, kind, op.id);
      return { t: 'rec.restore', kind, id: op.id, title: cur.title, data: cur.data };
    }
    case 'ai_settings.update': {
      const s = await loadSchema(t);
      const entry = s.all.find((m) => m.is_ai_settings) || null;
      await writeAiSettings(t, { ...(entry || { is_ai_settings: true }), ...op.changes });
      return { t: 'ai_settings', entry };
    }
    case 'data.fix': {
      const { data: q } = await db.from('quotations').select('id, status, custom_metadata').eq('tenant_id', t).eq('id', op.quote_id).single();
      if (!q) throw new Error('Quote not found.');
      let meta = { ...(q.custom_metadata || {}) };
      if (op.set.meta) for (const [section, fields] of Object.entries(op.set.meta)) {
        if (Array.isArray(meta[section])) continue; // tables are not patched field by field
        meta[section] = { ...(meta[section] || {}), ...fields };
      }
      const patch: any = { custom_metadata: meta };
      if (op.set.status && op.set.status !== q.status) {
        patch.status = op.set.status;
        patch.custom_metadata = mirrorStatusIntoMetadata(meta, (await loadSchema(t)).modules, op.set.status);
      }
      const { error } = await db.from('quotations').update(patch).eq('tenant_id', t).eq('id', q.id);
      if (error) throw new Error(error.message);
      if (patch.status) await db.from('status_logs').insert([{ quotation_id: q.id, old_status: q.status, new_status: patch.status, changed_by: ctx.email, comments: `Fixed in the Studio: ${op.label}` }]);
      return { t: 'quote', id: q.id, status: q.status, metadata: q.custom_metadata };
    }
  }
}

async function undoOne(ctx: AgentCtx, u: Undo) {
  const t = ctx.tenantId;
  switch (u.t) {
    case 'form': return writeForm(t, u.modules);
    case 'rec.create': return deleteRec(t, u.kind, u.id).catch(() => {});
    case 'rec.replace': return replaceRec(t, u.kind, u.id, u.data, u.title);
    case 'rec.restore': return restoreRec(t, u.kind, u.id, u.title, u.data);
    case 'ai_settings': return writeAiSettings(t, u.entry);
    case 'quote': {
      const { data: q } = await db.from('quotations').select('status').eq('tenant_id', t).eq('id', u.id).single();
      await db.from('quotations').update({ status: u.status, custom_metadata: u.metadata }).eq('tenant_id', t).eq('id', u.id);
      if (q && q.status !== u.status) await db.from('status_logs').insert([{ quotation_id: u.id, old_status: q.status, new_status: u.status, changed_by: ctx.email, comments: 'Rolled back in the Studio' }]);
      return;
    }
  }
}

/** Apply a draft. Each change records what it replaced; if one fails, the ones already made are undone. */
export async function applyChangeset(ctx: AgentCtx, id: string): Promise<Rec<ChangesetData>> {
  const cs = await getRec<ChangesetData>(ctx.tenantId, 'changeset', id);
  if (!cs) throw new Error('No such change set.');
  if (cs.data.status !== 'draft') throw new Error(`This change set is already ${cs.data.status.replace('_', ' ')}.`);
  if (!ctx.isManager && cs.data.ops.some((op) => managerOnly(op, ctx))) throw new Error('Only managers and admins can apply workspace changes. Your own views and skills you can apply yourself.');
  const undo: Undo[] = [];
  try {
    for (const op of cs.data.ops) undo.push(await applyOne(ctx, op));
  } catch (e: any) {
    for (const u of [...undo].reverse()) { try { await undoOne(ctx, u); } catch { /* keep undoing */ } }
    await updateRec<ChangesetData>(ctx.tenantId, 'changeset', id, { status: 'failed', error: e.message || 'Failed.' });
    throw new Error(`Nothing was changed: ${e.message}`);
  }
  return updateRec<ChangesetData>(ctx.tenantId, 'changeset', id, { status: 'applied', snapshot: undo, applied_by: ctx.email, applied_at: new Date().toISOString(), error: null });
}

/** Put everything an applied change set touched back the way it was. */
export async function rollbackChangeset(ctx: AgentCtx, id: string): Promise<Rec<ChangesetData>> {
  const cs = await getRec<ChangesetData>(ctx.tenantId, 'changeset', id);
  if (!cs) throw new Error('No such change set.');
  if (cs.data.status !== 'applied') throw new Error('Only an applied change set can be rolled back.');
  if (!ctx.isManager && cs.data.ops.some((op) => managerOnly(op, ctx))) throw new Error('Only managers and admins can roll back workspace changes.');
  const undo = (cs.data.snapshot || []) as Undo[];
  for (const u of [...undo].reverse()) await undoOne(ctx, u);
  return updateRec<ChangesetData>(ctx.tenantId, 'changeset', id, { status: 'rolled_back', applied_by: ctx.email });
}

export async function discardChangeset(ctx: AgentCtx, id: string) {
  const cs = await getRec<ChangesetData>(ctx.tenantId, 'changeset', id);
  if (!cs) throw new Error('No such change set.');
  if (cs.data.status !== 'draft') throw new Error('Only a draft can be discarded.');
  return updateRec<ChangesetData>(ctx.tenantId, 'changeset', id, { status: 'discarded' });
}

export const listChangesets = (tenantId: string) => listRecs<ChangesetData>(tenantId, 'changeset', { limit: 100 });
