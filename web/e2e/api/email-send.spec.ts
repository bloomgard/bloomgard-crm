import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { ENV, protectionHeaders, runTag, DUMMY_RECIPIENT } from '../helpers/env';
import { resendStatus } from '../helpers/email';
import { makeQuote, snapshotProfile, snapshotThreads } from '../helpers/fixtures';

/**
 * Email sending through Resend. Every message goes to Resend's own test mailbox
 * (delivered@resend.dev), and each test checks Resend's record of what was actually sent.
 */
test.describe.serial('Outbound email', () => {
  let actor: Actor;
  let tag: string;
  const cleanup = new Cleanup();
  const expectedFrom = () => actor.tenant.custom_email_sender || '';
  const workspaceReplyTo = () => `${actor.tenant.inbound_routing_id}@inbound.bloomgard.co`;
  const sentRows = async (subject: string) => {
    const { data } = await admin().from('sent_emails').select('*').eq('tenant_id', actor.tenantId).eq('subject', subject);
    return data || [];
  };

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag();
    await snapshotThreads(actor, cleanup);
    await snapshotProfile(actor, cleanup);
  });
  test.afterAll(async () => {
    await admin().from('sent_emails').delete().eq('tenant_id', actor.tenantId).like('subject', `%${tag}%`);
    await cleanup.run();
  });

  test('send-quote validates required fields', async ({ request }) => {
    const r = await request.post(`${ENV.baseUrl}/api/send-quote`, { headers: protectionHeaders(), data: { to: DUMMY_RECIPIENT } });
    expect(r.status()).toBe(400);
  });

  test('send-quote delivers with attachment, workspace sender and reply-to, and logs usage', async ({ request }) => {
    const subject = `Quote send ${tag}`;
    const r = await request.post(`${ENV.baseUrl}/api/send-quote`, {
      headers: protectionHeaders(),
      data: {
        to: DUMMY_RECIPIENT, subject, message: 'E2E quote body',
        attachments: [{ filename: 'quote.txt', base64: Buffer.from('E2E attachment').toString('base64') }],
        agentEmail: actor.email, senderPreference: 'common', tenantId: actor.tenantId,
        companyName: actor.tenant.company_name, customSender: expectedFrom(),
      },
    });
    expect(r.status(), await r.text()).toBe(200);
    const id = (await r.json()).data.id as string;
    const sent = await resendStatus(request, id);
    expect(sent.last_event).toBe('delivered');
    expect(sent.from).toContain(expectedFrom());
    expect(sent.reply_to).toContain(workspaceReplyTo());           // replies come back through the inbound pipeline
    await waitFor(async () => (await sentRows(subject)).length === 1, 15_000, 1000, 'sent_emails usage row');
  });

  test('a personal forwarding address becomes the reply-to', async ({ request }) => {
    const fwd = `e2e-send-${tag}@inbound.bloomgard.co`;
    await admin().from('profiles').update({ inbound_email: fwd }).eq('id', actor.userId);
    const r = await request.post(`${ENV.baseUrl}/api/send-quote`, {
      headers: protectionHeaders(),
      data: {
        to: DUMMY_RECIPIENT, subject: `Fwd reply-to ${tag}`, message: 'body', agentEmail: actor.email, agentId: actor.userId,
        senderPreference: 'common', tenantId: actor.tenantId, companyName: actor.tenant.company_name, customSender: expectedFrom(),
      },
    });
    expect(r.status(), await r.text()).toBe(200);
    const sent = await resendStatus(request, (await r.json()).data.id);
    expect(sent.reply_to).toContain(fwd);
  });

  test('an unverified sender domain fails loudly instead of redirecting mail', async ({ request }) => {
    test.skip(!!process.env.RESEND_FALLBACK_TO, 'RESEND_FALLBACK_TO is set, so the sandbox fallback is expected');
    const r = await request.post(`${ENV.baseUrl}/api/send-quote`, {
      headers: protectionHeaders(),
      data: {
        to: DUMMY_RECIPIENT, subject: `Unverified ${tag}`, message: 'body', agentEmail: actor.email,
        senderPreference: 'common', tenantId: actor.tenantId, companyName: 'E2E', customSender: 'quotes@unverified-e2e-domain.example',
      },
    });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toMatch(/not verified|verify/i);
    expect((await sentRows(`Unverified ${tag}`)).length).toBe(0);
  });

  test('send-email validates fields and delivers', async ({ request }) => {
    const bad = await request.post(`${ENV.baseUrl}/api/send-email`, { headers: protectionHeaders(), data: { to: DUMMY_RECIPIENT } });
    expect(bad.status()).toBe(400);
    const r = await request.post(`${ENV.baseUrl}/api/send-email`, {
      headers: protectionHeaders(),
      data: { to: DUMMY_RECIPIENT, subject: `Send-email ${tag}`, message: 'plain body', tenantId: actor.tenantId, companyName: actor.tenant.company_name, customSender: expectedFrom() },
    });
    expect(r.status(), await r.text()).toBe(200);
    expect((await resendStatus(request, (await r.json()).data.id)).last_event).toBe('delivered');
  });

  test('inbox reply sends and logs the agent message on the quote named in the subject', async ({ request }) => {
    const q = await makeQuote(actor, cleanup, `${tag}-ir`);
    const subject = `Re: Quote ${q.qn} ${tag}`;
    const r = await request.post(`${ENV.baseUrl}/api/inbox/reply`, {
      headers: protectionHeaders(), data: { tenantId: actor.tenantId, to: DUMMY_RECIPIENT, subject, htmlBody: '<p>E2E inbox reply</p>' },
    });
    expect(r.status(), await r.text()).toBe(200);
    const convo = await waitFor(async () => {
      const { data } = await admin().from('quotations').select('custom_metadata').eq('id', q.id).single();
      return ((data?.custom_metadata as any)?.agent_conversations || []).find((m: any) => m.role === 'agent' && m.content.includes('E2E inbox reply'));
    }, 15_000, 1000, 'agent reply logged');
    expect(convo).toBeTruthy();
    expect((await sentRows(subject)).length).toBe(1);
  });

  test('inbox reply validates required fields', async ({ request }) => {
    const r = await request.post(`${ENV.baseUrl}/api/inbox/reply`, { headers: protectionHeaders(), data: { tenantId: actor.tenantId } });
    expect(r.status()).toBe(400);
  });

  test('triage reply: sends, moves the thread to outgoing, clears the draft, updates the quote', async ({ request }) => {
    const q = await makeQuote(actor, cleanup, `${tag}-ag`, { withThread: 'incoming' });
    const { data: th } = await admin().from('email_threads').select('id').eq('quote_id', q.id).single();
    await admin().from('email_threads').update({ ai_draft_text: 'draft to be cleared' }).eq('id', th!.id);

    const missing = await request.post(`${ENV.baseUrl}/api/agent/reply`, { headers: protectionHeaders(), data: { quoteId: q.id } });
    expect(missing.status()).toBe(400);

    const r = await request.post(`${ENV.baseUrl}/api/agent/reply`, {
      headers: protectionHeaders(),
      data: { threadId: th!.id, quoteId: q.id, tenantId: actor.tenantId, agentId: actor.userId, message: `E2E triage reply ${tag}` },
    });
    expect(r.status(), await r.text()).toBe(200);

    const { data: after } = await admin().from('email_threads').select('triage_status, ai_draft_text').eq('id', th!.id).single();
    expect(after!.triage_status).toBe('outgoing');
    expect(after!.ai_draft_text).toBeNull();
    const { data: quote } = await admin().from('quotations').select('follow_up_status, custom_metadata').eq('id', q.id).single();
    expect(quote!.follow_up_status).toBe('Manual Reply Sent');
    expect(((quote!.custom_metadata as any).agent_conversations || []).some((m: any) => m.content.includes(`E2E triage reply ${tag}`))).toBe(true);
    expect((await sentRows(`Re: Following up on Quote ${q.qn}`)).length).toBe(1);
  });
});
