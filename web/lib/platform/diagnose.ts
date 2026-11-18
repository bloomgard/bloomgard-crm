import { db, AgentCtx, quoteValue, clientName, daysSince } from '@/lib/agent/core';
import { listRecs } from './store';
import type { IncomingOp } from './changesets';

/**
 * A health check of one workspace: data that is wrong or stuck, and setup that is missing. Read-only.
 * Each finding says what is wrong, how many quotes it touches, and, where a safe fix exists, the
 * change-set operations that would fix it, so Bloomgard AI can draft them in the sandbox.
 */
export type Finding = {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  count?: number;
  examples?: string[];
  fix?: { summary: string; ops: IncomingOp[] };
  advice?: string;
};

const isSpecial = (m: any) => m && (m.is_ai_settings || m.is_agent_config || m.is_branding);
const norm = (s: any) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export async function diagnoseWorkspace(ctx: AgentCtx): Promise<{ checked: number; findings: Finding[] }> {
  const t = ctx.tenantId;
  const [{ data: schema }, { data: quotes }, workflows] = await Promise.all([
    db.from('tenant_schemas').select('schema_config, html_template').eq('tenant_id', t).maybeSingle(),
    db.from('quotations').select('id, qn_number, status, created_by_email, created_at, last_contact_date, follow_up_due_date, custom_metadata, clients(company_name, email_id), quotation_items(quantity, item_rate, item_br)').eq('tenant_id', t).limit(2000),
    listRecs(t, 'workflow', { limit: 200 }).catch(() => []),
  ]);
  const modules: any[] = (Array.isArray(schema?.schema_config) ? schema!.schema_config : []).filter((m: any) => !isSpecial(m));
  const all = (quotes || []).filter((q: any) => q.status !== 'Lead');
  const findings: Finding[] = [];
  const qn = (q: any) => q.qn_number || q.id.slice(0, 8);

  // 1. A Master Status field in the form disagrees with the quote's real status
  const statusFields: Array<{ section: string; key: string; options: string[] }> = [];
  modules.forEach((m) => { if (!m.is_log && !m.allow_multiple) (m.fields || []).forEach((f: any) => { if (f.type === 'master_status') statusFields.push({ section: m.title, key: f.name, options: String(f.options || '').split(',').map((s) => s.trim()).filter(Boolean) }); }); });
  const drift = all.filter((q: any) => statusFields.some((sf) => {
    const v = q.custom_metadata?.[sf.section]?.[sf.key];
    return v && v !== q.status;
  }));
  if (drift.length) findings.push({
    id: 'status_drift', severity: 'high', count: drift.length, examples: drift.slice(0, 5).map((q: any) => `${qn(q)}: form says "${statusFields.map((sf) => q.custom_metadata?.[sf.section]?.[sf.key]).filter(Boolean)[0]}", status is "${q.status}"`),
    title: 'Form status disagrees with the real status',
    detail: 'Opening one of these quotes in the form and saving would put the old status back.',
    fix: {
      summary: `Bring the form's status in line with the real status on ${drift.length} quote${drift.length === 1 ? '' : 's'}`,
      ops: drift.slice(0, 40).map((q: any) => ({ type: 'data.fix', label: 'Form status matches the real status', quote_id: q.id, set: { meta: Object.fromEntries(statusFields.filter((sf) => q.custom_metadata?.[sf.section]).map((sf) => [sf.section, { [sf.key]: q.status }])) } })),
    },
  });

  // 2. Statuses that are not stages of the pipeline
  const stages = new Set(statusFields.flatMap((sf) => sf.options).map(norm));
  if (stages.size) {
    const off = all.filter((q: any) => q.status && !stages.has(norm(q.status)));
    if (off.length) {
      const byStatus: Record<string, number> = {};
      off.forEach((q: any) => { byStatus[q.status] = (byStatus[q.status] || 0) + 1; });
      findings.push({
        id: 'off_pipeline', severity: 'medium', count: off.length,
        examples: Object.entries(byStatus).slice(0, 6).map(([s, n]) => `"${s}" on ${n} quote${n === 1 ? '' : 's'}`),
        title: 'Quotes in a status your pipeline does not list',
        detail: 'They are missing from status filters and the Master Status dropdown.',
        advice: `Either add these statuses to the Master Status options, or move the quotes to one of: ${[...statusFields.flatMap((sf) => sf.options)].join(', ')}.`,
      });
    }
  }

  // 3. Quotes nobody can follow up on: no client email
  const noEmail = all.filter((q: any) => !['Approved', 'Lost', 'Rejected'].includes(q.status) && !(q.clients?.email_id || q.custom_metadata?.['Client Information']?.email_id));
  if (noEmail.length) findings.push({
    id: 'no_email', severity: 'medium', count: noEmail.length, examples: noEmail.slice(0, 5).map((q: any) => `${qn(q)} · ${clientName(q) || 'no client name'}`),
    title: 'Open quotes with no client email',
    detail: 'Follow-ups and AI replies cannot reach these clients.',
    advice: 'Add the email on each quote, or ask me to list them so the team can fill them in.',
  });

  // 4. Open quotes worth nothing
  const zero = all.filter((q: any) => !['Approved', 'Lost', 'Rejected'].includes(q.status) && !quoteValue(q));
  if (zero.length) findings.push({
    id: 'zero_value', severity: 'low', count: zero.length, examples: zero.slice(0, 5).map((q: any) => `${qn(q)} · ${clientName(q) || '—'}`),
    title: 'Open quotes with no value',
    detail: 'No line items or subtotal, so they count as ₹0 in the pipeline and in every report.',
  });

  // 5. The same client under several spellings
  const byClient = new Map<string, Set<string>>();
  all.forEach((q: any) => { const n = String(clientName(q) || '').trim(); if (n) { const k = n.toLowerCase().replace(/[^a-z0-9]/g, ''); (byClient.get(k) || byClient.set(k, new Set()).get(k)!).add(n); } });
  const dupes = [...byClient.values()].filter((s) => s.size > 1);
  if (dupes.length) findings.push({
    id: 'client_spellings', severity: 'low', count: dupes.length, examples: dupes.slice(0, 5).map((s) => [...s].join(' / ')),
    title: 'Clients spelled more than one way',
    detail: 'Their history is split, so suggestions and the "fill from last quote" pick only one spelling.',
  });

  // 6. Quiet quotes with no automation chasing them
  const quiet = all.filter((q: any) => !['Approved', 'Lost', 'Rejected'].includes(q.status) && daysSince(q.last_contact_date || q.created_at) >= 14);
  const chases = (workflows as any[]).some((w) => w.data?.enabled && ['quote.quiet', 'quote.due'].includes(w.data?.trigger?.type));
  if (quiet.length && !chases) findings.push({
    id: 'quiet_no_automation', severity: 'medium', count: quiet.length, examples: quiet.slice(0, 5).map((q: any) => `${qn(q)} · ${clientName(q) || '—'} · ${Math.floor(daysSince(q.last_contact_date || q.created_at))} days`),
    title: 'Quotes quiet for two weeks, and nothing chasing them',
    detail: 'No automation follows up on quiet quotes.',
    fix: {
      summary: 'Draft an AI follow-up, for your OK, whenever a quote has been quiet for 7 days',
      ops: [{
        type: 'workflow.upsert', name: 'Chase quiet quotes', workflow: {
          enabled: true, description: 'After 7 quiet days, draft a follow-up email for a person to approve.',
          trigger: { type: 'quote.quiet', days: 7 },
          conditions: [],
          actions: [{ type: 'ai_follow_up', params: { to: 'client' }, approval: true }],
        },
      }],
    },
  });

  // 7. Follow-up dates already passed
  const overdue = all.filter((q: any) => !['Approved', 'Lost', 'Rejected'].includes(q.status) && q.follow_up_due_date && new Date(q.follow_up_due_date) < new Date(Date.now() - 86400000));
  if (overdue.length) findings.push({
    id: 'overdue', severity: 'medium', count: overdue.length, examples: overdue.slice(0, 5).map((q: any) => `${qn(q)} · due ${String(q.follow_up_due_date).slice(0, 10)}`),
    title: 'Follow-ups past their due date',
    detail: 'They are on Follow ups → Due; the oldest are cooling fastest.',
  });

  // 8. Setup gaps
  const moneyByHand = modules.some((m) => !m.allow_multiple && (m.fields || []).some((f: any) => f.name === 'subtotal' && f.type !== 'calculated'))
    && modules.some((m) => m.allow_multiple && (m.fields || []).some((f: any) => f.name === 'item_br'));
  if (moneyByHand) {
    const mod = modules.find((m) => !m.allow_multiple && (m.fields || []).some((f: any) => f.name === 'subtotal'));
    const items = modules.find((m) => m.allow_multiple && (m.fields || []).some((f: any) => f.name === 'item_br'));
    findings.push({
      id: 'subtotal_by_hand', severity: 'medium',
      title: 'Subtotal is typed by hand',
      detail: 'The line items already add up, but Subtotal is an ordinary number field, so a forgotten subtotal shows a quote as worth nothing.',
      fix: { summary: 'Make Subtotal add itself up from the line items', ops: [{ type: 'form.ops', operations: [{ op: 'update_field', module: mod.title, key: 'subtotal', type: 'calculated', options: `SUM[${items.title}.item_br]` }] }] },
    });
  }
  if (!statusFields.length) findings.push({
    id: 'no_master_status', severity: 'low',
    title: 'No pipeline stages in the form',
    detail: 'There is no Master Status field, so stages are whatever statuses quotes happen to have.',
    advice: 'Add a Master Status field listing your stages (for example Inquiry, Quotation Given, PO Received, Lost).',
  });
  if (!String(schema?.html_template || '').trim()) findings.push({
    id: 'no_template', severity: 'high',
    title: 'No quote template',
    detail: 'Preview PDF, Download PDF and emailed quotes are blank pages.',
    advice: 'Settings → Quote Template → Start from a template, then Save.',
  });

  const order = { high: 0, medium: 1, low: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { checked: all.length, findings };
}
