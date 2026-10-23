import { test } from '@playwright/test';
import { boot, nav, caption, clearCaption, receiveEmail } from '../helpers/demo';

// ── DEMO 3 ─────────────────────────────────────────────────────────────
// "Lead generation — a cold inquiry email becomes a ready quotation in one click"
test('demo: lead gen from an inbox enquiry', async ({ page }) => {
  test.setTimeout(240_000);

  await boot(page);

  await caption(page, 'A brand-new enquiry from a company we\'ve never quoted before…', 3600);
  await clearCaption(page);
  await receiveEmail({
    from: 'Sunil Deshpande <purchase@apex-packaging.example>',
    subject: 'Enquiry — packaging materials for new facility',
    text:
      'Hello, we are commissioning a new distribution centre and need a quotation for:\n' +
      '- 6000 units of Corrugated Box A3 (BX-CORR-A3)\n' +
      '- 40 rolls of Stretch Wrap Film 500mm (STRETCH-500)\n' +
      '- 120 rolls of PP Strapping 12mm (STRAP-PP-12)\n\n' +
      'Delivery to Aurangabad. Contact: Sunil Deshpande, purchase@apex-packaging.example, +91 90000 22222.',
    messageId: `<demo-lg-1-${Date.now()}@apex-packaging.example>`,
  });
  await page.waitForTimeout(2500);

  await nav(page, 'Inbox');
  await page.getByRole('button', { name: /refresh/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await caption(page, 'It lands in the Inbox like any other email.', 3400);
  await clearCaption(page);

  await page.locator('[class*="border-l-4"]').first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await caption(page, 'The customer listed three products, by name and code.', 3800);
  await clearCaption(page);

  const gen = page.getByRole('button', { name: /Generate AI Actions/i });
  if (await gen.isVisible().catch(() => false)) {
    await gen.click();
    await caption(page, 'One click — the AI extracts the client and every line item.', 4200);
    await clearCaption(page);
    await page.waitForTimeout(10_000);
  }

  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(1200);
  await caption(page, 'Each product is matched to your catalogue: code, description, unit and rate — filled in.', 5200);
  await clearCaption(page);

  const createBtn = page.getByRole('button', { name: /Create Quote Now/i });
  if (await createBtn.isVisible().catch(() => false)) {
    await caption(page, 'Turn it into a real quotation…', 2800);
    await clearCaption(page);
    page.once('dialog', (d) => d.accept());
    await createBtn.click();
    await page.waitForTimeout(6000);
  }

  await nav(page, 'Quotes');
  await page.waitForTimeout(3000);
  await caption(page, 'A new quotation — numbered, client attached, line items in place.', 4600);
  await clearCaption(page);

  await page.locator('table tbody tr').first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(2000);
  await caption(page, 'From a cold email to a priced quote — no re-typing, in under a minute.', 5000);
  await page.waitForTimeout(800);
});
