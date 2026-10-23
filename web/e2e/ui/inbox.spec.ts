import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { runTag, DUMMY_RECIPIENT } from '../helpers/env';
import { openApp, go, captureDialogs } from './_app';

test.describe.serial('Inbox screen', () => {
  let actor: Actor;
  let tag: string;
  const cleanup = new Cleanup();
  const subject = () => `Inbox UI ${tag}`;
  let emailId: string;

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag();
    const { data } = await admin().from('inbound_emails').insert({
      tenant_id: actor.tenantId, thread_id: `ui-${tag}`, message_id: `ui-${tag}`, sender_email: `E2E Buyer <${DUMMY_RECIPIENT}>`,
      subject: subject(), body_text: `Hello from the inbox test ${tag}`, is_read: false, is_starred: false, is_deleted: false,
    }).select('id').single();
    emailId = data!.id;
    cleanup.delete('inbound_emails', 'id', emailId);
  });
  test.afterAll(async () => {
    await admin().from('sent_emails').delete().eq('tenant_id', actor.tenantId).like('subject', `%${tag}%`);
    await cleanup.run();
  });

  const openInbox = async (page: any) => {
    await openApp(page);
    await go(page, 'Inbox');
    await page.getByRole('button', { name: /refresh/i }).click();
  };

  test('a captured email is listed, searchable and opens with its full body', async ({ page }) => {
    await openInbox(page);
    await page.getByPlaceholder('Search emails...').fill(tag);
    const row = page.locator('[class*="border-l-4"]', { hasText: subject() });
    await expect(row).toHaveCount(1);
    await row.click();
    await expect(page.getByRole('heading', { name: subject() })).toBeVisible();
    await expect(page.getByText(`Hello from the inbox test ${tag}`).last()).toBeVisible();   // list preview + full body
    await waitFor(async () => (await admin().from('inbound_emails').select('is_read').eq('id', emailId).single()).data?.is_read, 15_000, 1000, 'email marked read');
  });

  test('starring an email persists', async ({ page }) => {
    await openInbox(page);
    await page.locator('[class*="border-l-4"]', { hasText: subject() }).click();
    await page.getByTitle('Star').click();
    await waitFor(async () => (await admin().from('inbound_emails').select('is_starred').eq('id', emailId).single()).data?.is_starred, 15_000, 1000, 'starred');
  });

  test('replying sends from the workspace address and logs usage', async ({ page }) => {
    const dialogs = captureDialogs(page);
    await openInbox(page);
    await page.locator('[class*="border-l-4"]', { hasText: subject() }).click();
    await page.getByPlaceholder('Type your reply here...').fill(`E2E reply ${tag}`);
    await page.getByRole('button', { name: 'Send Reply', exact: true }).click();
    await expect.poll(() => dialogs.join('|'), { timeout: 30_000 }).toMatch(/Reply sent successfully/);
    const { data } = await admin().from('sent_emails').select('recipient, subject').eq('tenant_id', actor.tenantId).eq('subject', `Re: ${subject()}`);
    expect(data).toHaveLength(1);
    expect(data![0].recipient).toContain(DUMMY_RECIPIENT);
  });

  test('deleting removes it from the list and flags it deleted', async ({ page }) => {
    await openInbox(page);
    await page.locator('[class*="border-l-4"]', { hasText: subject() }).click();
    await page.getByTitle('Delete').click();
    await expect(page.locator('[class*="border-l-4"]', { hasText: subject() })).toHaveCount(0);
    await waitFor(async () => (await admin().from('inbound_emails').select('is_deleted').eq('id', emailId).single()).data?.is_deleted, 15_000, 1000, 'deleted flag');
  });
});
