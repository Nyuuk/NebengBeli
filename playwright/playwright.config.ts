import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file or process.
 * NebengBeli Standalone Chromium-Only E2E Configuration.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://localhost:8088';
const API_URL = process.env.PLAYWRIGHT_API_URL || process.env.API_URL || 'http://localhost:8080';

export default defineConfig({
  testDir: './tests',
  /* Maximum time one test can run for. Generous enough to absorb the auth
   * rate-limit backoff (helpers/auth.ts) when multiple fixtures in one test
   * need to register/login against a shared-IP target in quick succession. */
  timeout: 45 * 1000,
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     */
    timeout: 5000,
  },
  /* Run tests in files in parallel or sequential depending on CI */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on same database to ensure ledger sequence determinism */
  workers: process.env.PLAYWRIGHT_WORKERS ? parseInt(process.env.PLAYWRIGHT_WORKERS, 10) : 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: BASE_URL,
    /* Allow untrusted local self-signed certificates for HTTPS runs */
    ignoreHTTPSErrors: true,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /* Context options */
    viewport: { width: 1280, height: 720 },
    timezoneId: 'Asia/Jakarta',
    locale: 'id-ID',
    extraHTTPHeaders: {
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  },

  /* Configure projects for Chromium only */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Explicitly use Chromium
        browserName: 'chromium',
      },
    },
  ],

  /* Output directory for test artifacts */
  outputDir: 'test-results',
});
