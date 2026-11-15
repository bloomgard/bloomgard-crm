import { provisionWorkspace } from '@/lib/users';

/** Public sign-up: creates a workspace and makes the person signing up its admin. */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const { companyName, fullName, email, password } = body || {};
  if (!email || !password) return Response.json({ error: 'Email and password are required.' }, { status: 400 });
  if (String(password).length < 8) return Response.json({ error: 'Use a password of at least 8 characters.' }, { status: 400 });
  try {
    const out = await provisionWorkspace({ companyName, fullName, email, password });
    return Response.json({ success: true, tenantId: out.tenantId });
  } catch (e: any) {
    return Response.json({ error: e.message || 'Could not create the account.' }, { status: 400 });
  }
}
