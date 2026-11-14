import { db, AgentCtx, buildOverview, visibleQuotes, quoteCard, quoteValue, clientName, temperature, daysSince } from './core';
import { sendEmail } from '@/lib/email';
import { logEmailSent } from '@/utils/usageLogger';

/* ------------------------------------------------------------------ */
/* Tool schemas (OpenAI function-calling format, via OpenRouter)       */
/* ------------------------------------------------------------------ */

const fn = (name: string, description: string, properties: Record<string, any> = {}, required: string[] = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

export const TOOLS = [
  fn('get_overview', 'Headline numbers: quote counts per status, pipeline value, my contribution, unread emails, follow-up temperature, latest quotes.'),
  fn('search_quotes', 'Find quotations by free text (QN number, client, email, item, status) and/or status. Every result carries its computed ₹ value; sort by value to find the biggest or smallest.', {
    query: { type: 'string', description: 'Free text. Omit to list all quotes.' },
    status: { type: 'string', description: 'Exact status, e.g. Inquiry, Draft, Pending, Approved, Rejected, Lost, Lead.' },
    sort: { type: 'string', enum: ['newest', 'oldest', 'value_desc', 'value_asc'], description: 'Default newest.' },
    limit: { type: 'integer', description: 'Max rows, default 10, max 25.' },
  }),
  fn('get_quote', 'Everything about one quote: client, line items, conversation with the client, status history, follow-up state.', {
    qn: { type: 'string', description: 'Quote number such as QN-2026-007.' },
  }, ['qn']),
  fn('query_database', 'Read-only access to the workspace database (already scoped to this workspace). Use it for any question the other tools do not cover.', {
    table: { type: 'string', enum: ['quotations', 'quotation_items', 'clients', 'inbound_emails', 'sent_emails', 'email_threads', 'status_logs', 'master_data_entries', 'master_data_values', 'profiles', 'tenant_token_usage', 'tenants'] },
    columns: { type: 'string', description: 'Comma separated columns, default all.' },
    filters: { type: 'array', items: { type: 'object', properties: { column: { type: 'string' }, op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'in', 'is_null', 'not_null'] }, value: {} }, required: ['column', 'op'] } },
    order_by: { type: 'string' }, ascending: { type: 'boolean' },
    limit: { type: 'integer', description: 'Max 50, default 20.' },
    count_only: { type: 'boolean' },
  }, ['table']),
  fn('list_emails', 'List received emails (newest first).', {
    query: { type: 'string', description: 'Match sender, subject or body.' },
    unread_only: { type: 'boolean' }, limit: { type: 'integer' },
  }),
  fn('get_email', 'Read one received email in full.', { id: { type: 'string' } }, ['id']),
  fn('get_master_data', 'Look up the product catalogue (Master Data) as linked rows (code, name, unit, rate).', {
    query: { type: 'string', description: 'Match any value. Omit for an overview with the first rows.' },
    limit: { type: 'integer' },
  }),
  fn('get_settings', 'Read this user\'s profile, the workspace email setup (sender, inbound addresses) and the AI behaviour settings.'),
  fn('get_followups', 'Quiet quotes scored hot/warm/cold, plus quotes where the client replied and nobody answered.', {
    min_days: { type: 'integer', description: 'Only quotes untouched for at least this many days (default 0).' },
  }),
  fn('make_chart', 'Render a chart in the chat from live quote data.', {
    title: { type: 'string' },
    chart: { type: 'string', enum: ['bar', 'pie', 'line', 'metric'] },
    metric: { type: 'string', enum: ['count', 'value'], description: 'count of quotes or total quote value' },
    dimension: { type: 'string', enum: ['status', 'agent', 'client', 'month', 'week'] },
  }, ['title', 'chart', 'metric', 'dimension']),

  // ---- write tools: these only PREPARE the change. The user confirms it with a button. ----
  fn('send_email', 'Prepare an email to send. The user must confirm before it is sent.', {
    to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string', description: 'Plain text body, signed with the user\'s name.' },
    quote_qn: { type: 'string', description: 'Quote this email relates to, if any.' },
  }, ['to', 'subject', 'body']),
  fn('create_quote', 'Prepare a new quote. Catalogue rates are filled from Master Data. The user must confirm.', {
    client_name: { type: 'string' }, client_email: { type: 'string' }, contact_person: { type: 'string' },
    items: { type: 'array', items: { type: 'object', properties: { item_code: { type: 'string' }, item_name: { type: 'string' }, quantity: { type: 'number' } } } },
    source_email_id: { type: 'string', description: 'Inbound email this quote comes from, if any.' },
  }, ['client_name', 'items']),
  fn('update_quote_status', 'Prepare a status change on a quote. The user must confirm.', {
    qn: { type: 'string' }, status: { type: 'string', enum: ['Lead', 'Inquiry', 'Draft', 'Pending', 'Approved', 'Rejected', 'Lost'] }, comment: { type: 'string' },
  }, ['qn', 'status']),
  fn('update_master_item', 'Prepare a change to one catalogue item (managers/admins only). The user must confirm.', {
    item_code: { type: 'string' }, field: { type: 'string', enum: ['item_name', 'uom', 'item_rate', 'item_code'] }, new_value: { type: 'string' },
  }, ['item_code', 'field', 'new_value']),
  fn('add_master_item', 'Prepare a new catalogue item (managers/admins only). The user must confirm.', {
    item_code: { type: 'string' }, item_name: { type: 'string' }, uom: { type: 'string' }, item_rate: { type: 'string' },
  }, ['item_code', 'item_name', 'uom', 'item_rate']),
  fn('update_settings', 'Prepare a settings change. scope "profile" edits the caller\'s own profile/forwarding address; scope "ai" edits workspace AI behaviour (managers/admins). The user must confirm.', {
    scope: { type: 'string', enum: ['profile', 'ai'] },
    changes: { type: 'object', description: 'profile: full_name, job_title, phone, signature, inbound_email. ai: tone (Professional|Casual|Friendly|Aggressive), englishLevel (Native|Simple / Basic|Corporate Jargon), desperation (Low (Confident)|Medium (Eager)|High (Need the deal)), instructions.' },
  }, ['scope', 'changes']),
];

const WRITE_TOOLS = new Set(['send_email', 'create_quote', 'update_quote_status', 'update_master_item', 'add_master_item', 'update_settings']);
export const isWriteTool = (name: string) => WRITE_TOOLS.has(name);

export const TOOL_LABELS: Record<string, string> = {
  get_overview: 'Reading workspace overview', search_quotes: 'Searching quotes', get_quote: 'Opening quote',
  query_database: 'Querying database', list_emails: 'Reading inbox', get_email: 'Reading email',
  get_master_data: 'Reading catalogue', get_settings: 'Reading settings', get_followups: 'Scoring follow-ups',
  make_chart: 'Building chart', send_email: 'Drafting email', create_quote: 'Preparing quote',
  update_quote_status: 'Preparing status change', update_master_item: 'Preparing catalogue change',
  add_master_item: 'Preparing catalogue item', update_settings: 'Preparing settings change',
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const clip = (s: any, n: number) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n) + '…' : t; };
const strip = (html: string) => String(html || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const STATUSES = ['Lead', 'Inquiry', 'Draft', 'Pending', 'Approved', 'Rejected', 'Lost'];

async function findQuote(ctx: AgentCtx, qn: string) {
  const want = String(qn || '').trim().toLowerCase();
  const all = await visibleQuotes(ctx);
  return all.find((q: any) => String(q.qn_number).toLowerCase() === want)
    || all.find((q: any) => String(q.qn_number).toLowerCase().startsWith(want)) || null;
}

type CatalogueRow = { values: Array<{ id: string; key: string; text: string }> };

/** Linked catalogue rows: one row per leaf value with its ancestors (code -> name -> unit -> rate). */
async function loadCatalogue(ctx: AgentCtx) {
  const { data: entries } = await db.from('master_data_entries').select('id, key_name, parent_id, ai_description')
    .eq('tenant_id', ctx.tenantId).eq('tab_type', 'manual');
  const ids = (entries || []).map((e: any) => e.id);
  const { data: values } = ids.length
    ? await db.from('master_data_values').select('id, entry_id, value_text, parent_value_id').in('entry_id', ids)
    : { data: [] as any[] };
  const keyOf = new Map((entries || []).map((e: any) => [e.id, e.key_name]));
  const byId = new Map((values || []).map((v: any) => [v.id, v]));
  const hasChild = new Set((values || []).map((v: any) => v.parent_value_id).filter(Boolean));
  const rows: CatalogueRow[] = [];
  for (const leaf of values || []) {
    if (hasChild.has(leaf.id)) continue;
    const chain: any[] = [];
    for (let cur: any = leaf, n = 0; cur && n < 10; cur = byId.get(cur.parent_value_id), n++) chain.unshift(cur);
    rows.push({ values: chain.map((v) => ({ id: v.id, key: String(keyOf.get(v.entry_id)), text: v.value_text })) });
  }
  return { entries: entries || [], values: values || [], rows, keyOf, byId };
}

/** The value of `field` that hangs under the item with this code, by walking down the parent chain. */
async function locateItemField(ctx: AgentCtx, itemCode: string, field: string) {
  const cat = await loadCatalogue(ctx);
  const codeEntry = cat.entries.find((e: any) => e.key_name === 'item_code');
  if (!codeEntry) throw new Error('This workspace has no item_code column in Master Data.');
  const want = itemCode.trim().toLowerCase();
  const codes = cat.values.filter((v: any) => v.entry_id === codeEntry.id && String(v.value_text).trim().toLowerCase() === want);
  if (codes.length === 0) throw new Error(`No catalogue item with code "${itemCode}".`);
  if (codes.length > 1) throw new Error(`Several catalogue items share the code "${itemCode}".`);
  const code = codes[0];
  if (field === 'item_code') return { target: code, current: code.value_text };
  const fieldEntry = cat.entries.find((e: any) => e.key_name === field);
  if (!fieldEntry) throw new Error(`Master Data has no "${field}" column.`);
  const found: any[] = [];
  const queue = [code.id];
  while (queue.length) {
    const id = queue.shift();
    for (const v of cat.values) if (v.parent_value_id === id) { queue.push(v.id); if (v.entry_id === fieldEntry.id) found.push(v); }
  }
  if (found.length === 0) throw new Error(`Item ${itemCode} has no ${field} value yet.`);
  if (found.length > 1) throw new Error(`Item ${itemCode} has ${found.length} ${field} values; edit it in Master Data.`);
  return { target: found[0], current: found[0].value_text };
}

/* ------------------------------------------------------------------ */
/* Read tools                                                           */
/* ------------------------------------------------------------------ */

const TABLES: Record<string, { scope: 'tenant' | 'quote' | 'entry' | 'self'; drop?: string[]; clip?: string[] }> = {
  quotations: { scope: 'tenant' }, quotation_items: { scope: 'tenant' }, clients: { scope: 'tenant' },
  inbound_emails: { scope: 'tenant', drop: ['body_html'], clip: ['body_text'] },
  sent_emails: { scope: 'tenant' }, email_threads: { scope: 'tenant' },
  status_logs: { scope: 'quote' },
  master_data_entries: { scope: 'tenant' }, master_data_values: { scope: 'entry' },
  profiles: { scope: 'tenant' }, tenant_token_usage: { scope: 'tenant' }, tenants: { scope: 'self' },
};
const SAFE_COLUMNS: Record<string, string> = {
  profiles: 'id, full_name, email, role, job_title, phone, inbound_email, created_at',
  tenants: 'id, company_name, custom_email_sender, inbound_routing_id, routing_slug, ai_enabled',
};

async function runQuery(ctx: AgentCtx, a: any) {
  const spec = TABLES[a.table];
  if (!spec) throw new Error(`Table "${a.table}" is not available.`);
  const limit = Math.min(Math.max(Number(a.limit) || 20, 1), 50);
  let cols = SAFE_COLUMNS[a.table] || (a.columns && String(a.columns).trim()) || '*';
  if (spec.drop && cols === '*') cols = '*'; // body_html is removed from the result below
  let q: any = db.from(a.table).select(cols, a.count_only ? { count: 'exact', head: true } : undefined);

  if (spec.scope === 'tenant') q = q.eq('tenant_id', ctx.tenantId);
  else if (spec.scope === 'self') q = q.eq('id', ctx.tenantId);
  else if (spec.scope === 'quote') {
    const { data } = await db.from('quotations').select('id').eq('tenant_id', ctx.tenantId).limit(5000);
    q = q.in('quotation_id', (data || []).map((r: any) => r.id));
  } else if (spec.scope === 'entry') {
    const { data } = await db.from('master_data_entries').select('id').eq('tenant_id', ctx.tenantId);
    q = q.in('entry_id', (data || []).map((r: any) => r.id));
  }
  if (a.table === 'quotations' && !ctx.isManager) q = q.eq('created_by_email', ctx.email);

  for (const f of a.filters || []) {
    const col = String(f.column).replace(/[^a-zA-Z0-9_]/g, '');
    if (!col) continue;
    switch (f.op) {
      case 'eq': q = q.eq(col, f.value); break;
      case 'neq': q = q.neq(col, f.value); break;
      case 'gt': q = q.gt(col, f.value); break;
      case 'gte': q = q.gte(col, f.value); break;
      case 'lt': q = q.lt(col, f.value); break;
      case 'lte': q = q.lte(col, f.value); break;
      case 'ilike': q = q.ilike(col, f.value); break;
      case 'in': q = q.in(col, Array.isArray(f.value) ? f.value : [f.value]); break;
      case 'is_null': q = q.is(col, null); break;
      case 'not_null': q = q.not(col, 'is', null); break;
    }
  }
  if (!a.count_only) {
    if (a.order_by) q = q.order(String(a.order_by).replace(/[^a-zA-Z0-9_]/g, ''), { ascending: !!a.ascending });
    q = q.limit(limit);
  }
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  if (a.count_only) return { count };
  const rows = (data || []).map((r: any) => {
    const o: any = { ...r };
    (spec.drop || []).forEach((k) => delete o[k]);
    (spec.clip || []).forEach((k) => { if (o[k]) o[k] = clip(o[k], 700); });
    // amounts live inside the quote's form data, not in a column: expose the computed value
    if (a.table === 'quotations' && 'custom_metadata' in r) o.value = Math.round(quoteValue(r));
    if (o.custom_metadata) o.custom_metadata = clip(JSON.stringify(o.custom_metadata), 800);
    return o;
  });
  return { rows, returned: rows.length };
}

async function chartData(ctx: AgentCtx, metric: string, dimension: string) {
  const quotes = (await visibleQuotes(ctx)).filter((q: any) => q.status !== 'Lead');
  const acc = new Map<string, number>();
  const monthKey = (iso: string) => String(iso || '').slice(0, 7) || 'unknown';
  quotes.forEach((q: any) => {
    let key = 'Unknown';
    if (dimension === 'status') key = q.status || 'Unknown';
    else if (dimension === 'agent') key = q.created_by_email || 'Unknown';
    else if (dimension === 'client') key = clientName(q) || 'Unknown';
    else if (dimension === 'month') key = monthKey(q.date || q.created_at);
    else if (dimension === 'week') { const w = Math.floor(daysSince(q.created_at) / 7); key = w <= 0 ? 'This week' : `${w}w ago`; }
    acc.set(key, (acc.get(key) || 0) + (metric === 'value' ? quoteValue(q) : 1));
  });
  let data = [...acc.entries()].map(([name, value]) => ({ name, value: Math.round(value) }));
  if (dimension === 'month') data.sort((a, b) => a.name.localeCompare(b.name));
  else if (dimension === 'week') data.sort((a, b) => (parseInt(b.name) || 0) - (parseInt(a.name) || 0));
  else data.sort((a, b) => b.value - a.value);
  return data.slice(0, 12);
}

export type ToolOutput = { result: any; blocks?: any[]; pending?: any };

export async function runTool(name: string, a: any, ctx: AgentCtx): Promise<ToolOutput> {
  switch (name) {
    case 'get_overview': {
      const o = await buildOverview(ctx);
      return { result: { company: o.company, ...o.stats, inbox: o.inbox, followups: o.followups, latest: o.latest } };
    }
    case 'search_quotes': {
      const all = await visibleQuotes(ctx);
      const text = String(a.query || '').trim().toLowerCase();
      const status = String(a.status || '').trim().toLowerCase();
      const limit = Math.min(Number(a.limit) || 10, 25);
      const hits = all.filter((q: any) => {
        if (status && String(q.status).toLowerCase() !== status) return false;
        if (!text) return true;
        const hay = [q.qn_number, q.status, clientName(q), q.clients?.email_id, q.clients?.contact_person, q.created_by_email,
          ...(q.quotation_items || []).flatMap((i: any) => [i.item_code, i.item_name]), JSON.stringify(q.custom_metadata || {}).slice(0, 2000)]
          .join(' ').toLowerCase();
        return text.split(/\s+/).every((w) => hay.includes(w));
      });
      const sorted = [...hits];
      if (a.sort === 'value_desc') sorted.sort((x: any, y: any) => quoteValue(y) - quoteValue(x));
      else if (a.sort === 'value_asc') sorted.sort((x: any, y: any) => quoteValue(x) - quoteValue(y));
      else if (a.sort === 'oldest') sorted.reverse();
      const cards = sorted.slice(0, limit).map(quoteCard);
      return { result: { matches: hits.length, shown: cards.length, quotes: cards }, blocks: cards.length ? [{ type: 'quotes', title: text ? `Quotes matching "${a.query}"` : 'Quotes', quotes: cards }] : [] };
    }
    case 'get_quote': {
      const q = await findQuote(ctx, a.qn);
      if (!q) return { result: { error: `No quote "${a.qn}" that you can access.` } };
      const [{ data: logs }, { data: thread }] = await Promise.all([
        db.from('status_logs').select('old_status, new_status, comments, created_at').eq('quotation_id', q.id).order('created_at', { ascending: false }).limit(10),
        db.from('email_threads').select('triage_status, ai_draft_text, last_updated').eq('quote_id', q.id).maybeSingle(),
      ]);
      const convo = (q.custom_metadata?.agent_conversations || []).slice(-8).map((m: any) => ({ role: m.role, at: m.timestamp, text: clip(m.content, 500) }));
      return {
        result: {
          ...quoteCard(q), contact: q.clients?.contact_person, follow_up_due: q.follow_up_due_date,
          items: (q.quotation_items || []).map((i: any) => ({ code: i.item_code, name: i.item_name, qty: i.quantity, uom: i.uom, rate: i.item_rate })),
          conversation: convo, status_history: logs || [], thread: thread ? { state: thread.triage_status, has_ai_draft: !!thread.ai_draft_text } : null,
        },
        blocks: [{ type: 'quotes', title: q.qn_number, quotes: [quoteCard(q)] }],
      };
    }
    case 'query_database': return { result: await runQuery(ctx, a) };
    case 'list_emails': {
      let q: any = db.from('inbound_emails').select('id, sender_email, subject, body_text, is_read, created_at')
        .eq('tenant_id', ctx.tenantId).eq('is_deleted', false).order('created_at', { ascending: false }).limit(Math.min(Number(a.limit) || 10, 25));
      if (a.unread_only) q = q.eq('is_read', false);
      if (a.query) { const t = String(a.query).replace(/[%,()]/g, ' '); q = q.or(`subject.ilike.%${t}%,sender_email.ilike.%${t}%,body_text.ilike.%${t}%`); }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const emails = (data || []).map((e: any) => ({ id: e.id, from: e.sender_email, subject: e.subject, unread: !e.is_read, at: e.created_at, snippet: clip(strip(e.body_text), 260) }));
      return { result: { count: emails.length, emails }, blocks: emails.length ? [{ type: 'emails', title: a.unread_only ? 'Unread emails' : 'Emails', emails }] : [] };
    }
    case 'get_email': {
      const { data } = await db.from('inbound_emails').select('id, sender_email, subject, body_text, body_html, created_at, is_read')
        .eq('tenant_id', ctx.tenantId).eq('id', a.id).maybeSingle();
      if (!data) return { result: { error: 'Email not found.' } };
      return { result: { id: data.id, from: data.sender_email, subject: data.subject, at: data.created_at, body: clip(data.body_text || strip(data.body_html), 4000) } };
    }
    case 'get_master_data': {
      const cat = await loadCatalogue(ctx);
      const text = String(a.query || '').trim().toLowerCase();
      const limit = Math.min(Number(a.limit) || 15, 40);
      const rows = cat.rows.filter((r) => !text || r.values.some((v) => String(v.text).toLowerCase().includes(text)));
      const table = rows.slice(0, limit).map((r) => Object.fromEntries(r.values.map((v) => [v.key, v.text])));
      const counts = cat.entries.map((e: any) => ({ key: e.key_name, values: cat.values.filter((v: any) => v.entry_id === e.id).length, description: e.ai_description || undefined }));
      return {
        result: { keys: counts, total_rows: cat.rows.length, matching: rows.length, rows: table },
        blocks: table.length ? [{ type: 'table', title: text ? `Catalogue matching "${a.query}"` : 'Catalogue', rows: table }] : [],
      };
    }
    case 'get_settings': {
      const { data: schema } = await db.from('tenant_schemas').select('schema_config').eq('tenant_id', ctx.tenantId).maybeSingle();
      const ai = (schema?.schema_config || []).find((s: any) => s.is_ai_settings) || {};
      const t = ctx.tenant;
      return {
        result: {
          profile: { name: ctx.profile.full_name, title: ctx.profile.job_title, phone: ctx.profile.phone, signature: ctx.profile.signature, personal_forwarding_address: ctx.profile.inbound_email, role: ctx.role },
          email: {
            workspace_sender: t.custom_email_sender || '(not set: falls back to support@bloomgard.co)',
            workspace_inbound_address: t.inbound_routing_id ? `${t.inbound_routing_id}@inbound.bloomgard.co` : null,
            how_it_works: 'Client mail forwarded to an @inbound.bloomgard.co address is filed in the Inbox; replies are sent from the workspace sender with Reply-To set to the inbound address.',
          },
          ai: { enabled: !!t.ai_enabled, tone: ai.tone || 'Professional', englishLevel: ai.englishLevel || 'Native', desperation: ai.desperation || 'Low (Confident)', instructions: ai.instructions || '', routing_rules: (ai.emailRouting || []).length },
        },
      };
    }
    case 'get_followups': {
      const quotes = (await visibleQuotes(ctx)).filter((q: any) => !['Approved', 'Lost', 'Rejected', 'Lead'].includes(q.status));
      const { data: threads } = await db.from('email_threads').select('quote_id').eq('tenant_id', ctx.tenantId).eq('triage_status', 'incoming');
      const incoming = new Set<string>((threads || []).map((t: any) => t.quote_id));
      const min = Number(a.min_days) || 0;
      const rows = quotes.map((q: any) => ({ q, temp: temperature(q, incoming), idle: Math.floor(daysSince(q.last_contact_date || q.date || q.created_at)) }))
        .filter((r: any) => r.idle >= min || incoming.has(r.q.id))
        .sort((x: any, y: any) => ({ hot: 0, warm: 1, cold: 2 } as any)[x.temp] - ({ hot: 0, warm: 1, cold: 2 } as any)[y.temp] || quoteValue(y.q) - quoteValue(x.q))
        .slice(0, 20);
      const cards = rows.map((r: any) => ({ ...quoteCard(r.q), temperature: r.temp, idle_days: r.idle, client_waiting: incoming.has(r.q.id) }));
      return { result: { count: cards.length, quotes: cards }, blocks: cards.length ? [{ type: 'quotes', title: 'Follow-ups', quotes: cards }] : [] };
    }
    case 'make_chart': {
      const data = await chartData(ctx, a.metric, a.dimension);
      return { result: { rendered: true, data }, blocks: [{ type: 'chart', title: a.title, chart: a.chart, metric: a.metric, dimension: a.dimension, data }] };
    }
    default:
      if (isWriteTool(name)) return prepare(name, a, ctx);
      return { result: { error: `Unknown tool ${name}` } };
  }
}

/* ------------------------------------------------------------------ */
/* Write tools: validate and describe. Nothing is changed here.         */
/* ------------------------------------------------------------------ */

const needManager = (ctx: AgentCtx) => {
  if (!ctx.isManager) throw new Error('Only a Manager or Admin can change this.');
};
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const AI_ENUMS: Record<string, string[]> = {
  tone: ['Professional', 'Casual', 'Friendly', 'Aggressive'],
  englishLevel: ['Native', 'Simple / Basic', 'Corporate Jargon'],
  desperation: ['Low (Confident)', 'Medium (Eager)', 'High (Need the deal)'],
};
const PROFILE_FIELDS = ['full_name', 'job_title', 'phone', 'signature', 'inbound_email'];

async function prepare(name: string, a: any, ctx: AgentCtx): Promise<ToolOutput> {
  try {
    let action: any;
    switch (name) {
      case 'send_email': {
        const to = String(a.to || '').trim();
        if (!EMAIL_RE.test(to)) throw new Error(`"${to}" is not a valid email address.`);
        if (!String(a.subject || '').trim() || !String(a.body || '').trim()) throw new Error('An email needs a subject and a body.');
        action = {
          kind: 'send_email', title: 'Send email', risk: 'external',
          summary: `To ${to}`,
          details: [['To', to], ['Subject', a.subject], ['From', ctx.tenant.custom_email_sender || 'support@bloomgard.co']],
          preview: String(a.body || ''),
          payload: { to, subject: String(a.subject || ''), body: String(a.body || ''), quote_qn: a.quote_qn || null },
        };
        break;
      }
      case 'create_quote': {
        const items = (a.items || []).map((i: any) => ({ item_code: i.item_code || '', item_name: i.item_name || '', quantity: Number(i.quantity) || 1 }));
        if (!items.length) throw new Error('A quote needs at least one item.');
        if (!String(a.client_name || '').trim()) throw new Error('A quote needs a client name.');
        action = {
          kind: 'create_quote', title: 'Create quote', risk: 'internal',
          summary: `${a.client_name} · ${items.length} item${items.length === 1 ? '' : 's'}`,
          details: [['Client', a.client_name], ['Email', a.client_email || '—'], ...items.map((i: any) => [i.item_code || i.item_name || 'Item', `× ${i.quantity}`])],
          payload: { client_name: a.client_name, client_email: a.client_email || '', contact_person: a.contact_person || '', items, source_email_id: a.source_email_id || null },
        };
        break;
      }
      case 'update_quote_status': {
        if (!STATUSES.includes(a.status)) throw new Error(`Status must be one of ${STATUSES.join(', ')}.`);
        const q = await findQuote(ctx, a.qn);
        if (!q) throw new Error(`No quote "${a.qn}" that you can access.`);
        action = {
          kind: 'update_quote_status', title: 'Change quote status', risk: 'internal',
          summary: `${q.qn_number}: ${q.status} → ${a.status}`,
          details: [['Quote', q.qn_number], ['Client', clientName(q) || '—'], ['Status', `${q.status} → ${a.status}`], ...(a.comment ? [['Note', a.comment]] : [])],
          payload: { qn: q.qn_number, status: a.status, comment: a.comment || '' },
        };
        break;
      }
      case 'update_master_item': {
        needManager(ctx);
        const { current } = await locateItemField(ctx, a.item_code, a.field);
        action = {
          kind: 'update_master_item', title: 'Edit catalogue', risk: 'data',
          summary: `${a.item_code}: ${a.field}`,
          details: [['Item', a.item_code], ['Field', a.field], ['Change', `${current} → ${a.new_value}`]],
          payload: { item_code: a.item_code, field: a.field, new_value: String(a.new_value) },
        };
        break;
      }
      case 'add_master_item': {
        needManager(ctx);
        action = {
          kind: 'add_master_item', title: 'Add catalogue item', risk: 'data',
          summary: `${a.item_code} · ${a.item_name}`,
          details: [['Code', a.item_code], ['Name', a.item_name], ['Unit', a.uom], ['Rate', a.item_rate]],
          payload: { item_code: a.item_code, item_name: a.item_name, uom: a.uom, item_rate: String(a.item_rate) },
        };
        break;
      }
      case 'update_settings': {
        const changes = a.changes || {};
        if (a.scope === 'profile') {
          const keys = Object.keys(changes);
          if (!keys.length || keys.some((k) => !PROFILE_FIELDS.includes(k))) throw new Error(`Profile fields: ${PROFILE_FIELDS.join(', ')}.`);
          if (changes.inbound_email) {
            if (!/^[a-z0-9._-]+@inbound\.bloomgard\.co$/i.test(changes.inbound_email)) throw new Error('A forwarding address must look like name@inbound.bloomgard.co.');
            const { data: taken } = await db.from('profiles').select('id').ilike('inbound_email', changes.inbound_email).neq('id', ctx.userId).maybeSingle();
            if (taken) throw new Error('That forwarding address is already used by someone else.');
          }
        } else if (a.scope === 'ai') {
          needManager(ctx);
          const keys = Object.keys(changes);
          if (!keys.length || keys.some((k) => !['tone', 'englishLevel', 'desperation', 'instructions'].includes(k))) throw new Error('AI fields: tone, englishLevel, desperation, instructions.');
          for (const k of Object.keys(AI_ENUMS)) if (changes[k] && !AI_ENUMS[k].includes(changes[k])) throw new Error(`${k} must be one of: ${AI_ENUMS[k].join(' | ')}.`);
        } else throw new Error('scope must be "profile" or "ai".');
        action = {
          kind: 'update_settings', title: a.scope === 'ai' ? 'Change AI behaviour' : 'Change profile', risk: 'data',
          summary: Object.keys(changes).join(', '),
          details: Object.entries(changes).map(([k, v]) => [k, clip(v, 160)]),
          payload: { scope: a.scope, changes },
        };
        break;
      }
    }
    action.id = `act_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return { result: { prepared: true, awaiting_user_confirmation: true, summary: action.summary }, pending: action };
  } catch (e: any) {
    return { result: { error: e.message } };
  }
}

/* ------------------------------------------------------------------ */
/* Execute a confirmed action. Re-checks permissions; never trusts the UI. */
/* ------------------------------------------------------------------ */

export async function executeAction(kind: string, raw: any, ctx: AgentCtx): Promise<{ ok: true; message: string; refresh?: string[] }> {
  // The client sends back what the AI prepared, but it is only a request: validate it again exactly as a
  // fresh tool call would be (fields, enums, permissions) and run the sanitised payload, never the raw one.
  if (!isWriteTool(kind)) throw new Error(`Unknown action ${kind}.`);
  const checked = await prepare(kind, raw || {}, ctx);
  if (checked.result?.error) throw new Error(checked.result.error);
  const p = checked.pending.payload;
  switch (kind) {
    case 'send_email': {
      const t = ctx.tenant;
      const from = `${t.company_name || 'Bloomgard'} <${t.custom_email_sender || 'support@bloomgard.co'}>`;
      const html = String(p.body).split('\n').map((l: string) => l.trim() ? `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : '<br/>').join('');
      const replyTo = t.inbound_routing_id ? `${t.inbound_routing_id}@inbound.bloomgard.co` : undefined;
      const sent = await sendEmail({ from, to: p.to, replyTo, subject: p.subject, text: p.body, html });
      if (!sent) throw new Error('The email provider did not accept the message.');
      await logEmailSent(ctx.tenantId, p.to, p.subject);
      const qn = p.quote_qn || (String(p.subject).match(/QN-\d{4}-\d{3}(?:-Rev-\d+)?/) || [])[0];
      if (qn) {
        const quote = await findQuote(ctx, qn);
        if (quote) {
          const meta = quote.custom_metadata || {};
          meta.agent_conversations = [...(meta.agent_conversations || []), { role: 'agent', content: p.body, timestamp: new Date().toISOString() }];
          await db.from('quotations').update({ custom_metadata: meta, last_contact_date: new Date().toISOString() }).eq('id', quote.id);
          await db.from('email_threads').update({ triage_status: 'outgoing', ai_draft_text: null, last_updated: new Date().toISOString() }).eq('quote_id', quote.id);
        }
      }
      return { ok: true, message: `Email sent to ${p.to}.`, refresh: ['quotes', 'inbox'] };
    }
    case 'create_quote': {
      const { POST } = await import('@/app/api/quote-from-email/route');
      const analysis = {
        summary: `Created by Bloomgard AI for ${p.client_name}.`,
        lead_gen_quote: {
          'Client Information': [{ client_name: p.client_name, email_id: p.client_email, contact_person: p.contact_person }],
          Products: p.items.map((i: any) => ({ item_code: i.item_code, item_name: i.item_name, quantity: i.quantity })),
        },
      };
      const res = await POST(new Request('http://internal/quote-from-email', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: ctx.tenantId, emailId: p.source_email_id || undefined, analysis, agentEmail: ctx.email }),
      }));
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Could not create the quote.');
      return { ok: true, message: `Created ${out.qn_number} with ${out.itemCount} item${out.itemCount === 1 ? '' : 's'}.`, refresh: ['quotes'] };
    }
    case 'update_quote_status': {
      const q = await findQuote(ctx, p.qn);
      if (!q) throw new Error('Quote not found.');
      await db.from('quotations').update({ status: p.status }).eq('id', q.id);
      await db.from('status_logs').insert([{ quotation_id: q.id, old_status: q.status, new_status: p.status, comments: p.comment || 'Changed by Bloomgard AI.' }]);
      return { ok: true, message: `${q.qn_number} is now ${p.status}.`, refresh: ['quotes'] };
    }
    case 'update_master_item': {
      needManager(ctx);
      const { target } = await locateItemField(ctx, p.item_code, p.field);
      const { error } = await db.from('master_data_values').update({ value_text: p.new_value }).eq('id', target.id);
      if (error) throw new Error(error.message);
      return { ok: true, message: `Updated ${p.item_code} ${p.field} to ${p.new_value}.` };
    }
    case 'add_master_item': {
      needManager(ctx);
      const { POST } = await import('@/app/api/master-data/route');
      const res = await POST(new Request('http://internal/master-data', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'bulkImport',
          payload: {
            tenant_id: ctx.tenantId, tab_type: 'manual',
            columns: [{ key_name: 'item_code' }, { key_name: 'item_name' }, { key_name: 'uom' }, { key_name: 'item_rate' }],
            rows: [[p.item_code, p.item_name, p.uom, p.item_rate]],
          },
        }),
      }));
      if (!res.ok) throw new Error(`Could not add the item (${res.status}).`);
      return { ok: true, message: `Added ${p.item_code} to the catalogue.` };
    }
    case 'update_settings': {
      if (p.scope === 'profile') {
        const { error } = await db.from('profiles').update(p.changes).eq('id', ctx.userId);
        if (error) throw new Error(error.message);
        return { ok: true, message: 'Profile updated.' };
      }
      needManager(ctx);
      const { data: schema } = await db.from('tenant_schemas').select('schema_config').eq('tenant_id', ctx.tenantId).maybeSingle();
      const cfg: any[] = Array.isArray(schema?.schema_config) ? [...schema!.schema_config] : [];
      const i = cfg.findIndex((s: any) => s.is_ai_settings);
      if (i >= 0) cfg[i] = { ...cfg[i], ...p.changes }; else cfg.push({ is_ai_settings: true, ...p.changes });
      const { error } = schema
        ? await db.from('tenant_schemas').update({ schema_config: cfg }).eq('tenant_id', ctx.tenantId)
        : await db.from('tenant_schemas').insert({ tenant_id: ctx.tenantId, schema_config: cfg });
      if (error) throw new Error(error.message);
      return { ok: true, message: 'AI behaviour updated.' };
    }
    default:
      throw new Error(`Unknown action ${kind}.`);
  }
}
