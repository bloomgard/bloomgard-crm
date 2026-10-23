import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, aiSettingsBackup } from '../helpers/db';
import { runTag } from '../helpers/env';
import { snapshotProfile } from '../helpers/fixtures';
import { openApp, openSetting, captureDialogs } from './_app';

test.describe.serial('Settings persist', () => {
  let actor: Actor;
  let tag: string;
  const cleanup = new Cleanup();

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag();
    await snapshotProfile(actor, cleanup);
    const backup = await aiSettingsBackup(actor.tenantId);
    cleanup.add(async () => admin().from('tenant_schemas').update({ schema_config: backup.schema_config }).eq('id', backup.id));
  });
  test.afterAll(async () => cleanup.run());

  test('Your Profile saves the identity the AI signs with', async ({ page }) => {
    const dialogs = captureDialogs(page);
    await openApp(page);
    await openSetting(page, 'Your Profile');
    await page.getByPlaceholder('e.g. Priya Sharma', { exact: true }).fill(`E2E Name ${tag}`);
    await page.getByPlaceholder('e.g. Sales Manager', { exact: true }).fill('E2E Title');
    await page.getByPlaceholder('e.g. +91 98765 43210', { exact: true }).fill('+91 90000 11111');
    await expect(page.getByText(actor.tenant.company_name).first()).toBeVisible();   // company comes from the workspace record
    await page.getByRole('button', { name: 'Save Profile' }).click();
    await expect.poll(() => dialogs.join('|')).toMatch(/Profile updated/);
    const { data } = await admin().from('profiles').select('full_name, job_title, phone').eq('id', actor.userId).single();
    expect(data).toEqual({ full_name: `E2E Name ${tag}`, job_title: 'E2E Title', phone: '+91 90000 11111' });
    await page.reload();
    await openApp(page);
    await openSetting(page, 'Your Profile');
    await expect(page.getByPlaceholder('e.g. Priya Sharma', { exact: true })).toHaveValue(`E2E Name ${tag}`);
  });

  test('Email Settings saves a personal forwarding address', async ({ page }) => {
    const dialogs = captureDialogs(page);
    await openApp(page);
    await openSetting(page, 'Email Settings');
    await page.getByPlaceholder('your-name').fill(`E2E-Fwd_${tag}!`);                 // the field keeps only a-z, 0-9 and hyphens
    await page.getByRole('button', { name: 'Save Routing Address' }).click();
    await expect.poll(() => dialogs.join('|')).toMatch(/Routing Slug updated/);
    const { data } = await admin().from('profiles').select('inbound_email').eq('id', actor.userId).single();
    expect(data!.inbound_email).toBe(`e2e-fwd${tag}@inbound.bloomgard.co`);
  });

  test('AI Settings saves tone, instructions and routing rules', async ({ page }) => {
    const dialogs = captureDialogs(page);
    await openApp(page);
    await openSetting(page, 'AI Settings');
    await page.locator('select').nth(0).selectOption('Friendly');
    await page.getByPlaceholder(/Provide specific instructions/).fill(`E2E instruction ${tag}`);
    await page.getByRole('button', { name: '+ Add Rule' }).click();
    await page.getByRole('button', { name: /Save AI Settings/ }).click();
    await expect.poll(() => dialogs.join('|'), { timeout: 20_000 }).toMatch(/saved|updated|success/i);
    const { data } = await admin().from('tenant_schemas').select('schema_config').eq('tenant_id', actor.tenantId).single();
    const ai = (data!.schema_config as any[]).find((s) => s.is_ai_settings);
    expect(ai.tone).toBe('Friendly');
    expect(ai.instructions).toBe(`E2E instruction ${tag}`);
    expect(Array.isArray(ai.emailRouting)).toBe(true);
    expect(ai.emailRouting.length).toBeGreaterThan(0);
    // the blueprint sections must survive an AI-settings save untouched
    expect((data!.schema_config as any[]).filter((s) => !s.is_ai_settings).length).toBeGreaterThan(1);
  });
});
