/**
 * Shared shapes for the workspace platform: the OK list (tasks), workflows, notifications, team
 * notes, plugins, and the AI builder's sandbox (changesets), plus saved views and skills.
 * Every record lives in the tenant-scoped store (lib/platform/store.ts).
 */

export type Kind =
  | 'task' | 'workflow' | 'workflow_run' | 'notification' | 'comment'
  | 'plugin' | 'changeset' | 'view' | 'skill' | 'share' | 'lead';

export type Rec<T = any> = { id: string; tenant_id: string; kind: Kind; title: string; data: T; created_at: string };

/* ---------------------------------------------------------------- tasks: the OK list */

/** An action the AI or a workflow prepared, in the same shape the chat's confirm cards use. */
export type PreparedAction = {
  kind: string;                 // a WRITE_TOOLS name, e.g. update_quote_status, send_email
  title: string;
  summary: string;
  details?: Array<[string, string]>;
  payload: any;
};

export type TaskData = {
  type: 'approval' | 'todo';
  status: 'open' | 'done' | 'dismissed' | 'failed';
  action?: PreparedAction;       // approvals only: what happens on Approve
  note?: string;                 // free text for a to-do, or why it exists
  source: 'workflow' | 'ai' | 'user';
  source_ref?: string;           // workflow id, chat message id …
  source_label?: string;         // "Workflow: Chase quiet quotes"
  quote_id?: string | null;
  qn?: string | null;
  assigned_to?: string | null;   // profile id
  assigned_email?: string | null;
  due_at?: string | null;
  created_by?: string | null;    // email
  decided_by?: string | null;
  decided_at?: string | null;
  result?: string | null;
  updated_at?: string;
};

/* ---------------------------------------------------------------- events & workflows */

export type EventType =
  | 'quote.created'
  | 'quote.status_changed'
  | 'quote.updated'
  | 'log.added'
  | 'email.received'
  | 'comment.added'
  | 'task.completed'
  | 'quote.quiet'          // from the scheduler: no contact for N days
  | 'quote.due'            // from the scheduler: follow-up due date reached
  | 'schedule.daily';      // from the scheduler, once a day

export type PlatformEvent = {
  type: EventType;
  tenantId: string;
  quoteId?: string | null;
  actorEmail?: string | null;
  data?: Record<string, any>;     // e.g. { from, to } for status changes, { module, entry } for logs
  depth?: number;                 // how many workflow hops led here; capped to stop loops
  chain?: string[];               // workflow ids already run in this chain
};

export type TriggerType = 'quote.created' | 'quote.status_changed' | 'quote.quiet' | 'quote.due'
  | 'log.added' | 'email.received' | 'comment.added' | 'schedule.daily' | 'manual';

export type Trigger = {
  type: TriggerType;
  to?: string;          // quote.status_changed: only into this status
  from?: string;        // quote.status_changed: only out of this status
  days?: number;        // quote.quiet: quiet for at least this many days
  module?: string;      // log.added: only this log module
};

export type ConditionOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains' | 'empty' | 'not_empty' | 'in';
/** field: status | amount | client | created_by | days_quiet | qn | or "Section.field_key" for any form field */
export type Condition = { field: string; op: ConditionOp; value?: any };

export type ActionType =
  | 'change_status' | 'add_log_entry' | 'create_task' | 'notify' | 'send_email'
  | 'ai_follow_up' | 'assign' | 'webhook' | 'slack' | 'add_note';

export type WorkflowAction = {
  type: ActionType;
  params: Record<string, any>;
  approval?: boolean;   // put it on the OK list instead of doing it; always on for anything a client sees
};

export type WorkflowData = {
  enabled: boolean;
  description?: string;
  trigger: Trigger;
  conditions: Condition[];
  actions: WorkflowAction[];
  created_by?: string | null;     // email
  source?: 'user' | 'ai' | 'template';
  runs?: number;
  last_run_at?: string | null;
  updated_at?: string;
};

export type WorkflowRunData = {
  workflow_id: string;
  workflow_name: string;
  event: EventType;
  quote_id?: string | null;
  qn?: string | null;
  outcome: 'done' | 'queued' | 'skipped' | 'failed';
  steps: Array<{ action: ActionType; outcome: 'done' | 'queued' | 'failed' | 'skipped'; detail: string }>;
  dry_run?: boolean;
};

/* ---------------------------------------------------------------- team */

export type NotificationData = {
  user_id: string;
  title: string;
  body?: string;
  link?: { view: string; quote_id?: string; task_id?: string; sub?: string };
  read_at?: string | null;
  from_email?: string | null;
};

export type CommentData = {
  quote_id: string;
  body: string;
  author_id: string;
  author_email: string;
  author_name?: string | null;
  mentions: string[];     // profile ids
};

/* ---------------------------------------------------------------- plugins */

export type PluginType = 'webhook' | 'slack' | 'inbound_api' | 'accounting_export' | 'whatsapp' | 'calls';

export type PluginData = {
  type: PluginType;
  enabled: boolean;
  config: Record<string, any>;    // secrets are never returned to the browser in full
  events?: EventType[];           // webhook / slack: which events to send
  last_delivery?: { at: string; ok: boolean; status?: number; error?: string } | null;
  updated_at?: string;
};

/* ---------------------------------------------------------------- the AI builder's sandbox */

export type ChangeOp =
  | { type: 'form.replace'; modules: any[] }                       // the whole quote form (Field Configurator)
  | { type: 'workflow.upsert'; id?: string; name: string; workflow: WorkflowData }
  | { type: 'workflow.delete'; id: string }
  | { type: 'view.upsert'; id?: string; name: string; view: ViewData }
  | { type: 'view.delete'; id: string }
  | { type: 'skill.upsert'; id?: string; name: string; skill: SkillData }
  | { type: 'skill.delete'; id: string }
  | { type: 'ai_settings.update'; changes: Record<string, any> }
  | { type: 'data.fix'; label: string; quote_id: string; set: { status?: string; meta?: Record<string, Record<string, any>> } };

export type ChangesetData = {
  status: 'draft' | 'applied' | 'discarded' | 'rolled_back' | 'failed';
  summary: string;               // one paragraph: what and why
  ops: ChangeOp[];
  lines?: string[];              // human-readable preview, one per change
  snapshot?: any;                // what the applied ops replaced, for Roll back
  created_by?: string | null;
  source: 'ai' | 'user';
  applied_by?: string | null;
  applied_at?: string | null;
  error?: string | null;
  updated_at?: string;
};

/** A saved, filtered list of quotes that shows up as a tab on Quotes. */
export type ViewData = {
  filters: {
    statuses?: string[];
    created_by?: string;         // email, or "me"
    client_contains?: string;
    min_amount?: number;
    max_amount?: number;
    quiet_days?: number;         // no contact for at least N days
  };
  sort?: { key: 'date' | 'amount' | 'quiet'; dir: 'asc' | 'desc' };
  shared: boolean;               // the whole team sees it, or only its creator
  created_by?: string | null;
};

/** A saved instruction for Bloomgard AI, offered as a one-click chip on Home. */
export type SkillData = {
  prompt: string;
  description?: string;
  shared: boolean;
  created_by?: string | null;
};
