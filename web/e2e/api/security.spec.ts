import { test, expect } from '@playwright/test';
import { resolveActor, Actor } from '../helpers/db';
import { ENV, protectionHeaders } from '../helpers/env';
import { authHeaders } from '../helpers/agent';

/**
 * No route may act on a workspace because the request names it. Each of these once trusted a
 * tenantId from the body or the query string: anyone could read an inbox, edit a catalogue or send
 * email as another company. Without a session they must refuse; with one, a different workspace's
 * id must be refused too.
 */
const OTHER = '00000000-0000-0000-0000-000000000000';

test.describe('Every workspace route needs the caller to belong to the workspace', () => {
  let actor: Actor;
  test.beforeAll(async () => { actor = await resolveActor(); });

  const routes: Array<[string, 'GET' | 'POST', (t: string) => any]> = [
    ['/api/inbox', 'GET', () => null],
    ['/api/inbox/update', 'POST', (t) => ({ tenantId: t, emailId: OTHER, updates: { is_read: true } })],
    ['/api/inbox/auto-pilot', 'POST', (t) => ({ tenantId: t, threadId: 'x', isAutoPilot: true })],
    ['/api/inbox/reply', 'POST', (t) => ({ tenantId: t, to: 'a@e2e.test', subject: 's', htmlBody: 'b' })],
    ['/api/master-data', 'GET', () => null],
    ['/api/send-email', 'POST', (t) => ({ tenantId: t, to: 'a@e2e.test', subject: 's', html: 'b' })],
    ['/api/send-quote', 'POST', (t) => ({ tenantId: t, to: 'a@e2e.test', subject: 's', message: 'b' })],
    ['/api/ask-ai', 'POST', (t) => ({ tenantId: t, query: 'hi' })],
    ['/api/trigger-agent', 'POST', (t) => ({ tenantId: t, quoteId: OTHER })],
    ['/api/agent-coordinator', 'POST', (t) => ({ tenantId: t })],
    ['/api/ai-auto-reply', 'POST', (t) => ({ tenantId: t, threadId: 'x' })],
    ['/api/agent/reply', 'POST', (t) => ({ tenantId: t, threadId: 'x', quoteId: OTHER, message: 'm' })],
    ['/api/ai/analyze-email', 'POST', () => ({ email: { subject: 's', body_text: 'b' } })],
    ['/api/quote-from-email', 'POST', (t) => ({ tenantId: t, analysis: { lead_gen_quote: { Products: [] } } })],
  ];

  for (const [path, method, body] of routes) {
    test(`${method} ${path}`, async ({ request }) => {
      const send = (headers: any, tenant: string) => method === 'GET'
        ? request.get(`${ENV.baseUrl}${path}?tenantId=${tenant}`, { headers })
        : request.post(`${ENV.baseUrl}${path}`, { headers, data: body(tenant) });
      // no session, naming a real workspace
      expect((await send(protectionHeaders(), actor.tenantId)).status(), 'anonymous').toBe(401);
      // a session, naming someone else's workspace
      if (JSON.stringify(body(OTHER) || {}).includes(OTHER) || method === 'GET') {
        expect((await send(await authHeaders(), OTHER)).status(), 'another workspace').toBe(403);
      }
    });
  }
});
