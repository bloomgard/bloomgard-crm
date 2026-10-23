import { Page, expect } from '@playwright/test';

import { ENV, protectionHeaders } from './env';
import { resolveActor } from './db';

export const DEPLOY = ENV.baseUrl;

/** Lower-third caption overlay so the recording explains itself. */
export async function caption(page: Page, text: string, holdMs = 3800) {
  await page.evaluate((t) => {
    let el = document.getElementById('__demo_cap');
    if (!el) {
      el = document.createElement('div');
      el.id = '__demo_cap';
      el.setAttribute(
        'style',
        [
          'position:fixed', 'left:50%', 'bottom:34px', 'transform:translateX(-50%)',
          'z-index:2147483647', 'max-width:min(880px,90vw)', 'box-sizing:border-box',
          'background:rgba(17,20,29,.94)', 'color:#fff', 'padding:16px 26px',
          'border-radius:14px', 'border:1px solid rgba(255,255,255,.12)',
          'box-shadow:0 20px 50px -12px rgba(0,0,0,.5)', 'text-align:center',
          'font:500 19px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif',
          'letter-spacing:.1px', 'opacity:0', 'transition:opacity .35s ease',
          'pointer-events:none', 'backdrop-filter:blur(4px)',
        ].join(';')
      );
      document.body.appendChild(el);
    }
    el.textContent = t;
    // force reflow then fade in
    void el.offsetWidth;
    el.style.opacity = '1';
  }, text);
  await page.waitForTimeout(holdMs);
}

export async function clearCaption(page: Page) {
  await page.evaluate(() => {
    const el = document.getElementById('__demo_cap');
    if (el) el.style.opacity = '0';
  });
  await page.waitForTimeout(400);
}

/** Simulate a client email arriving through the real inbound webhook. */
export async function receiveEmail(opts: {
  from: string; subject: string; text: string; messageId: string;
}) {
  const actor = await resolveActor();
  const INBOUND = `${actor.tenant.inbound_routing_id}@inbound.bloomgard.co`;
  const res = await fetch(`${DEPLOY}/api/inbound-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...protectionHeaders() },
    body: JSON.stringify({
      type: 'email.received',
      data: {
        from: opts.from,
        to: [INBOUND],
        subject: opts.subject,
        text: opts.text,
        email_id: `demo_${Date.now()}`,
        message_id: opts.messageId,
      },
    }),
  });
  return res.ok;
}

export async function boot(page: Page) {
  await page.goto(`${DEPLOY}/dashboard`);
  await expect(page.getByText('Initializing Workspace...')).toBeHidden({ timeout: 45_000 });
  await page.waitForTimeout(1200);
}

export async function nav(page: Page, label: string) {
  await page.locator('nav').getByText(label, { exact: true }).first().click();
  await page.waitForTimeout(1400);
}
