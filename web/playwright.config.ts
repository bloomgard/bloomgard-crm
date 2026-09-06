import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Pull Supabase keys + E2E_* creds from .env.local so tests and the dev server agree.
loadEnv({ path: '.env.local' });

// Use a dedicated port so we never collide with another project on :3000.
const PORT = process.env.E2E_PORT || '3010';
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS; // set when running against a Vercel preview

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    video: 'on',                 // every test produces a .webm — this is the walkthrough deliverable
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    ...(BYPASS
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } }
      : {}),
    launchOptions: {
      slowMo: Number(process.env.E2E_SLOWMO || 0), // e.g. 250 for calmer recordings
    },
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
    },
  ],

  // Only spin up a local dev server when targeting localhost.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
