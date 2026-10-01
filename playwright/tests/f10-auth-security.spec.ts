import { test, expect, setupApiRouting, API_URL } from '../fixtures/test-fixtures';
import { generateUniqueUsername, generateUniqueWalletName, DEFAULT_PASSWORD } from '../helpers/test-data';
import { registerViaUI, loginViaUI, logoutViaUI, changePasswordViaUI } from '../helpers/auth';

test.describe('F10: Akun, Autentikasi & Keamanan Sesi', () => {
  test.describe.configure({ mode: 'serial' });

  test('@e2e @ui user registers, logs in, changes self password, and old session is revoked', async ({
    browser,
  }) => {
    const username = generateUniqueUsername('auth_user');
    const oldPassword = 'OldPassword123!';
    const newPassword = 'NewPassword456!';

    // 1. Register via UI
    const context1 = await browser.newContext();
    await setupApiRouting(context1);
    const page1 = await context1.newPage();
    await registerViaUI(page1, username, oldPassword);

    // 2. Open a second session for the same user
    const context2 = await browser.newContext();
    await setupApiRouting(context2);
    const page2 = await context2.newPage();
    await loginViaUI(page2, username, oldPassword);
    await expect(page2.getByText(username)).toBeVisible();

    // 3. User changes self password on page 1
    await page1.goto('/change-password');
    await page1.waitForLoadState('networkidle');
    await changePasswordViaUI(page1, oldPassword, newPassword);

    // Page 1 redirects to login upon password change
    await expect(page1).toHaveURL(/\/login/, { timeout: 10000 });

    // 4. Verify second session on page 2 is immediately revoked on next request
    await page2.goto('/');
    // Protected route / API middleware rejects old token_version and redirects to /login
    await expect(page2).toHaveURL(/\/login/, { timeout: 10000 });

    // 5. Verify user can log in with new password
    await loginViaUI(page1, username, newPassword);
    await expect(page1.getByText(username)).toBeVisible();

    // 6. Test Logout flow
    await logoutViaUI(page1);

    await context1.close();
    await context2.close();
  });

  test('@api registration cannot create admin role directly', async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({ baseURL: API_URL });
    const maliciousUsername = generateUniqueUsername('hacker');
    const res = await request.post('/api/auth/register', {
      data: {
        username: maliciousUsername,
        password: DEFAULT_PASSWORD,
        role: 'admin', // Attempt privilege escalation
      },
    });

    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    // Must be assigned 'user' role regardless of request payload
    expect(data.user.role).toBe('user');
    await request.dispose();
  });

  test('@api token renewal succeeds with valid active token', async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({ baseURL: API_URL });
    const username = generateUniqueUsername('renew_user');
    await request.post('/api/auth/register', {
      data: { username, password: DEFAULT_PASSWORD },
    });
    await request.post('/api/auth/login', {
      data: { username, password: DEFAULT_PASSWORD },
    });

    // Call renew
    const renewRes = await request.post('/api/auth/renew');
    expect(renewRes.ok()).toBeTruthy();
    const body = await renewRes.json();
    expect(body.expires_at).toBeDefined();
    await request.dispose();
  });

  test('@ui input text fields escape HTML/script payloads safely without executing XSS', async ({
    authenticatedCreatorPage: page,
    apiClient,
  }) => {
    const xssPayload = `<script>window.__xss_flag=true</script><img src=x onerror="window.__xss_img=true" />`;
    const walletName = generateUniqueWalletName('XSS Test');
    const res = await (await apiClient.createWallet(walletName)).json();
    const walletId = res.id || res.wallet?.id;

    // Seed entry with XSS payload
    await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: 10000,
      item_name: `Es Cincau ${xssPayload}`,
      note: `Catatan ${xssPayload}`,
    });

    await page.goto(`/wallets/${walletId}`);
    await page.waitForLoadState('networkidle');

    // Verify script payload was NOT executed
    const xssFlag = await page.evaluate(() => (window as any).__xss_flag);
    const xssImg = await page.evaluate(() => (window as any).__xss_img);
    expect(xssFlag).toBeUndefined();
    expect(xssImg).toBeUndefined();
  });
});
