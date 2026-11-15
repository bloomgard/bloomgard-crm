import { authenticate } from '@/lib/agent/core';
import { createWorkspaceUser } from '@/lib/users';

/**
 * Add a user to the caller's own workspace. The caller must be signed in as an Admin or Manager; the
 * workspace comes from their session, never from the request body. Only admins can create admins.
 */
export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return Response.json({ success: false, error: 'Not signed in' }, { status: 401 });
  if (!ctx.isManager) return Response.json({ success: false, error: 'Only a Manager or Admin can add users.' }, { status: 403 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ success: false, error: 'Bad request' }, { status: 400 }); }
  if (String(body?.role).toLowerCase() === 'admin' && ctx.role !== 'admin') return Response.json({ success: false, error: 'Only an Admin can create another Admin.' }, { status: 403 });
  try {
    const u = await createWorkspaceUser({ tenantId: ctx.tenantId, email: body?.email, role: body?.role || 'agent', fullName: body?.fullName, password: body?.password || undefined });
    return Response.json({ success: true, userId: u.userId, password: u.password });
  } catch (e: any) {
    return Response.json({ success: false, error: e.message }, { status: 400 });
  }
}
