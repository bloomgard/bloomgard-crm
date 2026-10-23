import { test, expect, Page } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { runTag } from '../helpers/env';
import { seedCatalogue } from '../helpers/fixtures';
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
});
