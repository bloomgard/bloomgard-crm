import { test } from '@playwright/test';
import { boot, nav, caption, clearCaption, receiveEmail } from '../helpers/demo';

// ── DEMO 1 ─────────────────────────────────────────────────────────────
// "Inbox — client emails captured automatically and read by the AI"
test('demo: inbox — capture & AI analysis', async ({ page }) => {
  test.setTimeout(240_000);

  await boot(page);
  await nav(page, 'Inbox');
  await caption(page, 'Bloomgard Inbox — every reply from a client lands here automatically. No forwarding, no copy-paste.', 4500);
  await clearCaption(page);

  await caption(page, 'A customer is about to email us…', 2600);
  await clearCaption(page);
  await receiveEmail({
    from: 'Ramesh Iyer <ramesh@northgate-logistics.example>',
    subject: 'Need pricing — corrugated boxes & stretch film',
    text:
      'Hi, we are setting up a new packing line. Please share your rate for the Corrugated Box A4 (code BX-CORR-A4) and the Stretch Wrap Film 500mm. We would need about 4000 boxes and 60 rolls per month. Also do you deliver to Pune?\n\nThanks,\nRamesh Iyer\nNorthgate Logistics',
    messageId: `<demo-inbox-1-${Date.now()}@northgate-logistics.example>`,
  });
  await page.waitForTimeout(2500);

  await page.getByRole('button', { name: /refresh/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await caption(page, 'It arrives in seconds — subject, sender and full body, ready to action.', 4200);
  await clearCaption(page);

  // open the newest email
  await page.locator('[class*="border-l-4"]').first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await caption(page, 'Open it, and ask the AI to work the email.', 3200);
  await clearCaption(page);

  const gen = page.getByRole('button', { name: /Generate AI Actions/i });
  if (await gen.isVisible().catch(() => false)) {
    await gen.click();
    await caption(page, 'The AI reads the message and drafts three things…', 3500);
    await clearCaption(page);
    await page.waitForTimeout(9000);
  }

  await caption(page, '1) A one-line summary of what the customer wants.', 4000);
  await clearCaption(page);
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(800);
  await caption(page, '2) A ready-to-send reply — priced from your product catalogue, never invented.', 4600);
  await clearCaption(page);
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(800);
  await caption(page, '3) A draft quotation, with the products already matched to their codes.', 4400);
  await clearCaption(page);

  // reply inline
  const replyBox = page.getByPlaceholder(/type your reply/i).first();
  if (await replyBox.isVisible().catch(() => false)) {
    await replyBox.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await caption(page, 'Reply straight from the inbox — sent from your workspace address, threaded correctly.', 4200);
    await clearCaption(page);
    await replyBox.click({ force: true });
    await replyBox.fill('Hi Ramesh, thanks for reaching out — pricing and delivery lead time to follow shortly.');
    await page.waitForTimeout(1400);
    const send = page.getByRole('button', { name: /^send reply$/i }).first();
    if (await send.isVisible().catch(() => false)) {
      await send.click({ force: true });
      await page.waitForTimeout(3500);
      await caption(page, 'Sent. The whole thread stays on the record.', 3800);
      await clearCaption(page);
    }
  }

  await caption(page, 'Inbox: no email missed, every one triaged by the AI.', 4200);
  await page.waitForTimeout(600);
});
