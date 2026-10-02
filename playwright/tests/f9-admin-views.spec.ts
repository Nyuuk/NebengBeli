import { test, expect, setupApiRouting, API_URL } from '../fixtures/test-fixtures';
import { generateUniqueUsername, DEFAULT_PASSWORD } from '../helpers/test-data';
import { loginViaUI } from '../helpers/auth';
import { ensureAdminUserCLI, seedDevFixtures, getDevStatus } from '../helpers/dev-fixtures';

// Against a deployed environment (no /api/dev/* routes), an admin account must already exist
// (created out-of-band via the CLI, per PRD F10) and is supplied through env vars.
const adminUsername = process.env.E2E_ADMIN_USERNAME || 'test_admin';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || DEFAULT_PASSWORD;

test.describe('F9: Admin Panel & Read-Only Dashboard', () => {
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: API_URL });
    const devStatus = await getDevStatus(request);
    if (devStatus.enabled) {
      // Local/dev stack: seed a known admin account via dev-only fixtures.
      await seedDevFixtures(request, 'standard', adminPassword);
      ensureAdminUserCLI(adminUsername, adminPassword);
    }
    await request.dispose();
  });

  test('@e2e @ui admin views read-only metrics, user list, wallet list, transactions, and resets user password', async ({
    browser,
    playwright,
  }) => {
    // 1. Create a target user whose password will be reset by admin
    const targetUsername = generateUniqueUsername('target_user');
    const regReq = await playwright.request.newContext({ baseURL: API_URL });
    await regReq.post('/api/auth/register', {
      data: { username: targetUsername, password: DEFAULT_PASSWORD },
    });
    await regReq.dispose();

    // 2. Admin logs in via UI
    const context = await browser.newContext();
    await setupApiRouting(context);
    const page = await context.newPage();
    await loginViaUI(page, adminUsername, adminPassword);

    // 3. Navigate to /admin
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /Admin/i }).first()).toBeVisible();

    // 4. Verify Summary Cards (Total Pengguna, Total Dompet, Total Transaksi)
    await expect(page.getByText(/Total Pengguna|Users/i).first()).toBeVisible();
    await expect(page.getByText(/Total Dompet|Wallets/i).first()).toBeVisible();

    // 5. Verify User List in Users Tab
    await expect(page.getByText(targetUsername)).toBeVisible();

    // 6. Reset target user password via Admin UI
    const userRow = page.locator(`tr:has-text("${targetUsername}")`).first();
    const resetBtn = userRow.getByRole('button', { name: /Reset Password|Reset/i }).first();
    await resetBtn.click();

    const resetDialog = page.getByRole('dialog');
    await expect(resetDialog).toBeVisible();

    const newAdminSetPassword = 'NewSecretPassword123!';
    await resetDialog.getByLabel(/Password Baru|Kata Sandi Baru/i).fill(newAdminSetPassword);
    await resetDialog.getByRole('button', { name: /Simpan Password Baru|Reset|Simpan/i }).click();

    await expect(resetDialog).not.toBeVisible();
    await context.close();

    // 7. Verify target user can now login with the new password
    const targetContext = await browser.newContext();
    await setupApiRouting(targetContext);
    const targetPage = await targetContext.newPage();
    await loginViaUI(targetPage, targetUsername, newAdminSetPassword);
    await expect(targetPage).toHaveURL(/\/$|\/wallets/);
    await targetContext.close();
  });

  test('@api regular users are strictly forbidden from accessing admin endpoints', async ({
    playwright,
    creatorUser,
  }) => {
    const userReq = await playwright.request.newContext({ baseURL: API_URL });
    await userReq.post('/api/auth/login', {
      data: { username: creatorUser.username, password: creatorUser.password },
    });

    const adminRes = await userReq.get('/api/admin/users');
    expect(adminRes.status()).toBe(403);

    const statsRes = await userReq.get('/api/admin/stats');
    expect(statsRes.status()).toBe(403);

    await userReq.dispose();
  });
});
