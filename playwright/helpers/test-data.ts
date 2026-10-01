/**
 * Test data generators for isolated Playwright test runs.
 */

export const DEFAULT_PASSWORD = 'TestPassword123!';

export function generateId(prefix = 't'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `${prefix}_${timestamp}_${random}`;
}

export function generateUniqueUsername(prefix = 'user'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
}

export function generateUniqueWalletName(prefix = 'Buku'): string {
  return `${prefix} ${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
}

export function generateUniqueItemName(prefix = 'Jajan'): string {
  return `${prefix} ${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}
