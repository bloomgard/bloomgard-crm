import { runScheduled } from '@/lib/platform/workflows';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * The daily scheduler, called by Vercel Cron (vercel.json) at 09:00 IST: quiet quotes, follow-up
 * dates reached, and morning automations, for every workspace. Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused. `?tenant=<id>` limits it to one
 * workspace (handy for testing). Response: `{ tenants, workflows, runs, errors }`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'The scheduler is not configured: set CRON_SECRET in the environment.' }, { status: 503 });
  if ((request.headers.get('authorization') || '') !== `Bearer ${secret}`) return Response.json({ error: 'Not allowed.' }, { status: 401 });
  const tenant = new URL(request.url).searchParams.get('tenant') || undefined;
  try {
    return Response.json(await runScheduled({ tenantId: tenant }));
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Scheduler failed.' }, { status: 500 });
  }
}
