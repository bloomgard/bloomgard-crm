import { test, expect, Page } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { runTag } from '../helpers/env';
import { seedCatalogue, makeQuote } from '../helpers/fixtures';
import { openApp, go, captureDialogs } from './_app';

const field = (page: Page, label: string) =>
  page.locator(`div:has(> label:text-is("${label}"))`).locator('input, select').first();

test.describe.serial('New quote form fed by Master Data', () => {
  let actor: Actor;
  let tag: string;
  const cleanup = new Cleanup();
  const codeA = () => `E2E-${tag.toUpperCase()}-FA`;
  const codeB = () => `E2E-${tag.toUpperCase()}-FB`;

  test.beforeAll(async ({ request }) => {
    actor = await resolveActor(); tag = runTag();
    await seedCatalogue(request, actor, cleanup, [
      [codeA(), `E2E Sprocket ${tag}`, 'PCS', '88.00'],
      [codeB(), `E2E Bracket ${tag}`, 'KG', '3.50'],
    ]);
  });
  test.afterAll(async () => cleanup.run());

  async function pickCode(page: Page, code: string) {
    const input = field(page, 'Item Code');
    await input.click();
    await input.fill(code);
    await page.getByText(code, { exact: true }).first().click();
  }

  test('choosing the parent fills every child; choosing another parent re-syncs them; the saved quote keeps the values', async ({ page }) => {
    const dialogs = captureDialogs(page);
    await openApp(page);
    await go(page, 'Quotes');
    await page.getByRole('button', { name: /\+ New Entry/ }).click();
    await expect(page.getByText('Products', { exact: true }).first()).toBeVisible();

    await field(page, 'Client Name').fill(`E2E Co ${tag} UI`);
    await pickCode(page, codeA());
    await expect.poll(() => field(page, 'Item Name').inputValue(), { timeout: 10_000 }).toBe(`E2E Sprocket ${tag}`);
    await expect(field(page, 'UOM')).toHaveValue('PCS');           // a "dropdown" field now lists Master Data values
    await expect.poll(() => field(page, 'Rate').inputValue()).toBe('88.00');

    await pickCode(page, codeB());                                  // switch parent: no stale child values left
    await expect.poll(() => field(page, 'Item Name').inputValue(), { timeout: 10_000 }).toBe(`E2E Bracket ${tag}`);
    await expect(field(page, 'UOM')).toHaveValue('KG');
    await expect.poll(() => field(page, 'Rate').inputValue()).toBe('3.50');

    await field(page, 'Quantity').fill('4');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => dialogs.join('|'), { timeout: 20_000 }).toMatch(/Successfully saved QN-/);
    const qn = dialogs.join('|').match(/saved (QN-[\w-]+)!/)![1];

    const quote = await waitFor(async () => {
      const { data } = await admin().from('quotations').select('id, client_id, status').eq('tenant_id', actor.tenantId).eq('qn_number', qn).maybeSingle();
      return data;
    }, 15_000, 1000, 'saved quotation');
    cleanup.add(async () => {
      await admin().from('status_logs').delete().eq('quotation_id', quote.id);
      await admin().from('email_threads').delete().eq('quote_id', quote.id);
      await admin().from('quotation_items').delete().eq('quotation_id', quote.id);
      await admin().from('quotations').delete().eq('id', quote.id);
      await admin().from('clients').delete().eq('id', quote.client_id);
    });
    const { data: items } = await admin().from('quotation_items').select('item_code, item_name, uom, item_rate, quantity').eq('quotation_id', quote.id);
    expect(items).toHaveLength(1);
    expect(items![0]).toMatchObject({ item_code: codeB(), item_name: `E2E Bracket ${tag}`, uom: 'KG', quantity: 4 });
    expect(Number(items![0].item_rate)).toBeCloseTo(3.5);
  });

  // "Same client, different quote: almost everything is the same as before."
  test('fields remember what was typed before, and choosing a known client fills the rest from their last quote', async ({ page }) => {
    const client = `E2E Remembered Co ${tag}`;
    const q = await makeQuote(actor, cleanup, `${tag}-remember`, {});
    await admin().from('quotations').update({
      custom_metadata: {
        'Client Information': { client_name: client, contact_person: `Asha ${tag}`, email_id: `asha-${tag}@e2e-buyer.test`, billing_address: `Plot 9, GIDC ${tag}` },
        'Quote Details': { status: 'Inquiry', payment_terms: `45 days net ${tag}`, delivery_terms: `FOB Mundra ${tag}` },
      },
    }).eq('id', q.id);

    await openApp(page);
    await go(page, 'Quotes');
    await page.getByRole('button', { name: /\+ New Entry/ }).click();
    await expect(page.getByText('Products', { exact: true }).first()).toBeVisible();

    // a value typed on another quote is offered, marked as used before
    const terms = page.getByLabel('Payment Terms');
    await terms.click();
    await terms.fill('45 days');
    const option = page.getByRole('option', { name: new RegExp(`45 days net ${tag}`) });
    await expect(option).toBeVisible();
    await expect(option).toContainText(/used before/i);
    await terms.fill('');

    // choosing the client from the keyboard fills contact, email, address and terms
    const name = page.getByLabel('Client Name');
    await name.click();
    await name.fill(`E2E Remembered Co ${tag}`.slice(0, 18));
    await expect(page.getByRole('option', { name: new RegExp(client) })).toBeVisible();
    await name.press('ArrowDown');
    await name.press('ArrowUp');
    await name.press('Enter');
    await expect(name).toHaveValue(client);
    await expect(page.getByTestId('prefill-note')).toContainText(client);
    await expect(page.getByLabel('Contact Person')).toHaveValue(`Asha ${tag}`);
    await expect(page.getByLabel('Billing Address')).toHaveValue(`Plot 9, GIDC ${tag}`);
    await expect(page.getByLabel('Delivery Terms')).toHaveValue(`FOB Mundra ${tag}`);
    await expect(page.getByLabel('Payment Terms')).toHaveValue(`45 days net ${tag}`);

    // Undo puts the form back, keeping only the client
    await page.getByTestId('prefill-note').getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByLabel('Contact Person')).toHaveValue('');
    await expect(name).toHaveValue(client);
    await page.getByRole('button', { name: 'Discard' }).click().catch(() => {});
  });
});
