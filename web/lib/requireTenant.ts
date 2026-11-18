import crypto from 'crypto';
import { authenticate, AgentCtx } from '@/lib/agent/core';

/**
 * Which workspace a request may act on. Never the id the request names on its own word:
 *  - a signed-in user acts on their own workspace (a different id in the request is refused);
 *  - server code calling another route in-process carries INTERNAL_HEADER, and may name one.
 * Anything else is refused. This replaced routes that read `tenantId` straight from the body or
 * the query string, which let anyone read or change any workspace.
 */
export const INTERNAL_HEADER = 'x-bloomgard-internal';

/** Derived from the service-role key, so it needs no setup and never leaves the server. */
export const internalKey = () =>
  crypto.createHash('sha256').update(`bloomgard-internal:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`).digest('hex');

export class TenantError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function requireTenant(request: Request, claimed?: string | null): Promise<{ tenantId: string; ctx: AgentCtx | null }> {
  const internal = request.headers.get(INTERNAL_HEADER);
  if (internal && process.env.SUPABASE_SERVICE_ROLE_KEY && crypto.timingSafeEqual(Buffer.from(internal.padEnd(64).slice(0, 64)), Buffer.from(internalKey()))) {
    if (!claimed) throw new TenantError('Missing tenantId.', 400);
    return { tenantId: claimed, ctx: null };
  }
  const ctx = await authenticate(request);
  if (!ctx) throw new TenantError('Not signed in.', 401);
  if (claimed && claimed !== ctx.tenantId) throw new TenantError('That is not your workspace.', 403);
  return { tenantId: ctx.tenantId, ctx };
}

/** For route handlers: the same guard, answered as JSON. */
export async function guard(request: Request, claimed?: string | null) {
  try { return { ok: true as const, ...(await requireTenant(request, claimed)) }; }
  catch (e: any) { return { ok: false as const, response: Response.json({ error: e.message || 'Not allowed.' }, { status: e.status || 401 }) }; }
}
