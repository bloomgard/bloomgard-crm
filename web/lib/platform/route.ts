import { authenticate, AgentCtx } from '@/lib/agent/core';

/**
 * Wrap a platform API handler: the caller must be signed in (their workspace comes from their own
 * token, never from the request), the body is parsed for POST/PATCH/DELETE, and any thrown error is
 * returned as { error } with a 400, or 403 when it says so.
 */
export function withCtx(
  handler: (ctx: AgentCtx, req: Request, body: any, params: Record<string, string>) => Promise<any>,
  o: { managerOnly?: boolean } = {},
) {
  return async (request: Request, context?: { params?: Promise<Record<string, string>> | Record<string, string> }) => {
    const ctx = await authenticate(request);
    if (!ctx) return Response.json({ error: 'Not signed in' }, { status: 401 });
    if (o.managerOnly && !ctx.isManager) return Response.json({ error: 'Only managers and admins can do that.' }, { status: 403 });
    let body: any = {};
    if (request.method !== 'GET') {
      try { body = await request.json(); } catch { body = {}; }
    }
    const params = (await (context?.params as any)) || {};
    try {
      const out = await handler(ctx, request, body, params);
      return out instanceof Response ? out : Response.json(out ?? { ok: true });
    } catch (e: any) {
      const msg = e?.message || 'Something went wrong.';
      return Response.json({ error: msg }, { status: /only managers|not allowed|only the assignee/i.test(msg) ? 403 : 400 });
    }
  };
}

export const forbidden = (msg = 'Only managers and admins can do that.') => { throw new Error(msg); };
