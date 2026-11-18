import { authenticate } from '@/lib/agent/core';
import { executeAction } from '@/lib/agent/tools';

export const maxDuration = 60;

/** Apply an action the user confirmed in the chat. Permissions are re-checked here. */
export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return Response.json({ error: 'Not signed in' }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  if (!body?.kind || typeof body.payload !== 'object') return Response.json({ error: 'Missing kind or payload' }, { status: 400 });
  try {
    // links the action makes (a client quote link) point at the site the user is on
    const out = await executeAction(body.kind, body.payload, { ...ctx, origin: request.headers.get('origin') || new URL(request.url).origin } as any);
    return Response.json(out);
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || 'Action failed' }, { status: 400 });
  }
}
