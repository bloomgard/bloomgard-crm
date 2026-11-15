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
    // the AI reads the sheet; wait for it, then check what it matched (by header, since it may reorder columns)
    await expect(modal.getByText(/Bloomgard AI is reading/)).toHaveCount(0, { timeout: 60_000 });
    const field = (h: string) => modal.getByLabel(`Field for ${h}`);
    await expect(field('Item Code')).toHaveValue('item_code');
    await expect(field('Product Name')).toHaveValue('item_name');
    await expect(field('UOM')).toHaveValue('uom');
    await expect(field('Rate')).toHaveValue('item_rate');
    await field('Internal notes').selectOption('');                  // we do not want notes in the catalogue
    // anything the AI was unsure about must be answered before importing; answer by keeping its pick
    for (const h of ['Item Code', 'Product Name', 'UOM', 'Rate']) await field(h).selectOption(await field(h).inputValue());
    await expect(modal.getByRole('button', { name: /^Import$/ })).toBeEnabled();
    await modal.getByRole('button', { name: /^Import$/ }).click();
    await expect(page.locator('tr', { hasText: c1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('tr', { hasText: c2 })).toBeVisible();
    await expect(page.locator('tr', { hasText: c1 })).toContainText('Excel Gadget One');
    await expect(page.locator('tr', { hasText: c1 })).not.toContainText('skip me');
  });

  test('Bloomgard AI matches columns by their values, and asks before importing a column it is unsure about', async ({ page }) => {
    test.setTimeout(120_000);
    const c1 = `E2E-AI-${tag}-1`;
    const ws = XLSX.utils.aoa_to_sheet([
      ['Col A', 'Col B', 'Col C', 'Col D', 'Misc'],
      [c1, 'Stainless Hinge 4 inch', 'PCS', 42.5, 'x7'],
      [`E2E-AI-${tag}-2`, 'Brass Handle', 'PCS', 118, 'see note'],
      [`E2E-AI-${tag}-3`, 'Mild Steel Bracket', 'KG', 96, ''],
    ]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    await openApp(page);
    await openSetting(page, 'Master Data');
    await page.locator('input[type="file"]').setInputFiles({ name: 'unnamed.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
    const modal = page.getByText('Map Columns').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(modal.getByText(/Bloomgard AI is reading/)).toHaveCount(0, { timeout: 60_000 });
    const field = (h: string) => modal.getByLabel(`Field for ${h}`);
    // headers say nothing; the values do
    await expect(field('Col A')).toHaveValue('item_code');
    await expect(field('Col B')).toHaveValue('item_name');
    await expect(field('Col D')).toHaveValue('item_rate');
    // a column it cannot place confidently comes with a question, and Import waits for the answer
    const question = modal.locator('.bg-amber-50');
    if (await question.count()) {
      await expect(modal.getByRole('button', { name: /Answer \d+ question/ })).toBeDisabled();
      while (await question.count()) await question.first().getByRole('button').last().click();
    }
    await expect(modal.getByRole('button', { name: /^Import$/ })).toBeEnabled();
    await modal.getByRole('button', { name: 'Cancel' }).click();
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
