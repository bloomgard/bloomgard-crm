import { test, expect } from '@playwright/test';
import * as XLSX from 'xlsx';
import { admin, resolveActor, Actor, Cleanup } from '../helpers/db';
import { runTag } from '../helpers/env';
import { openApp, openSetting, pageErrors } from './_app';

test.describe.serial('Master Data screen', () => {
  let actor: Actor;
  let tag: string;
  const cleanup = new Cleanup();
  const codes: string[] = [];

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag();
    cleanup.add(async () => {
      const { data: ents } = await admin().from('master_data_entries').select('id').eq('tenant_id', actor.tenantId).eq('key_name', 'item_code');
      if (ents?.length && codes.length) await admin().from('master_data_values').delete().in('entry_id', ents.map((e) => e.id)).in('value_text', codes);
    });
  });
  test.afterAll(async () => cleanup.run());

  test('shows the catalogue as an Excel-style grid with its linked columns', async ({ page }) => {
    const errors = pageErrors(page);
    await openApp(page);
    await openSetting(page, 'Master Data');
    await expect(page.getByRole('button', { name: /Import Excel/ })).toBeVisible();
    for (const col of ['item_code', 'item_name', 'uom', 'item_rate']) {
      await expect(page.locator('th', { hasText: col }).first()).toBeVisible();
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('typing in the grid adds a row and fills it left to right, parent to child', async ({ page }) => {
    const code = `E2E-UI-${tag}-1`; codes.push(code);
    await openApp(page);
    await openSetting(page, 'Master Data');
    await page.getByPlaceholder('+ new row').first().fill(code);
    await page.getByPlaceholder('+ new row').first().press('Enter');
    const row = page.locator('tr', { hasText: code });
    await expect(row).toBeVisible({ timeout: 15_000 });
    for (const [i, value] of ['Grid Widget', 'PCS', '19.90'].entries()) {
      const input = row.locator('td').nth(i + 1).getByPlaceholder('+ add');
      await input.fill(value);
      await input.press('Enter');
      await expect(row.locator('td').nth(i + 1)).toContainText(value, { timeout: 15_000 });
    }
    // persisted as a linked chain
    const { data: root } = await admin().from('master_data_values').select('id').eq('value_text', code).single();
    const { data: kids } = await admin().from('master_data_values').select('value_text').eq('parent_value_id', root!.id);
    expect((kids || []).map((k) => k.value_text)).toEqual(['Grid Widget']);
  });

  test('a cell can be edited in place', async ({ page }) => {
    const code = `E2E-UI-${tag}-1`;
    await openApp(page);
    await openSetting(page, 'Master Data');
    const row = page.locator('tr', { hasText: code });
    await row.locator('td').nth(1).getByText('Grid Widget').click();
    const edit = row.locator('td').nth(1).locator('input');
    await edit.fill('Grid Widget v2');
    await edit.press('Enter');
    await expect(row.locator('td').nth(1)).toContainText('Grid Widget v2', { timeout: 15_000 });
  });

  test('importing an Excel sheet auto-matches columns, builds the chain and lets you ignore a column', async ({ page }) => {
    const c1 = `E2E-XL-${tag}-1`, c2 = `E2E-XL-${tag}-2`; codes.push(c1, c2);
    const ws = XLSX.utils.aoa_to_sheet([
      ['Item Code', 'Product Name', 'UOM', 'Rate', 'Internal notes'],
      [c1, 'Excel Gadget One', 'KG', 5.5, 'skip me'],
      [c2, 'Excel Gadget Two', 'KG', 6.25, 'skip me too'],
    ]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Catalogue');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    await openApp(page);
    await openSetting(page, 'Master Data');
    await page.locator('input[type="file"]').setInputFiles({ name: 'catalogue.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
    const modal = page.getByText('Map Columns').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('2 rows');
    // headers were matched to field keys without renaming anything
    const selects = modal.locator('select');
    await expect(selects.nth(0)).toHaveValue('item_code');
    await expect(selects.nth(1)).toHaveValue('item_name');
    await expect(selects.nth(2)).toHaveValue('uom');
    await expect(selects.nth(3)).toHaveValue('item_rate');
    await expect(selects.nth(4)).toHaveValue('');                 // "Internal notes" has no field: ignored
    await modal.getByRole('button', { name: 'Import' }).click();
    await expect(page.locator('tr', { hasText: c1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('tr', { hasText: c2 })).toBeVisible();
    await expect(page.locator('tr', { hasText: c1 })).toContainText('Excel Gadget One');
    await expect(page.locator('tr', { hasText: c1 })).not.toContainText('skip me');
  });

  test('an imported value can be deleted from the grid and takes its children with it', async ({ page }) => {
    const code = `E2E-XL-${tag}-2`;
    await openApp(page);
    await openSetting(page, 'Master Data');
    const row = page.locator('tr', { hasText: code });
    await row.hover();
    await row.locator('td').first().locator('button').click();
    await expect(page.locator('tr', { hasText: code })).toHaveCount(0, { timeout: 15_000 });
    const { data } = await admin().from('master_data_values').select('id').eq('value_text', 'Excel Gadget Two');
    expect(data).toEqual([]);
  });
});
