import { AsyncLocalStorage } from 'node:async_hooks';
import { db, AgentCtx, quoteValue, clientName, metaPlan, daysSince } from '@/lib/agent/core';
import { prepare, executeAction } from '@/lib/agent/tools';
import { listRecs, getRec, createRec, updateRec, teamMembers } from './store';
import { systemCtx } from './ctx';
import { notify } from './notify';
import { createTask } from './tasks';
import { MAX_DEPTH } from './events';
import { sendPluginMessage } from './plugins';
import { addComment } from './comments';
import { ACTION_OPTIONS, APPROVABLE, CLIENT_FACING, OP_OPTIONS, TRIGGER_OPTIONS, inr } from './workflowTemplates';
import { FAST_MODEL, parseModelJson } from '@/lib/ai/models';
import type {
  ActionType, Condition, PlatformEvent, Rec, Trigger, WorkflowAction, WorkflowData, WorkflowRunData,
} from './types';

/**
 * The workflow engine. A workflow is "When <trigger>, if <conditions>, then <actions>", stored as a
 * 'workflow' record. Events (lib/platform/events.ts) and the daily scheduler run the matching ones.
 *
 * Three promises it keeps:
 *  1. Nothing reaches a client without a person's OK: email and AI follow-ups always land on the
 *     OK list as approvals. Other steps wait there too when the workflow says so.
 *  2. No loops: a workflow never runs twice in one chain of events, and a chain stops after
 *     MAX_DEPTH hops. Chains survive steps that go through executeAction (which emits its own
 *     events) via `automationScope`.
 *  3. Every run is recorded as a 'workflow_run' with one line per step, so the team can see what
 *     happened and why.
 */

/* ------------------------------------------------------------------ chain tracking */

/** Depth and chain of the workflow step currently running; events emitted inside it inherit both. */
export const automationScope = new AsyncLocalStorage<{ depth: number; chain: string[] }>();

/* ------------------------------------------------------------------ quotes */

const CLOSED = new Set(['approved', 'lost', 'rejected', 'lead', 'won', 'cancelled', 'closed']);
const isOpen = (q: any) => !CLOSED.has(String(q?.status || '').trim().toLowerCase());
const norm = (s: any) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const safeKey = (k: string) => String(k).replace(/["\\]/g, '');

const BASE = 'id, qn_number, status, created_by_email, last_contact_date, follow_up_due_date, follow_up_status, created_at, date, clients(company_name, email_id, contact_person), quotation_items(quantity, item_rate, item_br)';

/**
 * Quotes with just the readable parts of their form data (never inline attachments, which can be
 * megabytes each), rebuilt into custom_metadata so the usual helpers work on them.
 */
async function loadQuotes(tenantId: string, o: { ids?: string[]; limit?: number } = {}) {
  const plan = await metaPlan(tenantId);
  const select = [BASE, ...plan.sections.map((t, i) => `s${i}:custom_metadata->"${safeKey(t)}"`)].join(', ');
  let q: any = db.from('quotations').select(select).eq('tenant_id', tenantId);
  if (o.ids) q = q.in('id', o.ids);
  q = q.order('created_at', { ascending: false }).limit(o.limit ?? 2000);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data || []) as any[]).map((r) => {
    const meta: Record<string, any> = {};
    plan.sections.forEach((t, i) => { if (r[`s${i}`] != null) meta[t] = r[`s${i}`]; delete r[`s${i}`]; });
    return { ...r, custom_metadata: meta };
  });
}

async function loadQuote(tenantId: string, id?: string | null) {
  if (!id) return null;
  const [q] = await loadQuotes(tenantId, { ids: [id], limit: 1 });
  return q || null;
}

/** "Section.field_key" (case and punctuation insensitive) from a quote's form data. */
function metaField(q: any, path: string) {
  const [sec, key] = String(path).split('.');
  const meta = q?.custom_metadata || {};
  const sk = Object.keys(meta).find((k) => norm(k) === norm(sec));
  const section = sk ? meta[sk] : null;
  const obj = Array.isArray(section) ? section[0] : section;
  if (!obj || typeof obj !== 'object') return '';
  const fk = Object.keys(obj).find((k) => norm(k) === norm(key));
  return fk ? obj[fk] : '';
}

/** First value under any of these keys in the Client Information section. */
function clientInfo(q: any, keys: string[]) {
  const meta = q?.custom_metadata || {};
  const sk = Object.keys(meta).find((k) => norm(k).includes('client'));
  const obj = sk ? (Array.isArray(meta[sk]) ? meta[sk][0] : meta[sk]) : null;
  if (!obj || typeof obj !== 'object') return '';
  for (const want of keys) {
    const fk = Object.keys(obj).find((k) => norm(k) === want);
    if (fk && obj[fk]) return String(obj[fk]);
  }
  return '';
}

function facts(q: any) {
  if (!q) return null;
  const last = q.last_contact_date || q.date || q.created_at;
  return {
    status: q.status || '',
    amount: quoteValue(q),
    client: clientName(q) || clientInfo(q, ['clientname', 'companyname']),
    contact: q.clients?.contact_person || clientInfo(q, ['contactperson', 'contact', 'name']),
    client_email: q.clients?.email_id || clientInfo(q, ['emailid', 'email', 'emailaddress']),
    created_by: q.created_by_email || '',
    days_quiet: Math.max(0, Math.floor(daysSince(last))),
    qn: q.qn_number || '',
  };
}

function fieldValue(q: any, field: string) {
  const f = facts(q);
  if (!f) return '';
  if (field in f) return (f as any)[field];
  if (field.includes('.')) return metaField(q, field);
  return '';
}

const num = (x: any) => parseFloat(String(x ?? '').replace(/[^0-9.-]/g, ''));

export function conditionHolds(c: Condition, q: any): boolean {
  const v = fieldValue(q, c.field);
  const s = String(v ?? '').trim().toLowerCase();
  const want = String(c.value ?? '').trim().toLowerCase();
  switch (c.op) {
    case 'eq': return s === want;
    case 'neq': return s !== want;
    case 'gt': return num(v) > num(c.value);
    case 'gte': return num(v) >= num(c.value);
    case 'lt': return num(v) < num(c.value);
    case 'lte': return num(v) <= num(c.value);
    case 'contains': return s.includes(want);
    case 'not_contains': return !s.includes(want);
    case 'empty': return s === '';
    case 'not_empty': return s !== '';
    case 'in': {
      const list = (Array.isArray(c.value) ? c.value : String(c.value ?? '').split(',')).map((x: any) => String(x).trim().toLowerCase()).filter(Boolean);
      return list.includes(s);
    }
    default: return false;
  }
}

const eqi = (a?: string, b?: string) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

function triggerMatches(t: Trigger, ev: PlatformEvent): boolean {
  if (!t || t.type !== ev.type) return false;
  const d = ev.data || {};
  if (t.type === 'quote.status_changed') {
    if (t.to && !eqi(t.to, d.to)) return false;
    if (t.from && !eqi(t.from, d.from)) return false;
  }
  if (t.type === 'log.added' && t.module && !eqi(t.module, d.module)) return false;
  if (t.type === 'quote.quiet' && t.days && Number(d.days ?? Infinity) < t.days) return false;
  return true;
}

/* ------------------------------------------------------------------ placeholders */

type Vars = Record<string, string>;

function varsFor(q: any, ev: PlatformEvent | null, wfName: string, extra: Vars = {}): Vars {
  const f = facts(q);
  return {
    client: f?.client || ev?.data?.from_name || '',
    contact: f?.contact || '',
    qn: f?.qn || '',
    amount: f ? inr(f.amount) : '',
    status: f?.status || '',
    days_quiet: f ? String(f.days_quiet) : '',
    owner: f?.created_by || '',
    from: String(ev?.data?.from || ev?.data?.sender || ''),
    subject: String(ev?.data?.subject || ''),
    workflow: wfName,
    ...extra,
  };
}

const render = (s: any, v: Vars) => String(s ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (k in v ? v[k] : `{{${k}}}`)).trim();

/* ------------------------------------------------------------------ validation */

const TRIGGERS = new Set(TRIGGER_OPTIONS.map((t) => t.type));
const ACTIONS = new Set(ACTION_OPTIONS.map((a) => a.type));
const OPS = new Set(OP_OPTIONS.map((o) => o.op));

type ValidationEnv = { statuses?: string[]; logModules?: Array<{ title: string; fields: any[] }>; members?: Array<{ id: string; email: string }> };

/**
 * Clean a workflow and throw a readable error on anything that would not run. Pass `env` (the
 * workspace's stages, log modules and people) to check names against the workspace too.
 */
export function validateWorkflow(w: any, env: ValidationEnv = {}): WorkflowData {
  if (!w || typeof w !== 'object') throw new Error('Describe the automation: a trigger and at least one step.');
  const t = w.trigger || {};
  if (!TRIGGERS.has(t.type)) throw new Error(`Pick when it runs. "${t.type || ''}" is not a trigger.`);
  const trigger: Trigger = { type: t.type };
  if (t.type === 'quote.status_changed') {
    for (const k of ['to', 'from'] as const) {
      const v = String(t[k] || '').trim();
      if (!v) continue;
      const match = env.statuses?.find((s) => eqi(s, v));
      if (env.statuses && !match) throw new Error(`"${v}" is not one of this workspace's stages: ${env.statuses.join(', ')}.`);
      trigger[k] = match || v;
    }
  }
  if (t.type === 'quote.quiet') {
    const days = Math.round(Number(t.days));
    if (!(days >= 1 && days <= 365)) throw new Error('Quiet for how many days? Use a number from 1 to 365.');
    trigger.days = days;
  }
  if (t.type === 'log.added' && t.module) {
    const m = env.logModules?.find((l) => eqi(l.title, t.module));
    if (env.logModules && !m) throw new Error(`There is no log module "${t.module}".`);
    trigger.module = m?.title || String(t.module);
  }

  const conditions: Condition[] = (Array.isArray(w.conditions) ? w.conditions : []).map((c: any, i: number) => {
    if (!c?.field) throw new Error(`Condition ${i + 1} needs a field.`);
    if (!OPS.has(c.op)) throw new Error(`Condition ${i + 1}: "${c.op}" is not a comparison.`);
    const op = OP_OPTIONS.find((o) => o.op === c.op)!;
    if (op.needsValue && (c.value == null || String(c.value).trim() === '')) throw new Error(`Condition ${i + 1} needs a value.`);
    if (op.numeric && !Number.isFinite(num(c.value))) throw new Error(`Condition ${i + 1} compares numbers: "${c.value}" is not one.`);
    return { field: String(c.field), op: c.op, ...(op.needsValue ? { value: op.numeric ? num(c.value) : c.value } : {}) };
  });

  const acts = Array.isArray(w.actions) ? w.actions : [];
  if (!acts.length) throw new Error('Add at least one step under Then.');
  if (acts.length > 10) throw new Error('Keep an automation to 10 steps or fewer.');
  const actions: WorkflowAction[] = acts.map((a: any, i: number) => {
    const n = `Step ${i + 1}`;
    if (!ACTIONS.has(a?.type)) throw new Error(`${n}: "${a?.type}" is not something an automation can do.`);
    const p = { ...(a.params || {}) };
    // forgiving about wording: "message" is what people (and the AI) naturally call it
    if (p.message != null) {
      if (a.type === 'notify' && !p.title) p.title = p.message;
      if ((a.type === 'slack' || a.type === 'webhook') && !p.text) p.text = p.message;
      if (a.type === 'add_note' && !p.body) p.body = p.message;
    }
    const need = (k: string, what: string) => { if (!String(p[k] ?? '').trim()) throw new Error(`${n} needs ${what}.`); };
    switch (a.type as ActionType) {
      case 'change_status': {
        need('status', 'a stage');
        const m = env.statuses?.find((s) => eqi(s, p.status));
        if (env.statuses && !m) throw new Error(`${n}: "${p.status}" is not one of this workspace's stages: ${env.statuses.join(', ')}.`);
        if (m) p.status = m;
        break;
      }
      case 'add_log_entry': {
        need('module', 'a log module');
        const m = env.logModules?.find((l) => eqi(l.title, p.module));
        if (env.logModules && !m) throw new Error(`${n}: there is no log module "${p.module}".`);
        if (m) p.module = m.title;
        if (!p.values || typeof p.values !== 'object' || !Object.values(p.values).some((v) => String(v ?? '').trim())) throw new Error(`${n} needs at least one value for the log entry.`);
        break;
      }
      case 'create_task': need('title', 'a task title'); break;
      case 'notify': if (!String(p.title || p.body || '').trim()) throw new Error(`${n} needs a message.`); if (!p.to) p.to = 'managers'; break;
      case 'send_email': need('subject', 'a subject'); need('body', 'a message'); if (!p.to) p.to = 'client'; break;
      case 'ai_follow_up': p.to = 'client'; break;
      case 'assign': {
        need('to', 'someone to hand it to');
        if (env.members && !env.members.some((m) => eqi(m.email, p.to))) throw new Error(`${n}: ${p.to} is not in this workspace.`);
        break;
      }
      case 'add_note': need('body', 'the note'); break;
      case 'slack': case 'webhook': need('text', 'a message'); break;
    }
    const approval = CLIENT_FACING.has(a.type) ? true : APPROVABLE.has(a.type) ? !!a.approval : false;
    return { type: a.type, params: p, approval };
  });

  return {
    enabled: w.enabled !== false,
    description: w.description ? String(w.description).slice(0, 500) : undefined,
    trigger, conditions, actions,
    created_by: w.created_by ?? null,
    source: w.source || 'user',
    runs: Number(w.runs || 0),
    last_run_at: w.last_run_at ?? null,
  };
}

/** The workspace's names, for validateWorkflow. */
export async function validationEnv(tenantId: string): Promise<ValidationEnv> {
  const [plan, members] = await Promise.all([metaPlan(tenantId), teamMembers(tenantId)]);
  return { statuses: plan.statuses, logModules: plan.logs, members };
}

/* ------------------------------------------------------------------ steps */

type StepOut = WorkflowRunData['steps'][number];

async function resolveMember(tenantId: string, who: string, q: any, w: WorkflowData): Promise<string | null> {
  const t = String(who || '').trim();
  if (!t || t === 'unassigned' || t === 'managers') return null;
  const email = t === 'owner' ? q?.created_by_email : t === 'creator' ? w.created_by : t;
  if (!email) return null;
  const m = (await teamMembers(tenantId)).find((x) => eqi(x.email, email));
  return m ? m.email : null;
}

/** An email the AI drafts from the quote itself, in the workspace's tone. Falls back to a template. */
async function draftFollowUp(tenantId: string, q: any, extra: string): Promise<{ subject: string; body: string }> {
  const f = facts(q)!;
  const fallback = {
    subject: `Following up on our quotation ${f.qn}`,
    body: `Dear ${f.contact || f.client || 'Sir/Madam'},\n\nI am following up on our quotation ${f.qn}${f.amount ? ` for ${inr(f.amount)}` : ''}. Please let me know if you have any questions, or if you would like us to revise anything.\n\nRegards`,
  };
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return fallback;
  try {
    const { data: schema } = await db.from('tenant_schemas').select('schema_config').eq('tenant_id', tenantId).maybeSingle();
    const ai = (schema?.schema_config || []).find((s: any) => s?.is_ai_settings) || {};
    const { data: tenant } = await db.from('tenants').select('company_name').eq('id', tenantId).maybeSingle();
    const items = (q.quotation_items || []).slice(0, 8).map((i: any) => `${i.quantity} × ${inr(i.item_rate)}`).join('; ');
    const prompt = `Write a short, polite follow-up email from ${tenant?.company_name || 'our company'} to a client about a quotation that has had no reply.
Client: ${f.client || 'unknown'}${f.contact ? `, contact ${f.contact}` : ''}
Quotation: ${f.qn}, stage ${f.status}, value ${inr(f.amount)}${items ? `, lines: ${items}` : ''}
Days since last contact: ${f.days_quiet}
Tone: ${ai.tone || 'Professional'}. English level: ${ai.englishLevel || 'Native'}.
${ai.instructions ? `Company instructions: ${String(ai.instructions).slice(0, 800)}` : ''}
${extra ? `Extra instructions for this follow-up: ${String(extra).slice(0, 500)}` : ''}
Rules: use only the facts above; never invent prices, products or dates; no placeholders like [Name]; at most 120 words; sign off with just "Regards".
Return JSON only: {"subject": "...", "body": "..."}`;
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://bloomgard.vercel.app' },
      body: JSON.stringify({ model: FAST_MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return fallback;
    const out = await res.json();
    const parsed = parseModelJson(out?.choices?.[0]?.message?.content || '{}');
    const subject = String(parsed.subject || '').trim(), body = String(parsed.body || '').trim();
    return subject && body ? { subject, body } : fallback;
  } catch {
    return fallback;
  }
}

/** Build the prepared action (permissions and names checked) without running it. */
async function prepared(kind: string, args: any, ctx: AgentCtx) {
  const out = await prepare(kind, args, ctx);
  if (out.result?.error) throw new Error(out.result.error);
  if (!out.pending) throw new Error('Nothing to do.');
  const p = out.pending;
  return { kind: p.kind, title: p.title, summary: p.summary, details: p.details, payload: p.payload };
}

type RunEnv = {
  tenantId: string;
  rec: Rec<WorkflowData>;
  ev: PlatformEvent;
  q: any;
  vars: Vars;
  dry: boolean;
  depth: number;
  chain: string[];
  ctx: () => Promise<AgentCtx>;
};

async function runStep(a: WorkflowAction, env: RunEnv): Promise<StepOut> {
  const { tenantId, rec, q, vars, dry } = env;
  const w = rec.data, name = rec.title, p = a.params || {};
  const step = (outcome: StepOut['outcome'], detail: string): StepOut => ({ action: a.type, outcome, detail });
  const meta = ACTION_OPTIONS.find((x) => x.type === a.type);
  if (meta?.needsQuote && !q) return step('skipped', 'No quote to act on.');
  const qn = q?.qn_number || '';
  const label = `Workflow: ${name}`;
  const scoped = <T>(fn: () => Promise<T>) => automationScope.run({ depth: env.depth + 1, chain: [...env.chain, rec.id] }, fn);

  /** Run a tool-backed action now, or put it on the OK list. */
  const doOrQueue = async (kind: string, args: any, approval: boolean, verb: string, assignTo?: string | null) => {
    if (dry) return step(approval ? 'queued' : 'done', `Would ${approval ? 'ask for an OK to ' : ''}${verb}.`);
    const ctx = await env.ctx();
    const action = await prepared(kind, args, ctx);
    if (approval) {
      const t = await createTask(tenantId, {
        title: action.title + (qn ? ` · ${qn}` : ''), type: 'approval', action, note: `${label}. ${action.summary}`,
        source: 'workflow', source_ref: rec.id, source_label: label, quote_id: q?.id || null, qn: qn || null,
        assigned_to: assignTo || null, created_by: w.created_by || null,
      });
      return step('queued', `Waiting for an OK: ${action.summary} (task ${t.id.slice(0, 8)}).`);
    }
    // executeAction emits its own follow-on event; hand it this chain so loops stay guarded
    const chained = { ...ctx, event: { depth: env.depth + 1, chain: [...env.chain, rec.id] } } as AgentCtx;
    const out = await scoped(() => executeAction(kind, action.payload, chained));
    return step('done', out.message);
  };

  try {
    switch (a.type) {
      case 'change_status': {
        if (eqi(q.status, p.status)) return step('skipped', `Already ${q.status}.`);
        return await doOrQueue('update_quote_status', { qn, status: p.status, comment: render(p.comment, vars) || label }, !!a.approval, `move ${qn} from ${q.status} to ${p.status}`);
      }
      case 'add_log_entry': {
        const values: Record<string, string> = {};
        for (const [k, v] of Object.entries(p.values || {})) if (String(v ?? '').trim()) values[k] = render(v, vars);
        return await doOrQueue('add_log_entry', { qn, module: p.module, values }, !!a.approval, `add an entry to ${p.module} on ${qn}`);
      }
      case 'send_email':
      case 'ai_follow_up': {
        const f = facts(q);
        const to = a.type === 'ai_follow_up' || !p.to || p.to === 'client' ? (f?.client_email || '') : render(p.to, vars);
        if (!to) return step('failed', `No client email on ${qn || 'this quote'}, so there is nobody to write to.`);
        const owner = await resolveMember(tenantId, 'owner', q, w);
        if (dry) return step('queued', a.type === 'ai_follow_up' ? `Would draft an AI follow-up to ${to} and put it on the OK list.` : `Would draft "${render(p.subject, vars)}" to ${to} and put it on the OK list.`);
        const mail = a.type === 'ai_follow_up' ? await draftFollowUp(tenantId, q, render(p.instructions, vars)) : { subject: render(p.subject, vars), body: render(p.body, vars) };
        // always an approval: nothing reaches a client without a person's OK
        return await doOrQueue('send_email', { to, subject: mail.subject, body: mail.body, quote_qn: qn || null }, true, `email ${to}`, owner);
      }
      case 'create_task': {
        const title = render(p.title, vars);
        const assignee = await resolveMember(tenantId, p.assign_to, q, w);
        const due = Number(p.due_in_days) > 0 ? new Date(Date.now() + Number(p.due_in_days) * 86400000).toISOString() : null;
        if (dry) return step('done', `Would create the task "${title}"${assignee ? ` for ${assignee}` : ''}.`);
        await createTask(tenantId, {
          title, type: 'todo', note: render(p.note, vars) || undefined, source: 'workflow', source_ref: rec.id, source_label: label,
          quote_id: q?.id || null, qn: qn || null, assigned_to: assignee, due_at: due, created_by: w.created_by || null,
        });
        return step('done', `Created the task "${title}"${assignee ? ` for ${assignee}` : ''}.`);
      }
      case 'notify': {
        const title = render(p.title || p.body, vars), body = p.title ? render(p.body, vars) : '';
        let to: string[] | 'managers';
        if (!p.to || p.to === 'managers') to = 'managers';
        else if (p.to === 'owner' || p.to === 'creator') {
          const m = await resolveMember(tenantId, p.to, q, w);
          if (!m) return step('skipped', `No ${p.to === 'owner' ? 'quote owner' : 'creator'} in the workspace to notify.`);
          to = [m];
        } else to = String(p.to).split(',').map((s) => s.trim()).filter(Boolean);
        if (dry) return step('done', `Would notify ${to === 'managers' ? 'the managers' : to.join(', ')}: "${title}".`);
        const n = await notify(tenantId, to, { title, body: body || undefined, link: q ? { view: 'pipeline', quote_id: q.id } : { view: 'home' }, from_email: null });
        return step(n ? 'done' : 'skipped', n ? `Notified ${n} ${n === 1 ? 'person' : 'people'}: "${title}".` : 'Nobody matched to notify.');
      }
      case 'assign': {
        const m = (await teamMembers(tenantId)).find((x) => eqi(x.email, p.to));
        if (!m) return step('failed', `${p.to} is not in this workspace.`);
        if (eqi(q.created_by_email, m.email)) return step('skipped', `Already with ${m.email}.`);
        if (dry) return step('done', `Would hand ${qn} to ${m.email}.`);
        const { error } = await db.from('quotations').update({ created_by_email: m.email }).eq('id', q.id).eq('tenant_id', tenantId);
        if (error) throw new Error(error.message);
        await notify(tenantId, [m.id], { title: `${qn} is now yours`, body: `${facts(q)?.client || ''} — handed over by ${label}.`, link: { view: 'pipeline', quote_id: q.id }, from_email: null });
        return step('done', `Handed ${qn} to ${m.email}.`);
      }
      case 'add_note': {
        const body = render(p.body, vars);
        if (dry) return step('done', `Would add the note "${body.slice(0, 80)}" to ${qn}.`);
        const ctx = await env.ctx();
        await scoped(() => addComment(tenantId, { quote_id: q.id, body, author_id: ctx.userId, author_email: ctx.email, author_name: label, qn } as any));
        return step('done', `Added a team note to ${qn}.`);
      }
      case 'slack':
      case 'webhook': {
        const text = render(p.text, vars);
        if (dry) return step('done', `Would ${a.type === 'slack' ? 'post to Slack' : 'call your webhook'}: "${text.slice(0, 80)}".`);
        const out = await sendPluginMessage(tenantId, a.type, { text, event: env.ev, data: { workflow: name, quote: facts(q) } });
        return step(out.ok ? 'done' : 'failed', out.detail);
      }
      default:
        return step('skipped', `Unknown step ${a.type}.`);
    }
  } catch (e: any) {
    return step('failed', e?.message || 'Failed.');
  }
}

/* ------------------------------------------------------------------ running */

async function runOne(rec: Rec<WorkflowData>, ev: PlatformEvent, q: any, o: { dry?: boolean; depth: number; chain: string[]; extraVars?: Vars }): Promise<WorkflowRunData> {
  const w = rec.data;
  const base: WorkflowRunData = { workflow_id: rec.id, workflow_name: rec.title, event: ev.type, quote_id: q?.id || null, qn: q?.qn_number || null, outcome: 'skipped', steps: [], dry_run: !!o.dry };
  if ((w.conditions || []).length && !q) return { ...base, steps: [{ action: w.actions[0]?.type, outcome: 'skipped', detail: 'Its conditions need a quote, and this event has none.' }] };
  const failed = (w.conditions || []).find((c) => !conditionHolds(c, q));
  if (failed) return base; // not a match: not recorded as a run

  let ctxP: Promise<AgentCtx> | null = null;
  const env: RunEnv = {
    tenantId: rec.tenant_id, rec, ev, q, dry: !!o.dry, depth: o.depth, chain: o.chain,
    vars: varsFor(q, ev, rec.title, o.extraVars),
    ctx: () => (ctxP ||= systemCtx(rec.tenant_id, w.created_by)),
  };
  const steps: StepOut[] = [];
  for (const a of w.actions || []) steps.push(await runStep(a, env));
  const outcome: WorkflowRunData['outcome'] = steps.some((s) => s.outcome === 'failed') ? 'failed'
    : steps.some((s) => s.outcome === 'queued') ? 'queued' : steps.some((s) => s.outcome === 'done') ? 'done' : 'skipped';
  const run: WorkflowRunData = { ...base, outcome, steps };
  if (!o.dry) {
    await createRec<WorkflowRunData>(rec.tenant_id, 'workflow_run', rec.title, run);
    await updateRec<WorkflowData>(rec.tenant_id, 'workflow', rec.id, { runs: Number(w.runs || 0) + 1, last_run_at: new Date().toISOString() });
  }
  return run;
}

/** Has this workflow already run on this quote within `days`? (quiet / due / daily dedupe) */
async function ranRecently(tenantId: string, workflowId: string, quoteId: string | null, days: number) {
  const match: Record<string, any> = { workflow_id: workflowId };
  if (quoteId) match.quote_id = quoteId;
  const runs = await listRecs<WorkflowRunData>(tenantId, 'workflow_run', { match, limit: 5 });
  const since = Date.now() - days * 86400000;
  return runs.some((r) => !r.data.dry_run && r.data.outcome !== 'skipped' && new Date(r.created_at).getTime() >= since);
}

async function enabledWorkflows(tenantId: string) {
  return (await listRecs<WorkflowData>(tenantId, 'workflow', { limit: 200 })).filter((r) => r.data?.enabled && r.data.trigger);
}

/** Run every enabled workflow whose trigger and conditions match. Returns how many ran. */
export async function runWorkflowsForEvent(ev: PlatformEvent): Promise<number> {
  const scope = automationScope.getStore();
  const depth = Math.max(ev.depth || 0, scope?.depth || 0);
  const chain = [...new Set([...(ev.chain || []), ...(scope?.chain || [])])];
  if (depth > MAX_DEPTH) return 0;
  const flows = (await enabledWorkflows(ev.tenantId)).filter((r) => !chain.includes(r.id) && triggerMatches(r.data.trigger, ev));
  if (!flows.length) return 0;
  const q = await loadQuote(ev.tenantId, ev.quoteId);
  let ran = 0;
  for (const rec of flows) {
    if (TRIGGER_OPTIONS.find((t) => t.type === rec.data.trigger.type)?.quoteBound && !q && rec.data.trigger.type !== 'manual') continue;
    if ((ev.type === 'quote.quiet' || ev.type === 'quote.due') && await ranRecently(ev.tenantId, rec.id, q?.id || null, ev.type === 'quote.quiet' ? rec.data.trigger.days || 5 : 7)) continue;
    try {
      const run = await runOne(rec, ev, q, { depth, chain });
      if (run.outcome !== 'skipped' || run.steps.length) ran++;
    } catch (e) {
      console.error('[workflows] run failed', rec.id, e);
    }
  }
  return ran;
}

/** Quotes a quote-bound trigger would consider, for a dry run or a manual run. */
function candidatesFor(t: Trigger, quotes: any[]) {
  switch (t.type) {
    case 'quote.quiet': return quotes.filter((q) => isOpen(q) && (facts(q)!.days_quiet >= (t.days || 5)));
    case 'quote.due': return quotes.filter((q) => isOpen(q) && q.follow_up_due_date && new Date(q.follow_up_due_date).getTime() <= Date.now());
    case 'quote.status_changed': return quotes.filter((q) => (!t.to || eqi(q.status, t.to)));
    default: return quotes.filter((q) => String(q.status || '').toLowerCase() !== 'lead');
  }
}

/**
 * What a workflow would do, without doing any of it: the quotes it would match today and, for each,
 * one "would …" line per step. Status-change triggers are approximated by quotes already in the
 * target stage. Nothing is written, sent or drafted.
 */
export async function dryRunWorkflow(tenantId: string, workflow: WorkflowData, o: { limit?: number; name?: string } = {}) {
  const w = validateWorkflow(workflow, await validationEnv(tenantId));
  const rec: Rec<WorkflowData> = { id: 'dry-run', tenant_id: tenantId, kind: 'workflow', title: o.name || 'This automation', data: w, created_at: new Date().toISOString() };
  const quoteBound = TRIGGER_OPTIONS.find((t) => t.type === w.trigger.type)?.quoteBound;
  const fakeEv: PlatformEvent = { type: (w.trigger.type === 'manual' ? 'quote.updated' : w.trigger.type) as any, tenantId, data: { to: w.trigger.to, from: w.trigger.from, module: w.trigger.module } };
  if (!quoteBound) {
    const extra = w.trigger.type === 'schedule.daily' ? await digestVars(tenantId) : {};
    const run = await runOne(rec, { ...fakeEv, data: { ...fakeEv.data, from: 'client@example.com', subject: 'Enquiry' } }, null, { dry: true, depth: 0, chain: [], extraVars: extra });
    return { scanned: 0, matched: 1, samples: [{ quote_id: null, qn: null, client: null, amount: null, status: null, days_quiet: null, steps: run.steps }] };
  }
  const quotes = await loadQuotes(tenantId, { limit: 1000 });
  const pool = candidatesFor(w.trigger, quotes).filter((q) => (w.conditions || []).every((c) => conditionHolds(c, q)));
  const limit = Math.min(o.limit ?? 10, 25);
  const samples = [];
  for (const q of pool.slice(0, limit)) {
    const run = await runOne(rec, { ...fakeEv, quoteId: q.id }, q, { dry: true, depth: 0, chain: [] });
    const f = facts(q)!;
    samples.push({ quote_id: q.id, qn: f.qn, client: f.client, amount: f.amount, status: f.status, days_quiet: f.days_quiet, steps: run.steps });
  }
  return { scanned: quotes.length, matched: pool.length, samples };
}

/**
 * "Run now": on one quote (conditions still apply), or on every quote it would match today, at most
 * 25. Email steps still only reach the OK list.
 */
export async function runWorkflowNow(tenantId: string, workflowId: string, o: { quoteId?: string | null; actorEmail?: string | null } = {}) {
  const rec = await getRec<WorkflowData>(tenantId, 'workflow', workflowId);
  if (!rec) throw new Error('No such automation.');
  const w = rec.data;
  const ev: PlatformEvent = { type: (w.trigger.type === 'manual' ? 'quote.updated' : w.trigger.type) as any, tenantId, actorEmail: o.actorEmail || null, data: { to: w.trigger.to, from: w.trigger.from, manual: true } };
  const quoteBound = TRIGGER_OPTIONS.find((t) => t.type === w.trigger.type)?.quoteBound;
  const results: WorkflowRunData[] = [];
  if (o.quoteId) {
    const q = await loadQuote(tenantId, o.quoteId);
    if (!q) throw new Error('No such quote in this workspace.');
    const run = await runOne(rec, { ...ev, quoteId: q.id }, q, { depth: 0, chain: [] });
    if (!run.steps.length && run.outcome === 'skipped') throw new Error(`${q.qn_number} does not meet this automation's conditions.`);
    results.push(run);
  } else if (!quoteBound) {
    results.push(await runOne(rec, ev, null, { depth: 0, chain: [], extraVars: w.trigger.type === 'schedule.daily' ? await digestVars(tenantId) : {} }));
  } else {
    const quotes = await loadQuotes(tenantId, { limit: 1000 });
    const pool = candidatesFor(w.trigger, quotes).filter((q) => (w.conditions || []).every((c) => conditionHolds(c, q))).slice(0, 25);
    for (const q of pool) results.push(await runOne(rec, { ...ev, quoteId: q.id }, q, { depth: 0, chain: [] }));
  }
  return { runs: results.length, results };
}

/** Numbers for the morning digest. */
async function digestVars(tenantId: string): Promise<Vars> {
  const quotes = await loadQuotes(tenantId, { limit: 2000 });
  const open = quotes.filter(isOpen);
  const quiet = open.filter((q) => facts(q)!.days_quiet >= 5);
  const pipeline = open.reduce((s, q) => s + quoteValue(q), 0);
  return { open_quotes: String(open.length), quiet_quotes: String(quiet.length), pipeline: inr(pipeline) };
}

/**
 * The daily scheduler (GET /api/cron/tick): quiet quotes, due follow-ups and morning workflows,
 * for one workspace or all of them. Each workflow acts on at most 50 quotes per tick, and never on
 * the same quote again within its own window.
 */
export async function runScheduled(o: { tenantId?: string } = {}) {
  let tenantIds: string[];
  if (o.tenantId) tenantIds = [o.tenantId];
  else {
    const { data } = await db.from('tenants').select('id');
    tenantIds = (data || []).map((t: any) => t.id);
  }
  const summary = { tenants: 0, workflows: 0, runs: 0, errors: [] as string[] };
  for (const tenantId of tenantIds) {
    try {
      const flows = (await enabledWorkflows(tenantId)).filter((r) => ['quote.quiet', 'quote.due', 'schedule.daily'].includes(r.data.trigger.type));
      if (!flows.length) continue;
      summary.tenants++;
      let quotes: any[] | null = null;
      const allQuotes = async () => (quotes ||= await loadQuotes(tenantId, { limit: 2000 }));
      for (const rec of flows) {
        summary.workflows++;
        const t = rec.data.trigger;
        if (t.type === 'schedule.daily') {
          if (rec.data.last_run_at && Date.now() - new Date(rec.data.last_run_at).getTime() < 20 * 3600 * 1000) continue;
          await runOne(rec, { type: 'schedule.daily', tenantId }, null, { depth: 0, chain: [], extraVars: await digestVars(tenantId) });
          summary.runs++;
          continue;
        }
        const pool = candidatesFor(t, await allQuotes()).filter((q) => (rec.data.conditions || []).every((c) => conditionHolds(c, q)));
        let done = 0;
        for (const q of pool) {
          if (done >= 50) break;
          const window = t.type === 'quote.quiet' ? t.days || 5 : 7;
          if (await ranRecently(tenantId, rec.id, q.id, window)) continue;
          await runOne(rec, { type: t.type as any, tenantId, quoteId: q.id, data: { days: facts(q)!.days_quiet } }, q, { depth: 0, chain: [] });
          done++; summary.runs++;
        }
      }
    } catch (e: any) {
      summary.errors.push(`${tenantId.slice(0, 8)}: ${e?.message || e}`);
    }
  }
  return summary;
}
