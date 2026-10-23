import { test, expect } from '@playwright/test';
import { openApp, go, openSetting, pageErrors } from './_app';

const DOCS = 'https://docs.bloomgard.co/crm/';

test.describe('In-app help', () => {
  test('Settings has a Docs row that points at the docs site', async ({ page }) => {
    await openApp(page);
    await go(page, 'Settings');
    const row = page.getByRole('link', { name: /^Docs Guides/ });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('href', DOCS);
    await expect(row).toHaveAttribute('target', '_blank');
  });

  test('every view and every settings screen has a Docs link to its own guide', async ({ page }) => {
    const errors = pageErrors(page);
    await openApp(page);
    const views: Array<[string, string]> = [
      ['Dashboard', 'ai/dashboard-and-copilot/'], ['Quotes', 'sales/quotes/'], ['Inbox', 'email/inbox/'],
      ['Follow ups', 'sales/follow-ups/'], ['Lead Gen', 'sales/lead-gen/'], ['Docs', 'sales/quotes/#pdf-export-and-the-document-library'],
      ['Settings', 'configuration/settings/'],
    ];
    for (const [view, href] of views) {
      await go(page, view);
      const hint = page.getByTestId('help-hint');
      await expect(hint, `${view} has no help hint`).toBeVisible();
      await expect(hint).toHaveAttribute('href', DOCS + href);
    }
    const screens: Array<[string, string]> = [
      ['Your Profile', 'configuration/settings/#your-profile'], ['Master Data', 'sales/master-data/'],
      ['User Access', 'configuration/settings/#user-access'], ['Field Configurator', 'configuration/settings/#field-configurator'],
      ['Email Settings', 'email/email-setup/'], ['Personalization', 'configuration/settings/#personalization'],
      ['AI Settings', 'ai/ai-assistant/#ai-settings-managersadmins'], ['Quote Template', 'configuration/settings/#quote-template'],
    ];
    for (const [title, href] of screens) {
      await openSetting(page, title);
      const hint = page.getByTestId('help-hint');
      await expect(hint, `${title} has no help hint`).toBeVisible();
      await expect(hint).toHaveAttribute('href', DOCS + href);
    }
    await page.locator('nav').getByText('Bloomgard AI').click();
    await expect(page.getByTestId('help-hint')).toHaveAttribute('href', DOCS + 'ai/dashboard-and-copilot/#bloomgard-ai-chat-assistant');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the favicon is served', async ({ request, baseURL }) => {
    for (const path of ['/favicon.ico', '/icon.svg', '/icon.png', '/apple-icon.png']) {
      const res = await request.get(`${baseURL}${path}`);
      expect(res.status(), path).toBe(200);
    }
  });
});
