import { withCtx } from '@/lib/platform/route';
import {
  catalog, catalogEntry, listPlugins, redact, upsertPlugin, issueInboundToken, testPlugin, PLUGIN_EVENTS,
} from '@/lib/platform/plugins';
import type { PluginType } from '@/lib/platform/types';

/**
 * GET: every plugin type with this workspace's state (secrets redacted). Anyone in the workspace.
 * POST (managers and admins):
 *   { type, enabled?, config?, events? }           create or update
 *   { type: 'webhook' | 'slack', action: 'test' }   send one sample delivery, returns { ok, detail }
 *   { type: 'inbound_api', action: 'rotate' }       issue a new token, returned once as { token }
 */
export const GET = withCtx(async (ctx) => {
  const mine = await listPlugins(ctx.tenantId);
  return {
    can_manage: ctx.isManager,
    events: PLUGIN_EVENTS,
    plugins: catalog().map((c) => {
      const p = mine.find((x) => x.data.type === c.type) || null;
      return { ...c, state: redact(p) };
    }),
  };
});

export const POST = withCtx(async (ctx, _req, body) => {
  const type = String(body?.type || '') as PluginType;
  const entry = catalogEntry(type);
  if (!entry) throw new Error(`Unknown plugin "${body?.type}".`);

  if (body.action === 'test') {
    return testPlugin(ctx.tenantId, type, ctx.email);
  }
  if (body.action === 'rotate') {
    if (type !== 'inbound_api') throw new Error('Only the Inbound API has a token to rotate.');
    const token = await issueInboundToken(ctx.tenantId);
    return { token };
  }
  if (type === 'inbound_api' && body.enabled === true) {
    throw new Error('Generate a token to switch the Inbound API on.');
  }
  const rec = await upsertPlugin(ctx.tenantId, type, {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    config: body.config && typeof body.config === 'object' ? body.config : undefined,
    events: Array.isArray(body.events) ? body.events : undefined,
  });
  return { plugin: redact(rec) };
}, { managerOnly: true });
