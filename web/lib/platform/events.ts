import type { PlatformEvent } from './types';

/** How many workflow hops one original event may cause. Stops A-triggers-B-triggers-A loops. */
export const MAX_DEPTH = 3;

/**
 * Something happened in a workspace. Runs the matching workflows and delivers the event to the
 * workspace's plugins (webhook, Slack). Called by server code directly, and by the browser through
 * POST /api/events after it changes a quote itself. Never throws: what happened has happened, and
 * an automation failing must not undo it or fail the request that caused it.
 */
export async function emit(ev: PlatformEvent): Promise<{ workflows: number; plugins: number }> {
  // an event raised inside a running workflow step inherits that step's place in the chain
  let scope: { depth: number; chain: string[] } | undefined;
  try { scope = (await import('./workflows') as any).automationScope?.getStore(); } catch { scope = undefined; }
  const event: PlatformEvent = { ...ev, depth: ev.depth ?? scope?.depth ?? 0, chain: ev.chain ?? scope?.chain ?? [] };
  if ((event.depth || 0) > MAX_DEPTH) return { workflows: 0, plugins: 0 };
  let workflows = 0, plugins = 0;
  try {
    const { runWorkflowsForEvent } = await import('./workflows');
    workflows = await runWorkflowsForEvent(event);
  } catch (e) { console.error('[events] workflows', ev.type, e); }
  try {
    const { deliverToPlugins } = await import('./plugins');
    plugins = await deliverToPlugins(event);
  } catch (e) { console.error('[events] plugins', ev.type, e); }
  return { workflows, plugins };
}
