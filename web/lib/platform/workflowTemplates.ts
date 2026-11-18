/**
 * Ready-made automations for a quote desk, and the plain-English sentence for any workflow.
 * Pure data and string helpers: safe to import from the browser (AutomationsView) and the server.
 */
import type { ActionType, Condition, ConditionOp, Trigger, TriggerType, WorkflowAction, WorkflowData } from './types';

/* ------------------------------------------------------------------ vocabulary */

export const TRIGGER_OPTIONS: Array<{ type: TriggerType; label: string; quoteBound: boolean }> = [
  { type: 'quote.created', label: 'A quote is created', quoteBound: true },
  { type: 'quote.status_changed', label: 'A quote changes stage', quoteBound: true },
  { type: 'quote.quiet', label: 'A quote goes quiet', quoteBound: true },
  { type: 'quote.due', label: "A quote's follow-up date arrives", quoteBound: true },
  { type: 'log.added', label: 'A log entry is added', quoteBound: true },
  { type: 'email.received', label: 'A client email arrives', quoteBound: false },
  { type: 'comment.added', label: 'A team note is added', quoteBound: true },
  { type: 'schedule.daily', label: 'Every morning at 9', quoteBound: false },
  { type: 'manual', label: 'Only when run by hand', quoteBound: true },
];

export const ACTION_OPTIONS: Array<{ type: ActionType; label: string; needsQuote: boolean; clientFacing?: boolean; approvable?: boolean }> = [
  { type: 'ai_follow_up', label: 'Draft an AI follow-up to the client', needsQuote: true, clientFacing: true },
  { type: 'send_email', label: 'Draft an email', needsQuote: false, clientFacing: true },
  { type: 'change_status', label: 'Move the quote to a stage', needsQuote: true, approvable: true },
  { type: 'add_log_entry', label: 'Add a log entry', needsQuote: true, approvable: true },
  { type: 'create_task', label: 'Create a task', needsQuote: false },
  { type: 'notify', label: 'Notify people in the app', needsQuote: false },
  { type: 'assign', label: 'Hand the quote to someone', needsQuote: true },
  { type: 'add_note', label: 'Add a team note to the quote', needsQuote: true },
  { type: 'slack', label: 'Post to Slack', needsQuote: false },
  { type: 'webhook', label: 'Call your webhook', needsQuote: false },
];

export const CLIENT_FACING: ReadonlySet<ActionType> = new Set(['send_email', 'ai_follow_up']);
export const APPROVABLE: ReadonlySet<ActionType> = new Set(['change_status', 'add_log_entry', 'send_email', 'ai_follow_up']);

export const BASE_FIELDS: Array<{ key: string; label: string; type: 'text' | 'number' }> = [
  { key: 'status', label: 'Stage', type: 'text' },
  { key: 'amount', label: 'Amount (₹)', type: 'number' },
  { key: 'client', label: 'Client', type: 'text' },
  { key: 'created_by', label: 'Owner (email)', type: 'text' },
  { key: 'days_quiet', label: 'Days quiet', type: 'number' },
  { key: 'qn', label: 'Quote number', type: 'text' },
];

export const OP_OPTIONS: Array<{ op: ConditionOp; label: string; needsValue: boolean; numeric?: boolean }> = [
  { op: 'eq', label: 'is', needsValue: true },
  { op: 'neq', label: 'is not', needsValue: true },
  { op: 'gt', label: 'is over', needsValue: true, numeric: true },
  { op: 'gte', label: 'is at least', needsValue: true, numeric: true },
  { op: 'lt', label: 'is under', needsValue: true, numeric: true },
  { op: 'lte', label: 'is at most', needsValue: true, numeric: true },
  { op: 'contains', label: 'contains', needsValue: true },
  { op: 'not_contains', label: "doesn't contain", needsValue: true },
  { op: 'in', label: 'is one of', needsValue: true },
  { op: 'empty', label: 'is empty', needsValue: false },
  { op: 'not_empty', label: 'is filled in', needsValue: false },
];

export const PLACEHOLDERS = ['{{client}}', '{{contact}}', '{{qn}}', '{{amount}}', '{{status}}', '{{days_quiet}}', '{{owner}}', '{{from}}', '{{subject}}', '{{open_quotes}}', '{{quiet_quotes}}', '{{pipeline}}'];

export const inr = (n: any) => {
  const v = Number(String(n ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(v) ? `₹${Math.round(v).toLocaleString('en-IN')}` : String(n ?? '');
};

/* ------------------------------------------------------------------ the sentence */

const who = (to: string) => {
  const t = String(to || '').trim();
  if (!t || t === 'unassigned') return '';
  if (t === 'owner') return 'the quote owner';
  if (t === 'creator') return 'whoever made this';
  if (t === 'managers') return 'the managers';
  if (t === 'client') return 'the client';
  return t;
};

export function describeTrigger(t: Trigger): string {
  switch (t?.type) {
    case 'quote.created': return 'When a quote is created';
    case 'quote.status_changed':
      return `When a quote moves${t.from ? ` out of ${t.from}` : ''}${t.to ? ` to ${t.to}` : ' to any stage'}`;
    case 'quote.quiet': return `When a quote goes quiet for ${t.days || 5} day${(t.days || 5) === 1 ? '' : 's'}`;
    case 'quote.due': return "When a quote's follow-up date arrives";
    case 'log.added': return `When an entry is added to ${t.module || 'any log'}`;
    case 'email.received': return 'When a client email arrives';
    case 'comment.added': return 'When a team note is added';
    case 'schedule.daily': return 'Every morning at 9';
    case 'manual': return 'When run by hand';
    default: return 'When something happens';
  }
}

export function describeCondition(c: Condition, fieldLabel?: (key: string) => string): string {
  const base = BASE_FIELDS.find((f) => f.key === c.field);
  const label = base ? base.label.replace(' (₹)', '').replace(' (email)', '').toLowerCase()
    : (fieldLabel?.(c.field) || String(c.field || '').split('.').pop()?.replace(/_/g, ' ') || 'a field');
  const op = OP_OPTIONS.find((o) => o.op === c.op);
  if (!op) return label;
  if (!op.needsValue) return `${label} ${op.label}`;
  const value = c.field === 'amount' ? inr(c.value) : Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '');
  return `${label} ${op.label} ${value}`;
}

export function describeAction(a: WorkflowAction): string {
  const p = a.params || {};
  let s: string;
  switch (a.type) {
    case 'change_status': s = `move it to ${p.status || '…'}`; break;
    case 'add_log_entry': s = `log it in ${p.module || '…'}`; break;
    case 'create_task': s = `create a task${p.title ? ` "${p.title}"` : ''}${who(p.assign_to) ? ` for ${who(p.assign_to)}` : ''}`; break;
    case 'notify': s = `notify ${who(p.to) || 'the managers'}`; break;
    case 'send_email': s = `draft an email to ${who(p.to) || 'the client'}`; break;
    case 'ai_follow_up': s = 'draft an AI follow-up to the client'; break;
    case 'assign': s = `hand it to ${p.to || '…'}`; break;
    case 'add_note': s = 'add a team note'; break;
    case 'slack': s = 'post to Slack'; break;
    case 'webhook': s = 'call your webhook'; break;
    default: s = String(a.type);
  }
  return CLIENT_FACING.has(a.type) || a.approval ? `${s} (needs OK)` : s;
}

export function describeWorkflow(w: Pick<WorkflowData, 'trigger' | 'conditions' | 'actions'>, fieldLabel?: (key: string) => string): string {
  const conds = (w.conditions || []).map((c) => describeCondition(c, fieldLabel));
  const acts = (w.actions || []).map(describeAction);
  return `${describeTrigger(w.trigger)}${conds.length ? `, if ${conds.join(' and ')}` : ''} → ${acts.length ? acts.join(', then ') : 'nothing yet'}.`;
}

/* ------------------------------------------------------------------ templates */

export type WorkflowTemplate = { id: string; name: string; blurb: string; workflow: Omit<WorkflowData, 'enabled'> };

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'chase-quiet',
    name: 'Chase quiet quotes',
    blurb: 'After 5 days with no contact, the AI drafts a follow-up from the quote itself. It waits on the OK list for you to send.',
    workflow: { trigger: { type: 'quote.quiet', days: 5 }, conditions: [], actions: [{ type: 'ai_follow_up', params: { to: 'client', instructions: '' }, approval: true }], source: 'template' },
  },
  {
    id: 'approved-po',
    name: 'Approved: raise the PO',
    blurb: 'When a quote is approved, the owner gets a task to raise the PO or invoice, and the managers hear about it.',
    workflow: {
      trigger: { type: 'quote.status_changed', to: 'Approved' }, conditions: [],
      actions: [
        { type: 'create_task', params: { title: 'Raise PO / invoice for {{qn}} ({{client}})', assign_to: 'owner', due_in_days: 2 } },
        { type: 'notify', params: { to: 'managers', title: '{{qn}} approved: {{client}}, {{amount}}' } },
      ],
      source: 'template',
    },
  },
  {
    id: 'big-quote',
    name: 'Big quotes get a second look',
    blurb: 'A new quote over ₹5,00,000 puts a pricing check on the OK list for the managers before it goes out.',
    workflow: {
      trigger: { type: 'quote.created' }, conditions: [{ field: 'amount', op: 'gt', value: 500000 }],
      actions: [
        { type: 'create_task', params: { title: 'Check pricing on {{qn}} ({{amount}}) before it goes out', assign_to: 'unassigned', note: '{{client}} — created by {{owner}}.', due_in_days: 1 } },
        { type: 'notify', params: { to: 'managers', title: 'Big quote: {{qn}} for {{client}}, {{amount}}' } },
      ],
      source: 'template',
    },
  },
  {
    id: 'new-enquiry',
    name: 'Every enquiry gets an owner',
    blurb: 'When a client email arrives, a task to reply goes to the quote owner, or to the team when no quote matches.',
    workflow: { trigger: { type: 'email.received' }, conditions: [], actions: [{ type: 'create_task', params: { title: 'Reply to {{from}}: {{subject}}', assign_to: 'owner', due_in_days: 1 } }], source: 'template' },
  },
  {
    id: 'lost-reason',
    name: 'Learn from lost quotes',
    blurb: 'When a quote is marked Lost, the owner is asked to note the reason so the team can see patterns.',
    workflow: {
      trigger: { type: 'quote.status_changed', to: 'Lost' }, conditions: [],
      actions: [
        { type: 'add_note', params: { body: 'Marked Lost. Add the reason here (price, delivery, competitor, no reply) so the team can learn from it.' } },
        { type: 'create_task', params: { title: 'Note why {{qn}} ({{client}}) was lost', assign_to: 'owner', due_in_days: 1 } },
      ],
      source: 'template',
    },
  },
  {
    id: 'due-reached',
    name: 'Follow-up date reminders',
    blurb: "On a quote's follow-up date, its owner gets a reminder in the app.",
    workflow: { trigger: { type: 'quote.due' }, conditions: [], actions: [{ type: 'notify', params: { to: 'owner', title: 'Follow up today: {{qn}} ({{client}}, {{amount}})', body: 'Quiet for {{days_quiet}} days.' } }], source: 'template' },
  },
  {
    id: 'daily-digest',
    name: 'Morning pipeline digest',
    blurb: 'Every morning the managers get one line: how many quotes are open, how many have gone quiet, and the pipeline value.',
    workflow: { trigger: { type: 'schedule.daily' }, conditions: [], actions: [{ type: 'notify', params: { to: 'managers', title: 'Today: {{open_quotes}} open quotes, {{quiet_quotes}} quiet', body: '{{pipeline}} in the pipeline.' } }], source: 'template' },
  },
];
