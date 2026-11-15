import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup } from '../helpers/db';
import { runTag } from '../helpers/env';
import { makeQuote, TestQuote } from '../helpers/fixtures';
import { openAppFresh as openApp, go, openSetting } from './_app';

/**
 * Log modules end to end: switch one on in the Field Configurator, add entries from the quote viewer,
 * see a Status log move the quote's status, and count entries in the Home "Logs" stat.
 * The workspace's real form configuration is snapshotted and put back afterwards.
 */
test.describe.serial('Log modules', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  let actor: Actor; let tag: string; let q: TestQuote; let original: any;
  const cleanup = new Cleanup();
  const schema = async () => (await admin().from('tenant_schemas').select('schema_config').eq('tenant_id', actor.tenantId).single()).data!.schema_config as any[];

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag();
    original = await schema();
    q = await makeQuote(actor, cleanup, `${tag}-log`, { status: 'Inquiry' });
  });
  test.afterAll(async () => {
    await admin().from('tenant_schemas').update({ schema_config: original }).eq('tenant_id', actor.tenantId);
    await cleanup.run();
  });

  test('the configurator adds log modules from templates and saving keeps AI, agent and branding settings', async ({ page }) => {
    const specialBefore = original.filter((s: any) => s.is_ai_settings || s.is_agent_config || s.is_branding).length;
    await openApp(page);
    await openSetting(page, 'Field Configurator');
    await expect(page.getByText('All changes saved')).toBeVisible();
    for (const t of ['Action log', 'Status log']) {
      await page.getByRole('button', { name: 'Add module' }).click();
      await page.getByRole('button', { name: new RegExp(`^${t}`) }).click();
    }
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 15_000 });

    const after = await schema();
    const action = after.find((s: any) => s.title === 'Action Log');
    const status = after.find((s: any) => s.title === 'Status Log');
    expect(action?.is_log).toBe(true);
    expect(status?.is_log).toBe(true);
    expect(status.fields.find((f: any) => f.name === 'status').type).toBe('master_status');
    expect(after.filter((s: any) => s.is_ai_settings || s.is_agent_config || s.is_branding).length).toBe(specialBefore);
  });

  test('log modules stay out of the quote form', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Create quote' }).click();
    await expect(page.getByRole('heading', { name: /Create Entry/ })).toBeVisible();
    await expect(page.getByText('Action Log', { exact: true })).toHaveCount(0);
  });

  test('entries are added from the quote viewer, stamped with who and when', async ({ page }) => {
    await openApp(page);
    await go(page, 'Quotes');
    await page.getByText(q.qn, { exact: true }).first().click();
    const log = page.locator('[data-log-module="Action Log"]');
    await expect(log).toBeVisible();
    await expect(log).toContainText('No entries yet.');
    await log.getByRole('button', { name: 'Add entry' }).click();
    const addRow = log.locator('.log-add');
    await addRow.locator('label', { hasText: 'Action' }).locator('select').selectOption('Call');
    await addRow.locator('label', { hasText: 'Outcome' }).locator('select').selectOption('Positive');
    await addRow.locator('label', { hasText: 'Next step' }).locator('input').fill(`Send samples ${tag}`);
    await addRow.getByRole('button', { name: /Add to Action Log/ }).click();
    await expect(log.locator('tbody tr')).toHaveCount(1);
    await expect(log).toContainText(`Send samples ${tag}`);
    await expect(log).toContainText(actor.email);

    const meta = (await admin().from('quotations').select('custom_metadata').eq('id', q.id).single()).data!.custom_metadata as any;
    expect(meta['Action Log']).toHaveLength(1);
    expect(meta['Action Log'][0]).toMatchObject({ action: 'Call', outcome: 'Positive', _by: actor.email });
    expect(meta['Action Log'][0]._at).toBeTruthy();
  });

  test('a Status log entry moves the quote status and writes the status history', async ({ page }) => {
    await openApp(page);
    await go(page, 'Quotes');
    await page.getByText(q.qn, { exact: true }).first().click();
    const log = page.locator('[data-log-module="Status Log"]');
    await log.getByRole('button', { name: 'Add entry' }).click();
    const addRow = log.locator('.log-add');
    await addRow.locator('label', { hasText: 'Status' }).locator('select').selectOption('Approved');
    await addRow.locator('label', { hasText: 'Remark' }).locator('textarea').fill('PO received by email');
    await addRow.getByRole('button', { name: /Add to Status Log/ }).click();
    await expect(log.locator('tbody tr')).toHaveCount(1);
    await expect.poll(async () => (await admin().from('quotations').select('status').eq('id', q.id).single()).data!.status).toBe('Approved');
    const { data: hist } = await admin().from('status_logs').select('old_status, new_status').eq('quotation_id', q.id);
    expect(hist).toContainEqual({ old_status: 'Inquiry', new_status: 'Approved' });
  });

  test('Home has one Status & logs stat: pick a log module, then filter by its dropdowns', async ({ page }) => {
    await openApp(page);
    const box = page.getByLabel('Status and logs', { exact: true });
    await expect(box.getByRole('button', { name: 'Status or log' })).toBeVisible({ timeout: 30_000 });
    await expect(box.getByRole('button', { name: 'Status or log' })).toHaveText(/Quote status/); // status first: it is a log too
    await box.getByRole('button', { name: 'Status or log' }).click();
    await page.getByRole('option', { name: /^Action Log/ }).click();
    const total = Number(await box.locator('.agent-num').innerText());
    expect(total).toBeGreaterThanOrEqual(1);
    await box.getByRole('button', { name: 'Action filter' }).click();
    await page.getByRole('option', { name: /^Call/ }).click();
    const calls = Number(await box.locator('.agent-num').innerText());
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(calls).toBeLessThanOrEqual(total);
    await box.getByRole('button', { name: 'Action filter' }).click();
    await page.getByRole('option', { name: /^Visit/ }).click();
    await expect(box.locator('.agent-num')).toHaveText('0');
  });
});
