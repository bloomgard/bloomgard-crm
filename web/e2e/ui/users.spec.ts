import { test, expect } from '@playwright/test';
import { admin } from '../helpers/db';
import { runTag } from '../helpers/env';
import { openAppFresh as openApp, openSetting } from './_app';

test.use({ storageState: { cookies: [], origins: [] } }); // own session: signs in fresh

/** User Access: add a teammate without typing a password, see the generated one once, then remove them. */
test('User Access adds a teammate with a generated password and lists them', async ({ page }) => {
  const tag = runTag();
  const email = `e2e-team-${tag}@e2e-${tag}.test`;
  try {
    await openApp(page);
    await openSetting(page, 'User Access');
    await expect(page.getByRole('heading', { name: 'User Access' })).toBeVisible();
    const box = page.getByTestId('user-access');
    await box.getByLabel('Email').fill(email);
    await box.getByLabel('Name').fill('Team Mate');
    await box.getByLabel('Role').selectOption('manager');
    await box.getByRole('button', { name: 'Add user' }).click();
    const secret = box.locator('.agent-secret');
    await expect(secret).toContainText(email, { timeout: 20_000 });
    expect((await secret.locator('code').innerText()).length).toBeGreaterThanOrEqual(12);
    await expect(box.locator('tr', { hasText: 'Team Mate' })).toBeVisible({ timeout: 15_000 });
    const { data } = await admin().from('profiles').select('role, full_name').eq('email', email).single();
    expect(data).toEqual({ role: 'manager', full_name: 'Team Mate' });
  } finally {
    const { data } = await admin().from('profiles').select('id').eq('email', email).maybeSingle();
    if (data) { await admin().from('profiles').delete().eq('id', data.id); await admin().auth.admin.deleteUser(data.id).catch(() => {}); }
  }
});
