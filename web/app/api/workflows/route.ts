import { metaPlan } from '@/lib/agent/core';
import { withCtx } from '@/lib/platform/route';
import { createRec, listRecs, teamMembers } from '@/lib/platform/store';
import { validateWorkflow, validationEnv } from '@/lib/platform/workflows';
import { WORKFLOW_TEMPLATES, describeWorkflow } from '@/lib/platform/workflowTemplates';
import type { PluginData, WorkflowData } from '@/lib/platform/types';
import { db } from '@/lib/agent/core';

export const maxDuration = 30;

/** The workspace's form fields an automation can test, as "Section.field_key". */
async function formFields(tenantId: string) {
  const { data } = await db.from('tenant_schemas').select('schema_config').eq('tenant_id', tenantId).maybeSingle();
  const mods = (Array.isArray(data?.schema_config) ? data!.schema_config : [])
    .filter((m: any) => m?.title && Array.isArray(m.fields) && !m.is_log && !m.allow_multiple && !m.is_ai_settings && !m.is_agent_config && !m.is_branding);
  return mods.flatMap((m: any) => m.fields
    .filter((f: any) => !['file', 'attachment', 'logged_in'].includes(f.type))
    .map((f: any) => ({ key: `${m.title}.${f.name}`, label: `${m.title} · ${f.label || f.name}`, type: f.type })));
}

/**
 * GET: the workspace's automations, each with its plain-English sentence. `?meta=1` instead returns
 * what the builder needs: stages, form fields, log modules, people and enabled plugins.
 * POST (managers): create one, from `{ name, workflow }` or `{ template }`.
 */
export const GET = withCtx(async (ctx, req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('meta')) {
    const [plan, fields, members, plugins] = await Promise.all([
      metaPlan(ctx.tenantId), formFields(ctx.tenantId), teamMembers(ctx.tenantId),
      listRecs<PluginData>(ctx.tenantId, 'plugin', { limit: 50 }).catch(() => []),
    ]);
    return {
      statuses: plan.statuses,
      fields,
      logModules: plan.logs.map((l) => ({ title: l.title, fields: l.fields.map((f) => ({ name: f.name, label: f.label, type: f.type, options: f.options })) })),
      members: members.map((m) => ({ id: m.id, email: m.email, full_name: m.full_name, role: m.role })),
      plugins: plugins.filter((p) => p.data.enabled).map((p) => p.data.type),
      templates: WORKFLOW_TEMPLATES,
      canEdit: ctx.isManager,
    };
  }
  const rows = await listRecs<WorkflowData>(ctx.tenantId, 'workflow', { limit: 200 });
  return {
    workflows: rows.map((r) => ({ id: r.id, name: r.title, created_at: r.created_at, ...r.data, sentence: describeWorkflow(r.data) })),
    canEdit: ctx.isManager,
  };
});

export const POST = withCtx(async (ctx, _req, body) => {
  let name = String(body?.name || '').trim();
  let raw = body?.workflow;
  if (body?.template) {
    const t = WORKFLOW_TEMPLATES.find((x) => x.id === body.template);
    if (!t) throw new Error(`No template "${body.template}".`);
    raw = { ...t.workflow, ...(raw || {}) };
    name ||= t.name;
  }
  if (!name) throw new Error('Give the automation a name.');
  const w = validateWorkflow({ ...raw, created_by: ctx.email, source: raw?.source || 'user', runs: 0, last_run_at: null }, await validationEnv(ctx.tenantId));
  const rec = await createRec<WorkflowData>(ctx.tenantId, 'workflow', name.slice(0, 120), w);
  return { workflow: { id: rec.id, name: rec.title, created_at: rec.created_at, ...rec.data, sentence: describeWorkflow(rec.data) } };
}, { managerOnly: true });
