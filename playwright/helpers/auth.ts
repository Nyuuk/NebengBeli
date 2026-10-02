import { Page, APIRequestContext, expect } from '@playwright/test';
import { DEFAULT_PASSWORD } from './test-data';

export interface AuthSession {
  username: string;
  userId?: string;
  role?: string;
  tokenExpiresAt?: string;
}

/**
 * Auth endpoints are intentionally IP-rate-limited per the PRD (anti brute-force on
 * register/login). Against a shared-IP target (CI runner, or this whole suite hitting
 * a remote deployment), that limit is easy to hit purely from test volume. Retry with
 * backoff on 429 instead of weakening the limiter or failing the test on it.
 */
async function withRateLimitRetry<T extends { status: () => number }>(
  send: () => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  let res = await send();
  for (let attempt = 1; res.status() === 429 && attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, attempt * 1500));
    res = await send();
  }
  return res;
}

/**
 * Register a user via backend API using standard auth flow.
 */
export async function registerUser(
  request: APIRequestContext,
  username: string,
  password = DEFAULT_PASSWORD
): Promise<{ success: boolean; user?: any; error?: string }> {
  const res = await withRateLimitRetry(() =>
    request.post('/api/auth/register', {
      data: {
        username,
        password,
      },
    })
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok()) {
    return { success: false, error: body.error || `HTTP ${res.status()}` };
  }
  return { success: true, user: body.user };
}

/**
 * Login a user via backend API. Sets the auth cookie on the request context.
 */
export async function loginUser(
  request: APIRequestContext,
  username: string,
  password = DEFAULT_PASSWORD
): Promise<{ success: boolean; user?: any; expiresAt?: string; error?: string }> {
  const res = await withRateLimitRetry(() =>
    request.post('/api/auth/login', {
      data: {
        username,
        password,
      },
    })
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok()) {
    return { success: false, error: body.error || `HTTP ${res.status()}` };
  }
  return { success: true, user: body.user, expiresAt: body.expires_at };
}

/**
 * Register a new user via UI.
 */
export async function registerViaUI(
  page: Page,
  username: string,
  password = DEFAULT_PASSWORD
): Promise<void> {
  await page.goto('/register');
  await page.waitForLoadState('networkidle');

  // Fill in registration form
  await page.getByLabel(/Username/i).fill(username);
  const passwordInputs = page.locator('input[type="password"]');
  await passwordInputs.nth(0).fill(password);
  await passwordInputs.nth(1).fill(password);

  // Submit
  await page.getByRole('button', { name: /daftar|register/i }).click();

  // Wait for redirect to dashboard or login
  await expect(page).toHaveURL(/(\/|\/login)/, { timeout: 10000 });
}

/**
 * Login via UI with normal credentials flow.
 */
export async function loginViaUI(
  page: Page,
  username: string,
  password = DEFAULT_PASSWORD
): Promise<void> {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.getByLabel(/Username/i).fill(username);
  await page.locator('input[type="password"]').fill(password);

  await page.getByRole('button', { name: /masuk|login/i }).click();

  // Verify successful redirection to home/dashboard
  await expect(page).toHaveURL(/\/$|\/wallets/, { timeout: 10000 });
}

/**
 * Logout via UI navbar.
 */
export async function logoutViaUI(page: Page): Promise<void> {
  // Click user chip/avatar to open menu
  const userMenuTrigger = page.locator('header').locator('.MuiChip-root').first();
  await userMenuTrigger.click();

  // Click logout menu item
  const logoutItem = page.getByRole('menuitem', { name: /logout|keluar/i });
  await logoutItem.click();

  // Should redirect to login page
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
}

/**
 * Change self password via UI.
 */
export async function changePasswordViaUI(
  page: Page,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await page.goto('/change-password');
  await page.waitForLoadState('networkidle');

  const pwInputs = page.locator('input[type="password"]');
  await pwInputs.nth(0).fill(currentPassword);
  await pwInputs.nth(1).fill(newPassword);
  await pwInputs.nth(2).fill(newPassword);

  await page.getByRole('button', { name: /Simpan Kata Sandi|Change Password/i }).click();
}
