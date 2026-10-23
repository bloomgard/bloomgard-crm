import type { APIRequestContext } from '@playwright/test';
import { ENV, protectionHeaders } from './env';
import { admin, waitFor } from './db';

/** Simulate Resend delivering an inbound email to our webhook (same payload shape Resend posts). */
export async function deliverInbound(
  request: APIRequestContext,
  o: { to: string; from: string; subject: string; text: string; messageId?: string }
) {
  const messageId = o.messageId || `<${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@e2e.test>`;
  const res = await request.post(`${ENV.baseUrl}/api/inbound-email`, {
    headers: protectionHeaders(),
    data: {
      type: 'email.received',
      data: {
        from: o.from, to: [o.to], subject: o.subject, text: o.text,
        email_id: `e2e_${Date.now().toString(36)}`, message_id: messageId,
      },
    },
  });
  return { res, messageId: messageId.replace(/^<|>$/g, '') };
}

/** Wait for the inbound row the webhook writes (it inserts before replying 200). */
export async function inboundRow(subject: string, tenantId: string, timeoutMs = 20_000) {
  return waitFor(async () => {
    const { data } = await admin().from('inbound_emails').select('*')
      .eq('tenant_id', tenantId).eq('subject', subject).order('created_at', { ascending: false }).limit(1);
    return data?.[0];
  }, timeoutMs, 1000, `inbound email "${subject}"`);
}

/** Resend's view of an outbound email: poll until it reaches a terminal state. */
export async function resendStatus(request: APIRequestContext, id: string, timeoutMs = 45_000) {
  return waitFor(async () => {
    const r = await request.get(`https://api.resend.com/emails/${id}`, {
      headers: { Authorization: `Bearer ${ENV.resendKey}` },
    });
    if (!r.ok()) return null;
    const j = await r.json();
    return ['delivered', 'bounced', 'complained', 'failed'].includes(j.last_event) ? j : null;
  }, timeoutMs, 2000, `Resend email ${id} to reach a final state`);
}
