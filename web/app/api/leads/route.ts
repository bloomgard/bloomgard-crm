import { withCtx } from '@/lib/platform/route';
import { captureFromEmail, captureFromText, leadStats, listLeads, scanInbox } from '@/lib/platform/leads';

export const maxDuration = 120;

const shape = (r: any) => ({ id: r.id, title: r.title, created_at: r.created_at, ...r.data });

/** GET ?status=new|qualified|contacted|converted|discarded|open|all &temperature= &q= &email_ids=a,b */
export const GET = withCtx(async (ctx, req) => {
  const u = new URL(req.url).searchParams;
  const email_ids = (u.get('email_ids') || '').split(',').map((x) => x.trim()).filter(Boolean);
  const leads = await listLeads(ctx, { status: u.get('status') || undefined, temperature: u.get('temperature') || undefined, q: u.get('q') || undefined, email_ids });
  const all = email_ids.length ? leads : await listLeads(ctx, { status: 'all' });
  return { leads: leads.map(shape), stats: leadStats(all), can_manage: ctx.isManager };
});

/**
 * { action: 'scan', limit? }              read recent emails for leads
 * { action: 'from_email', email_id, force? }  read one email now (force: read it again)
 * { action: 'manual', text, from_email?, subject? }  a lead from pasted text
 */
export const POST = withCtx(async (ctx, _req, body) => {
  const signer = { name: ctx.profile?.full_name, title: ctx.profile?.job_title, company: ctx.tenant?.company_name };
  switch (body.action) {
    case 'scan': return scanInbox(ctx, { limit: Number(body.limit) || 15 });
    case 'from_email': {
      if (!body.email_id) throw new Error('Which email?');
      return { lead: shape(await captureFromEmail(ctx.tenantId, String(body.email_id), { signer, force: !!body.force })) };
    }
    case 'manual': return { lead: shape(await captureFromText(ctx, { text: body.text, from_email: body.from_email, subject: body.subject })) };
    default: throw new Error('Action must be scan, from_email or manual.');
  }
});
