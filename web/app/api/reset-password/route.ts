import { authenticate, db } from '@/lib/agent/core';
import { generatePassword } from '@/lib/users';

/** Admins and Managers reset the password of someone in their own workspace. Identity comes from the session. */
export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return Response.json({ success: false, error: 'Not signed in' }, { status: 401 });
  if (!ctx.isManager) return Response.json({ success: false, error: 'Permission denied' }, { status: 403 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ success: false, error: 'Bad request' }, { status: 400 }); }
  const { data: target } = await db.from('profiles').select('tenant_id, role').eq('id', body?.userId).maybeSingle();
  if (!target || target.tenant_id !== ctx.tenantId) return Response.json({ success: false, error: 'Target user not found in this workspace' }, { status: 404 });
  if (target.role === 'admin' && ctx.role !== 'admin') return Response.json({ success: false, error: 'Only an Admin can reset an Admin.' }, { status: 403 });
  const newPassword = generatePassword();
  const { error } = await db.auth.admin.updateUserById(body.userId, { password: newPassword });
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 });
  return Response.json({ success: true, newPassword });
}
