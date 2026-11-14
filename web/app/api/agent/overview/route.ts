import { authenticate, buildOverview } from '@/lib/agent/core';

export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return Response.json({ error: 'Not signed in' }, { status: 401 });
  try {
    return Response.json(await buildOverview(ctx), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
