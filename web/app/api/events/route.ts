import { db } from '@/lib/agent/core';
import { withCtx } from '@/lib/platform/route';
import { emit } from '@/lib/platform/events';
import type { EventType } from '@/lib/platform/types';

/** What the browser may report: changes it made to a quote itself. Everything else is raised server-side. */
const ALLOWED: EventType[] = ['quote.created', 'quote.status_changed', 'quote.updated', 'log.added'];

/**
 * POST `{ type, quote_id, data }`: the browser saved a quote, moved its stage or added a log entry
 * directly, so automations and plugins should hear about it. The quote must be in the caller's
 * workspace, and for an agent, one of their own. Response: `{ ok, workflows, plugins }`.
 */
export const POST = withCtx(async (ctx, _req, body) => {
  const type = String(body?.type || '') as EventType;
  if (!ALLOWED.includes(type)) throw new Error(`"${type}" is not an event the browser can report.`);
  const quoteId = String(body?.quote_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) throw new Error('Which quote? Send its id.');
  const { data: q } = await db.from('quotations').select('id, created_by_email').eq('id', quoteId).eq('tenant_id', ctx.tenantId).maybeSingle();
  if (!q || (!ctx.isManager && String(q.created_by_email || '').toLowerCase() !== ctx.email.toLowerCase())) throw new Error('No such quote.');
  const data = body?.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {};
  // only the plain facts an automation matches on; never trust anything else from the browser
  const clean: Record<string, any> = {};
  for (const k of ['from', 'to', 'module']) if (data[k] != null) clean[k] = String(data[k]).slice(0, 200);
  if (data.entry && typeof data.entry === 'object') clean.entry = data.entry;
  const out = await emit({ type, tenantId: ctx.tenantId, quoteId, actorEmail: ctx.email, data: clean });
  return { ok: true, ...out };
});
