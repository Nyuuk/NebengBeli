import { defineConfig } from '@playwright/test';

// Frontend-only layout tests: no backend, credentials, or production routes.
const port = Number(process.env.MOBILE_TABS_PORT || 5187);
export default defineConfig({
  testDir: './local-tests',
  testMatch: 'mobile-tabs.local.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: 'list',
  outputDir: process.env.MOBILE_TABS_EVIDENCE || './test-results/mobile-tabs',
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: `npm --prefix ../frontend run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
