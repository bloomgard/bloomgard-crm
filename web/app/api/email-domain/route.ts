import { authenticate, db } from '@/lib/agent/core';
import {
  loadState, saveState, startDomainSetup, refreshDomain, withDnsChecks, dnsHost, enableBrandedReplies,
  addRecordsAtCloudflare, ensureRoutingId, domainOfEmail, resend,
} from '@/lib/emailDomain';
import { sendEmail } from '@/lib/email';

export const maxDuration = 60;

async function view(tenantId: string, check: boolean) {
  const { tenant, state: stored } = await loadState(tenantId);
  const state = check && stored?.resend_id ? await refreshDomain(tenantId).catch(() => stored) : stored;
  const routing = tenant?.inbound_routing_id || await ensureRoutingId(tenantId, tenant?.company_name || 'workspace');
  return {
    company: tenant?.company_name,
    routing_address: `${routing}@inbound.bloomgard.co`,
    sender: tenant?.custom_email_sender || 'support@bloomgard.co',
    domain: state ? await withDnsChecks(state) : null,
    host: state?.name && !state.test ? await dnsHost(state.name) : null,
  };
}

/** Company email domain: status, records and our own DNS lookups. ?check=1 also asks Resend to verify now. */
export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const url = new URL(request.url);
  const test = url.searchParams.get('test');
  if (test) {
    const { data } = await db.from('inbound_emails').select('id, created_at').eq('tenant_id', ctx.tenantId).eq('subject', test).limit(1);
    return Response.json({ arrived: !!data?.length });
  }
  try {
    return Response.json({ ...(await view(ctx.tenantId, url.searchParams.get('check') === '1')), can_manage: ctx.isManager, suggested: domainOfEmail(ctx.email) });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (!ctx.isManager) return Response.json({ error: 'Only a Manager or Admin can change the email domain.' }, { status: 403 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  try {
    const { tenant, state } = await loadState(ctx.tenantId);
    switch (body?.action) {
      case 'create': {
        const s = await startDomainSetup(ctx.tenantId, body.domain || domainOfEmail(ctx.email));
        if (s.error) return Response.json({ error: s.error }, { status: 400 });
        break;
      }
      case 'verify': await refreshDomain(ctx.tenantId); break;
      case 'set_sender': {
        const local = String(body.local || '').trim().toLowerCase();
        if (!/^[a-z0-9._+-]+$/.test(local)) return Response.json({ error: 'Use letters, numbers, dots or dashes, e.g. "sales".' }, { status: 400 });
        const fresh = state?.resend_id ? await refreshDomain(ctx.tenantId, false) : state;
        if (!fresh || fresh.status !== 'verified') return Response.json({ error: 'Your domain is not verified yet. Add the DNS records first.' }, { status: 400 });
        await db.from('tenants').update({ custom_email_sender: `${local}@${fresh.name}` }).eq('id', ctx.tenantId);
        await saveState(ctx.tenantId, { ...fresh, sender_local: local });
        break;
      }
      case 'enable_replies': await enableBrandedReplies(ctx.tenantId); break;
      case 'cloudflare': {
        if (!state?.name) return Response.json({ error: 'Set up your company domain first.' }, { status: 400 });
        if (!body.token) return Response.json({ error: 'Paste a Cloudflare API token.' }, { status: 400 });
        const out = await addRecordsAtCloudflare(state, String(body.token));
        await refreshDomain(ctx.tenantId).catch(() => {});
        return Response.json({ ...(await view(ctx.tenantId, false)), cloudflare: out });
      }
      case 'test_inbound': {
        // Send a real email to the workspace's own reply address; the Inbox shows it once Resend has delivered it back.
        const routing = tenant?.inbound_routing_id || await ensureRoutingId(ctx.tenantId, tenant?.company_name || 'workspace');
        const to = state?.reply?.status === 'verified' ? `test@${state.reply.name}` : `${routing}@inbound.bloomgard.co`;
        const subject = `Bloomgard routing test ${Date.now().toString(36)}`;
        await sendEmail({ from: 'Bloomgard <support@bloomgard.co>', to, subject, text: 'This message checks that email sent to your workspace address reaches the Bloomgard Inbox.' });
        return Response.json({ sent: true, to, subject });
      }
      case 'remove': {
        if (state?.resend_id) await resend(`/domains/${state.resend_id}`, { method: 'DELETE' }).catch(() => {});
        if (state?.reply?.resend_id) await resend(`/domains/${state.reply.resend_id}`, { method: 'DELETE' }).catch(() => {});
        if (state?.name && String(tenant?.custom_email_sender || '').endsWith(`@${state.name}`)) await db.from('tenants').update({ custom_email_sender: null }).eq('id', ctx.tenantId);
        await saveState(ctx.tenantId, null);
        break;
      }
      default: return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
    return Response.json(await view(ctx.tenantId, false));
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
