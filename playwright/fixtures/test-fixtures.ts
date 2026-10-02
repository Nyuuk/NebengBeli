import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { generateUniqueUsername, DEFAULT_PASSWORD } from '../helpers/test-data';
import { registerUser, loginUser, loginViaUI } from '../helpers/auth';

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://localhost:8088';
export const API_URL = process.env.PLAYWRIGHT_API_URL || process.env.API_URL || 'http://localhost:8080';

export interface TestUser {
  username: string;
  password: string;
  userId?: string;
  role?: string;
}

export interface ExtendedFixtures {
  apiClient: ApiClient;
  creatorUser: TestUser;
  ownerUser: TestUser;
  authenticatedCreatorPage: Page;
  authenticatedOwnerPage: Page;
}

/**
 * Configure route forwarding for API requests from the static frontend origin to the backend.
 * This preserves production static-only Nginx without requiring backend proxy directives in Nginx.
 */
export async function setupApiRouting(context: BrowserContext, apiUrl = API_URL) {
  await context.route('**/api/**', async (route, req) => {
    const url = new URL(req.url());
    const targetUrl = `${apiUrl}${url.pathname}${url.search}`;
    try {
      const response = await route.fetch({
        url: targetUrl,
        method: req.method(),
        headers: req.headers(),
        postData: req.postDataBuffer(),
      });
      await route.fulfill({ response });
    } catch {
      // The underlying request can already be settled (e.g. page navigated away
      // mid-flight during offline/online toggling in F11 tests), in which case
      // the route is no longer ours to resolve.
      await route.abort().catch(() => {});
    }
  });
}

export const test = base.extend<ExtendedFixtures>({
  context: async ({ browser }, use) => {
    const context = await browser.newContext();
    await setupApiRouting(context);
    await use(context);
    await context.close();
  },

  creatorUser: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({ baseURL: API_URL });
    const username = generateUniqueUsername('creator');
    const password = DEFAULT_PASSWORD;
    const regRes = await registerUser(request, username, password);
    if (!regRes.success) {
      throw new Error(`Failed to register creator user: ${regRes.error}`);
    }
    const loginRes = await loginUser(request, username, password);
    await use({
      username,
      password,
      userId: loginRes.user?.id || regRes.user?.id,
      role: 'user',
    });
    await request.dispose();
  },

  apiClient: async ({ playwright, creatorUser }, use) => {
    const request = await playwright.request.newContext({ baseURL: API_URL });
    await loginUser(request, creatorUser.username, creatorUser.password);
    const client = new ApiClient(request);
    await use(client);
    await request.dispose();
  },

  ownerUser: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({ baseURL: API_URL });
    const username = generateUniqueUsername('owner');
    const password = DEFAULT_PASSWORD;
    const regRes = await registerUser(request, username, password);
    if (!regRes.success) {
      throw new Error(`Failed to register owner user: ${regRes.error}`);
    }
    const loginRes = await loginUser(request, username, password);
    await use({
      username,
      password,
      userId: loginRes.user?.id || regRes.user?.id,
      role: 'user',
    });
    await request.dispose();
  },

  authenticatedCreatorPage: async ({ browser, creatorUser }, use) => {
    const context = await browser.newContext();
    await setupApiRouting(context);
    const page = await context.newPage();
    await loginViaUI(page, creatorUser.username, creatorUser.password);
    await use(page);
    await context.close();
  },

  authenticatedOwnerPage: async ({ browser, ownerUser }, use) => {
    const context = await browser.newContext();
    await setupApiRouting(context);
    const page = await context.newPage();
    await loginViaUI(page, ownerUser.username, ownerUser.password);
    await use(page);
    await context.close();
  },
});

export { expect };
