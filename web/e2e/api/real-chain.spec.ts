import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, waitFor } from '../helpers/db';
import { ENV, runTag } from '../helpers/env';
import { resendStatus } from '../helpers/email';

/**
 * The real thing, with nothing simulated: an email is sent through Resend to the workspace's
 * inbound address, Resend's inbound service receives it, calls whatever webhook is configured
 * there, and the app files it. Proves MX + webhook + routing + storage as deployed.
 */
test('a real email to the workspace inbound address arrives in the inbox', async ({ request }) => {
  test.setTimeout(150_000);
  const actor: Actor = await resolveActor();
  const tag = runTag();
  const subject = `E2E real chain ${tag}`;
  const to = `${actor.tenant.inbound_routing_id}@inbound.bloomgard.co`;
  const sender = actor.tenant.custom_email_sender!;

  const send = await request.post('https://api.resend.com/emails', {
    headers: { Authorization: `Bearer ${ENV.resendKey}` },
    data: { from: `E2E Sender <${sender}>`, to: [to], subject, text: `Real inbound delivery check ${tag}` },
  });
  expect(send.status(), await send.text()).toBe(200);
  const sentId = (await send.json()).id as string;
  expect((await resendStatus(request, sentId, 60_000)).last_event).toBe('delivered');

  try {
    const row = await waitFor(async () => {
      const { data } = await admin().from('inbound_emails').select('*').eq('tenant_id', actor.tenantId).eq('subject', subject).limit(1);
      return data?.[0];
    }, 90_000, 3000, `inbound email "${subject}" (is the Resend webhook for inbound.bloomgard.co enabled and pointing at a live app?)`);
    expect(row.sender_email).toContain(sender);
    expect(row.body_text).toContain(`Real inbound delivery check ${tag}`);
  } finally {
    await admin().from('inbound_emails').delete().eq('tenant_id', actor.tenantId).eq('subject', subject);
  }
});
