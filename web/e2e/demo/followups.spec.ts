import { test } from '@playwright/test';
import { boot, nav, caption, clearCaption, receiveEmail } from '../demo-helpers';

// ── DEMO 2 ─────────────────────────────────────────────────────────────
// "Follow-ups — AI triage, urgency sorting, and a drafted reply on every inbound"
test('demo: follow-ups — triage, sorting & AI reply', async ({ page }) => {
  test.setTimeout(240_000);

  await boot(page);
  await nav(page, 'Follow ups');
  await caption(page, 'Follow-ups — every open quote that needs attention, in one place.', 4200);
  await clearCaption(page);

  await caption(page, 'Each quote is scored by how long it has been quiet: HOT, WARM or COLD.', 4600);
  await clearCaption(page);
  await caption(page, 'The list is sorted hottest-first, so the deals going cold surface on top.', 4400);
  await clearCaption(page);

  const search = page.getByPlaceholder(/search quote/i);
  if (await search.isVisible().catch(() => false)) {
    await caption(page, 'Find any one instantly — search by client name or quote number.', 3600);
    await clearCaption(page);
    await search.pressSequentially('QN-2026-007', { delay: 90 });
    await page.waitForTimeout(2200);
    await search.fill('');
    await page.waitForTimeout(1200);
  }

  // A client replies to an open quote → AI drafts a response
  await caption(page, 'Now a customer replies to quote QN-2026-007…', 3200);
  await clearCaption(page);
  await receiveEmail({
    from: 'Priya Nair <priya@delta-buildmart.example>',
    subject: 'Re: Following up on Quote QN-2026-007',
    text:
      'Thanks for the follow-up. Please confirm the unit rate and pack size for the BOPP Packing Tape 48mm (code TAPE-BOPP-48), and your lead time for 500 pieces to our Nagpur warehouse.',
    messageId: `<demo-fu-1-${Date.now()}@delta-buildmart.example>`,
  });
  await page.waitForTimeout(11_000); // inbound + AI draft

  // full refetch, then back to Follow-ups → Incoming
  await boot(page);
  await nav(page, 'Follow ups');
  await page.getByText('Incoming', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  await caption(page, 'The reply is captured, and the AI has already drafted an answer.', 4400);
  await clearCaption(page);
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(1200);
  await caption(page, 'It quotes the real rate from your catalogue — and says "I\'ll confirm" for the lead time it doesn\'t know.', 5200);
  await clearCaption(page);
  await caption(page, 'Nothing is sent automatically. You read it, tweak it, and decide.', 4400);
  await clearCaption(page);

  const draft = page.getByPlaceholder(/type a manual reply/i).first();
  const sendReply = page.getByRole('button', { name: /^send reply$/i }).first();
  if (await sendReply.isVisible().catch(() => false)) {
    if (await draft.isVisible().catch(() => false)) {
      await draft.click();
      await page.keyboard.press('End');
      await draft.pressSequentially(' — happy to help.', { delay: 26 });
      await page.waitForTimeout(1000);
    }
    await caption(page, 'One click sends it — from your address, on the same thread.', 3800);
    await clearCaption(page);
    await sendReply.click();
    await page.waitForTimeout(3500);
  }

  await page.getByText('Outgoing', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await caption(page, 'The thread moves to Outgoing — handled, and logged against the quote.', 4600);
  await page.waitForTimeout(800);
});
