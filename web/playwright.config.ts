import { defineConfig, devices } from '@playwright/test';
import { ENV, protectionHeaders } from './e2e/helpers/env';

// All secrets and targets come from web/.env.local (see .env.example).
const BASE_URL = ENV.baseUrl;
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL);
const PORT = new URL(BASE_URL).port || '3011';
const AUTH_FILE = 'e2e/.auth/user.json';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    video: process.env.E2E_VIDEO === 'off' ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    extraHTTPHeaders: protectionHeaders(),
    launchOptions: { slowMo: Number(process.env.E2E_SLOWMO || 0) },
  },

  projects: [
    { name: 'setup', testDir: './e2e/setup', testMatch: /auth\.setup\.ts/ },
    // Backend: email in/out, AI drafts, master data, quote creation. No browser.
    { name: 'api', testDir: './e2e/api' },
    // Browser flows, signed in as the E2E account.
    {
      name: 'ui', testDir: './e2e/ui', dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
    },
    // Narrated client demos and the recorded walkthrough (always record video).
    {
      name: 'demo', testDir: './e2e/demo', dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE, video: 'on' },
    },
  ],

  // Serve the production build locally unless pointed at a deployed URL.
  webServer: isLocal
    ? { command: `npx next start -p ${PORT}`, url: BASE_URL, timeout: 120_000, reuseExistingServer: true }
    : undefined,
});
