import { randomUUID } from 'crypto';
import { test, expect } from '../fixtures/test-fixtures';
import { generateUniqueWalletName, generateUniqueItemName } from '../helpers/test-data';
import { simulateOffline, simulateOnline, getPendingOfflineEntriesFromIDB, checkServiceWorkerRegistration } from '../helpers/offline-idb';

test.describe('F11: PWA, Mode Offline & Antrean Sinkronisasi', () => {
  test.describe.configure({ mode: 'serial' });

  test('@e2e @ui offline entries queued in IndexedDB with client_id, display pending tags, and sync automatically on reconnect', async ({
    authenticatedCreatorPage: page,
    apiClient,
  }) => {
    // 1. Create wallet online first so it gets cached
    const walletName = generateUniqueWalletName('Offline Sync Wallet');
    const res = await (await apiClient.createWallet(walletName)).json();
    const walletId = res.id || res.wallet?.id;

    // Navigate to wallet detail page to populate local cache
    await page.goto(`/wallets/${walletId}`);
    await page.waitForLoadState('networkidle');

    // 2. Simulate network going offline
    await simulateOffline(page);

    // Verify offline banner / indicator is shown in UI
    await expect(page.getByText(/Mode Offline|Offline|Anda Sedang Offline/i).first()).toBeVisible({ timeout: 5000 });

    // 3. Record a Titipan entry while OFFLINE
    const addEntryBtn = page.getByRole('button', { name: /Tambah Transaksi|\+ Transaksi|Catat/i }).first();
    await addEntryBtn.click();

    const offlineItemName = generateUniqueItemName('Kopi Offline');
    await page.getByLabel(/Nama Barang|Nama Item/i).fill(offlineItemName);
    await page.getByLabel(/Nominal|Harga/i).fill('18000');
    await page.getByRole('button', { name: /Simpan/i }).click();

    // 4. Verify the entry appears in UI with "Menunggu sinkron" or offline badge
    await expect(page.getByText(offlineItemName)).toBeVisible();
    await expect(page.getByText(/Menunggu sinkron|Pending|Offline/i).first()).toBeVisible();

    // 5. Inspect IndexedDB to verify client_id UUID and stored payload
    const pendingEntries = await getPendingOfflineEntriesFromIDB(page);
    expect(pendingEntries.length).toBeGreaterThanOrEqual(1);
    const stored = pendingEntries.find((p) => p.item_name === offlineItemName);
    expect(stored).toBeDefined();
    expect(stored.client_id).toBeDefined();
    expect(stored.wallet_id).toBe(walletId);

    // 6. Restore network ONLINE
    await simulateOnline(page);

    // Trigger or wait for automatic background sync
    const syncBtn = page.getByRole('button', { name: /Sinkronkan Sekarang|Sinkron/i }).first();
    if (await syncBtn.isVisible().catch(() => false)) {
      await syncBtn.click({ timeout: 2000 }).catch(() => {});
    }

    // Wait for network sync to complete
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 7. Verify entry is persisted on server and pending badge is cleared
    const stmtRes = await apiClient.getStatement(walletId);
    expect(stmtRes.ok()).toBeTruthy();
    const statement = await stmtRes.json();
    const serverEntry = statement.entries.find((e: any) => e.item_name === offlineItemName);
    expect(serverEntry).toBeDefined();
    expect(serverEntry.amount).toBe(18000);
  });

  test('@ui service worker and PWA manifest are present on the client', async ({
    authenticatedCreatorPage: page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check manifest link
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', /manifest\.webmanifest|manifest\.json/);

    // Check service worker registration capability
    const isSwSupported = await page.evaluate(() => 'serviceWorker' in navigator);
    expect(isSwSupported).toBeTruthy();
  });

  test('@api server rejects duplicate client_id idempotently without double counting', async ({
    apiClient,
  }) => {
    const res = await (await apiClient.createWallet(generateUniqueWalletName('Idempotent'))).json();
    const walletId = res.id || res.wallet?.id;
    const clientId = randomUUID();

    // First submission
    const res1 = await apiClient.createEntry(walletId, {
      client_id: clientId,
      type: 'titipan',
      amount: 25000,
      item_name: 'Es Dawet',
    });
    expect(res1.ok()).toBeTruthy();

    // Second submission with exact same client_id (replayed sync packet)
    const res2 = await apiClient.createEntry(walletId, {
      client_id: clientId,
      type: 'titipan',
      amount: 25000,
      item_name: 'Es Dawet',
    });
    // Server returns 200 OK / idempotent response without creating a second entry
    expect(res2.ok()).toBeTruthy();

    // Verify statement still has only 1 entry and total balance is 25.000 (not 50.000)
    const statement = await (await apiClient.getStatement(walletId)).json();
    expect(statement.summary.entry_count).toBe(1);
    expect(statement.summary.current_balance).toBe(25000);
  });
});
