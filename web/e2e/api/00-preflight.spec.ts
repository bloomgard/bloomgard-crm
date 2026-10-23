import { test, expect } from '@playwright/test';
import { ENV } from '../helpers/env';
import { admin, resolveActor } from '../helpers/db';
import { purgeLeftovers } from '../helpers/fixtures';

/** Fails fast, with a clear message, when an external credential is missing or has been reset. */
test.describe('Preflight: credentials and services', () => {
  test('app is reachable', async ({ request }) => {
    const res = await request.get(`${ENV.baseUrl}/login`);
    expect(res.status(), `${ENV.baseUrl} did not answer`).toBeLessThan(400);
  });

  test('Supabase service role works and the E2E account has a workspace', async () => {
    const actor = await resolveActor();
    expect(actor.tenantId).toBeTruthy();
    const { error } = await admin().from('tenants').select('id').limit(1);
    expect(error).toBeNull();
  });

  test('clears fixtures left by a crashed earlier run', async () => {
    await purgeLeftovers(await resolveActor());
  });

  test('Resend key is valid and the sending domain is verified', async ({ request }) => {
    const res = await request.get('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${ENV.resendKey}` } });
    expect(res.status(), 'RESEND_API_KEY rejected').toBe(200);
    const actor = await resolveActor();
    const domain = (actor.tenant.custom_email_sender || '').split('@')[1];
    const list = (await res.json()).data as Array<{ name: string; status: string }>;
    expect(list.find((d) => d.name === domain && d.status === 'verified'),
      `sender domain ${domain} is not verified in Resend`).toBeTruthy();
  });

  test('OpenRouter key is valid', async ({ request }) => {
    const key = process.env.OPENROUTER_API_KEY || '';
    expect(key, 'OPENROUTER_API_KEY missing').not.toBe('');
    const res = await request.get('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key.trim()}` } });
    expect(res.status(), 'OPENROUTER_API_KEY was rejected (reset or revoked). Put the new key in web/.env.local and in Vercel.').toBe(200);
  });
});
